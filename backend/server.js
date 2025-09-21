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
const socketIo = require('socket.io');
const Message = require('./models/Message');
const Note = require('./models/Note');
// Load .env from the backend directory explicitly so running from repo root works
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Also try loading from the repo root as a fallback (for setups that keep .env at project root)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const notesRoutes = require('./routes/notes');
const { notifySessionStart } = require('./services/notificationService');
const { checkOngoingSessions } = require('./services/sessionService');

const app = express();
const server = require('http').createServer(app);
const io = socketIo(server, {
    cors: {
        // Same-origin: reflect the request origin (or disable restriction)
        origin: true,
        credentials: true
    }
});
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"], // This fixes the onclick handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"]
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

// CORS configuration (same-origin friendly)
app.use(cors({
    origin: true, // reflect request origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging middleware
app.use(morgan('combined'));

// MongoDB connection
const rawMongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/feynman-learn';
function maskMongoUri(uri) {
    try {
        const u = new URL(uri.replace('mongodb+srv://', 'http://').replace('mongodb://', 'http://'));
        if (u.username || u.password) {
            return uri.replace(`${u.username}:${u.password}@`, '***:***@');
        }
        return uri;
    } catch (_) { return uri; }
}
console.log('MongoDB URI in use:', maskMongoUri(rawMongoUri));

mongoose.connection.on('connecting', () => console.log('Mongoose: connecting...'));
mongoose.connection.on('connected', () => console.log('Mongoose: connected'));
mongoose.connection.on('error', (err) => console.error('Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('Mongoose: disconnected'));

mongoose.connect(rawMongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(async () => {
    console.log('Connected to MongoDB');

    // Check if we need to seed the database
    try {
        const Session = require('./models/Session');
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

    // Start the server only after a successful DB connection
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notes', notesRoutes);

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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Socket.IO client connected');

    socket.on('join-user', (userId) => {
        if (userId) {
            socket.join(userId);
            console.log(`Socket ${socket.id} joined user room ${userId}`);
        }
    });

    socket.on('join-session', (sessionId) => {
        socket.join(sessionId);
        console.log(`Socket ${socket.id} joined session ${sessionId}`);
    });

    socket.on('leave-session', (sessionId) => {
        socket.leave(sessionId);
        console.log(`Socket ${socket.id} left session ${sessionId}`);
    });

    socket.on('chat-message', async (message) => {
        console.log('Received chat message:', message);
        // Save message to DB
        try {
            // Normalize sessionId: treat 'general-chat' as null in DB
            const normalizedSessionId = (message.sessionId === 'general-chat') ? null : (message.sessionId || null);

            const newMessage = new Message({
                sessionId: normalizedSessionId, // null for general chat, ObjectId for session-specific
                sender: message.senderId,
                senderName: message.senderName,
                senderUsername: message.senderUsername, // Include sender's username
                text: message.text,
                recipient: message.recipientId || null, // Add recipient for private messages
                recipientUsername: message.recipientUsername || null, // Include recipient's username
            });
            await newMessage.save();

            // Build a normalized payload from the saved doc to ensure consistent fields on clients
            const emittedMessage = {
                _id: newMessage._id.toString(),
                senderId: newMessage.sender.toString(),
                senderName: newMessage.senderName,
                senderUsername: newMessage.senderUsername,
                text: newMessage.text,
                timestamp: newMessage.timestamp,
                recipientId: newMessage.recipient ? newMessage.recipient.toString() : undefined,
                recipientUsername: newMessage.recipientUsername || undefined,
                sessionId: normalizedSessionId === null ? 'general-chat' : normalizedSessionId,
            };

            if (newMessage.recipient) {
                // Private message: deliver to recipient and echo to sender
                io.to(newMessage.recipient.toString()).emit('chat-message', emittedMessage);
                io.to(newMessage.sender.toString()).emit('chat-message', emittedMessage);
            } else {
                // General chat message: broadcast to general chat room
                io.to(emittedMessage.sessionId || 'general-chat').emit('chat-message', emittedMessage);
            }
        } catch (error) {
            console.error('Error saving chat message:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket.IO client disconnected');
    });
});

module.exports = { app, io };