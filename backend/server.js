const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const { notifySessionStart } = require('./services/notificationService');
const { checkOngoingSessions } = require('./services/sessionService');

const app = express();
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
            connectSrc: ["'self'"],
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

// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5050',
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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/feynman-learn', {
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
})
.catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;