const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// Signup route
router.post('/signup', [
    body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                error: 'User with this email already exists'
            });
        }

        // Generate unique username
        const username = await User.generateUniqueUsername(name);

        // Create new user
        const user = new User({
            name,
            email,
            username,
            passwordHash: password // Will be hashed by pre-save middleware
        });

        await user.save();

        // Create a welcome message from Feynman user
        try {
            const Message = require('../models/Message');
            let feynman = await User.findOne({ username: 'feynman' });
            if (!feynman) {
                const feynmanUsername = 'feynman';
                feynman = new User({
                    name: 'Richard Feynman',
                    email: 'feynman@feynmanlearn.com',
                    username: feynmanUsername,
                    passwordHash: 'welcome123',
                    role: 'admin'
                });
                await feynman.save();
            }

            const welcome = new Message({
                sessionId: null,
                sender: feynman._id,
                senderName: feynman.name,
                senderUsername: feynman.username,
                recipient: user._id,
                recipientUsername: user.username,
                text: 'Welcome to Feynman Learn! Start a new chat or join a session to learn by teaching. 🎉'
            });
            await welcome.save();
        } catch (e) {
            console.error('Failed to create welcome message:', e);
        }

        // Generate token
        const token = generateToken(user._id);

        // Set cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                username: user.username,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            error: 'Failed to create user'
        });
    }
});

// Login route
router.post('/login', [
    body('identifier').notEmpty().withMessage('Email or username is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { identifier, password } = req.body;

        // Find user by email or username
        const isEmail = identifier.includes('@');
        const query = isEmail ? { email: identifier } : { username: identifier };
        const user = await User.findOne({ ...query, isActive: true });
        if (!user) {
            return res.status(401).json({
                error: 'Invalid username/email or password'
            });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid username/email or password'
            });
        }

        // Ensure legacy users get a username
        if (!user.username) {
            try {
                const generated = await User.generateUniqueUsername(user.name || 'user');
                user.username = generated;
                await user.save({ validateBeforeSave: false });
            } catch (e) {
                console.warn('Failed to auto-assign username on login:', e);
            }
        }

        // Update last login
        await user.updateLastLogin();

        // Generate token
        const token = generateToken(user._id);

        // Set cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                username: user.username,
                role: user.role,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Failed to login'
        });
    }
});

// Logout route
router.post('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.json({
        message: 'Logout successful'
    });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('enrolledSessions', 'topic level date status')
            .populate('createdSessions', 'topic level date status currentParticipants');

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                username: user.username,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                enrolledSessions: user.enrolledSessions,
                createdSessions: user.createdSessions
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to get user information'
        });
    }
});

module.exports = router;