const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { sendVerificationEmail, hasSmtpConfig } = require('../services/emailService');

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function createVerificationToken() {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, hashedToken };
}

function buildVerificationUrl(token) {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5050';
    const url = new URL('/verify-email', baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
}

async function attachVerification(user) {
    const { rawToken, hashedToken } = createVerificationToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_EXPIRY_MS);
    await user.save();

    const verificationUrl = buildVerificationUrl(rawToken);
    let emailDelivery = 'skipped';

    try {
        const result = await sendVerificationEmail({
            email: user.email,
            name: user.name,
            verificationUrl
        });
        emailDelivery = result && result.skipped ? 'skipped' : 'sent';
    } catch (error) {
        console.error('Verification email error:', error);
        emailDelivery = 'failed';
    }

    return emailDelivery;
}

async function verifyEmailToken(token) {
    if (!token) {
        throw new Error('Verification token is required');
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
        throw new Error('Verification link is invalid or has expired');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    return user;
}

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

        // Create new user
        const user = new User({
            name,
            email,
            passwordHash: password,
            emailVerified: false
        });

        const { rawToken, hashedToken } = createVerificationToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

        await user.save();

        const verificationUrl = buildVerificationUrl(rawToken);
        let emailDelivery = 'skipped';

        try {
            const result = await sendVerificationEmail({
                email: user.email,
                name: user.name,
                verificationUrl
            });
            emailDelivery = result && result.skipped ? 'skipped' : 'sent';
        } catch (emailError) {
            console.error('Verification email error:', emailError);
            emailDelivery = 'failed';
        }

        res.status(201).json({
            message: 'Account created. Please verify your email to sign in.',
            requiresVerification: true,
            emailDelivery,
            email: user.email,
            smtpConfigured: hasSmtpConfig()
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
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
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

        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({ email, isActive: true });
        if (!user) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid email or password'
            });
        }

        if (!user.emailVerified) {
            const emailDelivery = await attachVerification(user);

            return res.status(403).json({
                error: 'Email not verified',
                requiresVerification: true,
                email: user.email,
                emailDelivery,
                smtpConfigured: hasSmtpConfig()
            });
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
                emailVerified: user.emailVerified,
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

router.post('/resend-verification', [
    body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const email = req.body.email;
        const user = await User.findOne({ email, isActive: true });

        if (!user) {
            return res.status(404).json({ error: 'Account not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        const emailDelivery = await attachVerification(user);

        res.json({
            message: 'Verification email sent',
            email: user.email,
            emailDelivery,
            smtpConfigured: hasSmtpConfig()
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

router.post('/verify-email', [
    body('token').notEmpty().withMessage('Verification token is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const user = await verifyEmailToken(req.body.token);

        res.json({
            message: 'Email verified successfully',
            email: user.email
        });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(400).json({ error: error.message || 'Unable to verify email' });
    }
});

router.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    try {
        await verifyEmailToken(token);
        res.send(`<!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Email verified</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 80px auto; padding: 24px; text-align: center; }
                        a { color: #046c4e; }
                    </style>
                </head>
                <body>
                    <h2>Your email is verified!</h2>
                    <p>You can now close this tab and sign in to Feynman Learn.</p>
                </body>
            </html>`);
    } catch (error) {
        res.status(400).send(`<!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Verification link invalid</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 80px auto; padding: 24px; text-align: center; }
                        a { color: #b42318; }
                    </style>
                </head>
                <body>
                    <h2>We could not verify your email.</h2>
                    <p>${error.message || 'The verification link is invalid or expired.'}</p>
                </body>
            </html>`);
    }
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
                emailVerified: user.emailVerified,
                role: user.role,
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