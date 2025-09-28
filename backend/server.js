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
const { notifySessionStart, setSocketIo } = require('./services/notificationService');
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
// Provide io instance to services for emitting notifications
setSocketIo(io);
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

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend for non-API routes (must be after API routes)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

// Session notification cron job - runs every minute
cron.schedule('* * * * *', async () => {
    try {
        console.log('Running session check cron job...');
        await checkOngoingSessions();
    } catch (error) {
        console.error('Error in session check cron job:', error);
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

    // Test message handler for debugging
    socket.on('test-message', (data) => {
        console.log('Received test message:', data);
        socket.emit('test-response', { message: 'Test received successfully', timestamp: new Date() });
    });

    // Test session notification handler
    socket.on('test-session-notification', (payload) => {
        console.log('Received test session notification request:', payload);
        socket.emit('session-notification', payload);
    });

    // Debug: Check connected users
    socket.on('check-connected-users', () => {
        const rooms = io.sockets.adapter.rooms;
        const connectedUsers = [];
        
        rooms.forEach((sockets, roomId) => {
            // Skip socket.io internal rooms (they start with socket IDs)
            if (!roomId.startsWith('feynman-learn') && roomId.length === 24) { // MongoDB ObjectId length
                connectedUsers.push({
                    userId: roomId,
                    socketCount: sockets.size
                });
            }
        });
        
        console.log('Connected users:', connectedUsers);
        socket.emit('connected-users-response', connectedUsers);
    });

    // Private call notifications
    // Caller emits this to notify callee that a call is incoming
    // payload: { toUserId, fromUserId, fromName, mediaType: 'video'|'audio', roomId }
    socket.on('initiate-private-call', (payload) => {
        try {
            console.log('Initiating private call:', payload);
            if (!payload || !payload.toUserId || !payload.fromUserId || !payload.roomId) {
                console.log('Invalid call payload:', payload);
                return;
            }
            
            console.log(`Sending call notification to user ${payload.toUserId}`);
            
            // Check if the recipient is connected
            const recipientSockets = io.sockets.adapter.rooms.get(payload.toUserId);
            console.log(`Recipient ${payload.toUserId} has ${recipientSockets ? recipientSockets.size : 0} connected sockets`);
            
            io.to(payload.toUserId).emit('incoming-call', {
                fromUserId: payload.fromUserId,
                fromName: payload.fromName,
                mediaType: payload.mediaType || 'video',
                roomId: payload.roomId,
            });
            
            console.log('Call notification sent successfully');
        } catch (e) {
            console.error('Error handling initiate-private-call', e);
        }
    });

    // Callee accepted the call; notify caller
    // payload: { toUserId: callerId, roomId }
    socket.on('call-accepted', (payload) => {
        try {
            if (!payload || !payload.toUserId || !payload.roomId) return;
            io.to(payload.toUserId).emit('call-accepted', { roomId: payload.roomId });
        } catch (e) {
            console.error('Error handling call-accepted', e);
        }
    });

    // Callee declined the call; notify caller
    // payload: { toUserId: callerId, reason? }
    socket.on('call-declined', (payload) => {
        try {
            if (!payload || !payload.toUserId) return;
            io.to(payload.toUserId).emit('call-declined', { reason: payload.reason || 'declined' });
        } catch (e) {
            console.error('Error handling call-declined', e);
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
        
        // Validate required fields
        if (!message.text || !message.senderName) {
            console.error('Invalid message - missing required fields:', message);
            return;
        }
        
        // Save message to DB
        try {
            // Normalize sessionId: treat 'general-chat' as null in DB
            const normalizedSessionId = (message.sessionId === 'general-chat') ? null : (message.sessionId || null);

            const messageData = {
                sessionId: normalizedSessionId, // null for general chat, ObjectId for session-specific
                sender: message.senderId === 'bot' ? null : message.senderId, // Bot messages have no sender
                senderName: message.senderName,
                senderUsername: message.senderUsername, // Include sender's username
                text: message.text,
                recipient: message.recipientId || null, // Add recipient for private messages
                recipientUsername: message.recipientUsername || null, // Include recipient's username
            };

            console.log('Saving message to database:', messageData);
            
            const newMessage = new Message(messageData);
            await newMessage.save();
            
            console.log('Message saved successfully with ID:', newMessage._id);

            // Build a normalized payload from the saved doc to ensure consistent fields on clients
            const emittedMessage = {
                _id: newMessage._id.toString(),
                senderId: message.senderId === 'bot' ? 'bot' : newMessage.sender?.toString(),
                senderName: newMessage.senderName,
                senderUsername: newMessage.senderUsername,
                text: newMessage.text,
                timestamp: newMessage.timestamp,
                recipientId: newMessage.recipient ? newMessage.recipient.toString() : undefined,
                recipientUsername: newMessage.recipientUsername || undefined,
                sessionId: normalizedSessionId === null ? 'general-chat' : normalizedSessionId,
                localId: message.localId || undefined,
                isBot: message.senderId === 'bot' || message.isBot
            };

            console.log('Emitting message to clients:', emittedMessage);

            if (newMessage.recipient) {
                // Private message: deliver to recipient and echo to sender (if not bot)
                console.log(`Sending private message to recipient: ${newMessage.recipient.toString()}`);
                io.to(newMessage.recipient.toString()).emit('chat-message', emittedMessage);
                
                if (message.senderId !== 'bot' && newMessage.sender) {
                    console.log(`Echoing message to sender: ${newMessage.sender.toString()}`);
                    io.to(newMessage.sender.toString()).emit('chat-message', emittedMessage);
                }
            } else {
                // General chat message: broadcast to general chat room
                console.log(`Broadcasting to general chat room: ${emittedMessage.sessionId || 'general-chat'}`);
                io.to(emittedMessage.sessionId || 'general-chat').emit('chat-message', emittedMessage);
            }
        } catch (error) {
            console.error('Error saving chat message:', error);
            console.error('Message data:', message);
            console.error('Error details:', error.message);
        }
    });

    // WebRTC signaling events
    socket.on('join-call', (roomId) => {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined call room ${roomId}`);
        socket.emit('joined-call', roomId);
    });

    socket.on('leave-call', (roomId) => {
        socket.leave(roomId);
        console.log(`Socket ${socket.id} left call room ${roomId}`);
    });

    socket.on('offer', (offer, roomId) => {
        console.log(`Received offer from ${socket.id} in room ${roomId}`);
        socket.to(roomId).emit('offer', offer);
    });

    socket.on('answer', (answer, roomId) => {
        console.log(`Received answer from ${socket.id} in room ${roomId}`);
        socket.to(roomId).emit('answer', answer);
    });

    socket.on('ice-candidate', (candidate, roomId) => {
        console.log(`Received ICE candidate from ${socket.id} in room ${roomId}`);
        socket.to(roomId).emit('ice-candidate', candidate);
    });

    socket.on('get-peers', (roomId) => {
        const peers = io.sockets.adapter.rooms[roomId];
        if (peers) {
            const peerIds = Object.keys(peers.sockets);
            socket.emit('peers', peerIds);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket.IO client disconnected');
    });
});

module.exports = { app, io };