const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const noteRoutes = require('./routes/notes');
const configRoutes = require('./routes/config');
const { checkOngoingSessions } = require('./services/sessionService');
const { verifyWebrtcToken } = require('./services/webrtcTokenService');
const { canJoinSession } = require('./utils/sessionJoin');
const Session = require('./models/Session');

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

function normalizeId(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (value._id) {
        return value._id.toString();
    }

    if (value.id) {
        return value.id.toString();
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
        return value.toString();
    }

    return null;
}

function sessionIncludesUser(session, userId) {
    if (!session || !userId) {
        return false;
    }

    const normalizedTarget = userId.toString();
    if (session.creator && normalizeId(session.creator) === normalizedTarget) {
        return true;
    }

    const participants = Array.isArray(session.participants) ? session.participants : [];
    return participants.some(participant => {
        if (!participant) {
            return false;
        }

        if (participant.user) {
            return normalizeId(participant.user) === normalizedTarget;
        }

        return normalizeId(participant) === normalizedTarget;
    });
}

const sessionPeerMap = new Map();

function getSessionRoom(sessionId) {
    return `session:${sessionId}`;
}

function handleSocketLeave(socket) {
    if (!socket || !socket.data || !socket.data.sessionId) {
        return;
    }

    const sessionId = socket.data.sessionId;
    const room = getSessionRoom(sessionId);
    socket.leave(room);

    const peers = sessionPeerMap.get(sessionId);
    if (!peers) {
        return;
    }

    const peerInfo = peers.get(socket.id);
    peers.delete(socket.id);

    if (peers.size === 0) {
        sessionPeerMap.delete(sessionId);
    }

    socket.to(room).emit('webrtc-peer-left', {
        socketId: socket.id,
        userId: peerInfo ? peerInfo.userId : null
    });
}

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) {
            return next(new Error('AUTH_REQUIRED'));
        }

        const payload = verifyWebrtcToken(token);
        const session = await Session.findById(payload.sessionId)
            .populate('participants.user', '_id')
            .populate('creator', '_id');

        if (!session) {
            return next(new Error('SESSION_NOT_FOUND'));
        }

        if (!sessionIncludesUser(session, payload.userId)) {
            return next(new Error('NOT_ENROLLED'));
        }

        if (!canJoinSession(session)) {
            return next(new Error('JOIN_UNAVAILABLE'));
        }

        socket.data.sessionId = session._id.toString();
        socket.data.userId = payload.userId.toString();
        socket.data.name = payload.name || 'Participant';
        socket.data.sessionTopic = session.topic;

        next();
    } catch (error) {
        console.error('Socket authentication failed:', error);
        next(new Error('AUTH_FAILED'));
    }
});

io.on('connection', (socket) => {
    const { sessionId, userId, name } = socket.data || {};

    if (!sessionId || !userId) {
        socket.disconnect(true);
        return;
    }

    const room = getSessionRoom(sessionId);
    socket.join(room);

    const peers = sessionPeerMap.get(sessionId) || new Map();
    const peerInfo = {
        userId,
        name: name || 'Participant'
    };
    peers.set(socket.id, peerInfo);
    sessionPeerMap.set(sessionId, peers);

    const existingPeers = Array.from(peers.entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, info]) => ({
            socketId: id,
            userId: info.userId,
            name: info.name
        }));

    socket.emit('webrtc-peers', existingPeers);

    socket.to(room).emit('webrtc-peer-joined', {
        socketId: socket.id,
        userId,
        name: peerInfo.name
    });

    socket.on('webrtc-signal', ({ target, data }) => {
        if (!target) {
            return;
        }

        io.to(target).emit('webrtc-signal', {
            socketId: socket.id,
            data
        });
    });

    socket.on('leave-session', () => {
        handleSocketLeave(socket);
        socket.disconnect(true);
    });

    socket.on('disconnect', () => {
        handleSocketLeave(socket);
    });
});

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            frameSrc: ["'self'"]
        }
    }
}));


// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.'
    }
});
app.use('/api/', limiter);

// Auth-specific rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 auth requests per windowMs (increased for testing)
    message: {
        error: 'Too many authentication attempts, please try again later.'
    }
});

// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5050',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware
app.use(morgan('combined'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/feynman-learn', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(async () => {
    console.log('Connected to MongoDB');

    // Check if we need to seed the database
    try {
        const sessionCount = await Session.countDocuments();

        if (sessionCount === 0) {
            console.log('No sessions found, seeding database...');
            const { seedDatabase } = require('./scripts/seed');
            await seedDatabase();
            console.log('Database seeded successfully');
        } else {
            console.log(`Found ${sessionCount} existing sessions`);
        }
    } catch (error) {
        console.error('Error checking/seeding database:', error);
    }
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/chats', chatRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/config', configRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve frontend for non-API routes (must be after API routes)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

// Session notification cron job - runs every minute
cron.schedule('* * * * *', async () => {
    try {
        await checkOngoingSessions();
    } catch (error) {
        console.error('Error checking ongoing sessions:', error);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.errors
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expired'
        });
    }

    res.status(500).json({
        error: 'Internal server error'
    });
});

// 404 handler
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'API route not found'
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = {
    app,
    server,
    io
};