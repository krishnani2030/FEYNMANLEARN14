const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { sendVerificationEmail, hasSmtpConfig } = require('../services/emailService');

const router = express.Router();

const VERIFICATION_EXPIRY_MINUTES = 10;

function generateToken(userId) {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

function sanitizeUser(user) {
    if (!user) {
        return null;
    }

    return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        isEmailVerified: user.isEmailVerified
    };
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function assignVerificationCode(user) {
    const code = generateVerificationCode();
    user.verificationCodeHash = await bcrypt.hash(code, 10);
    user.verificationCodeExpiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MINUTES * 60 * 1000);
    user.lastVerificationSentAt = new Date();
    return code;
}

async function sendVerification(user, code) {
    if (!user || !code) {
        return;
    }

    try {
        await sendVerificationEmail({
            email: user.email,
            name: user.name,
            code
        });
    } catch (error) {
        console.error('Failed to send verification email:', error);
    }
}

router.post('/register', [
    body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { name, email, password } = req.body;
        const normalizedEmail = email.toLowerCase();

        let user = await User.findOne({ email: normalizedEmail });
        if (user && user.isEmailVerified) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        if (!user) {
            user = new User({
                name,
                email: normalizedEmail,
                passwordHash: password,
                isActive: true,
                authProvider: 'password'
            });
        } else {
            user.name = name;
            user.passwordHash = password;
            user.isActive = true;
            user.authProvider = 'password';
        }

        const code = await assignVerificationCode(user);
        await user.save();

        if (!hasSmtpConfig()) {
            console.info('[verification] SMTP not configured. Verification code:', code);
        } else {
            await sendVerification(user, code);
        }

        res.status(201).json({
            message: 'Registration successful. Please verify your email using the code sent to you.',
            verificationRequired: true
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register account' });
    }
});

router.post('/login', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || !user.isActive) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const passwordValid = await user.verifyPassword(password);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isEmailVerified) {
            const code = await assignVerificationCode(user);
            await user.save();

            if (!hasSmtpConfig()) {
                console.info('[verification] SMTP not configured. Verification code:', code);
            } else {
                await sendVerification(user, code);
            }

            return res.status(403).json({
                error: 'Email verification required. We have sent you a new code.',
                verificationRequired: true
            });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = generateToken(user._id);
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({
            message: 'Login successful',
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});

router.post('/verify-email', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { email, code } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ error: 'Account not found' });
        }

        if (!user.verificationCodeHash || !user.verificationCodeExpiresAt) {
            return res.status(400).json({ error: 'No verification code on file. Please request a new one.' });
        }

        if (new Date() > user.verificationCodeExpiresAt) {
            return res.status(400).json({ error: 'Verification code has expired. Request a new code.' });
        }

        const codeMatches = await bcrypt.compare(code, user.verificationCodeHash);
        if (!codeMatches) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        user.isEmailVerified = true;
        user.verificationCodeHash = null;
        user.verificationCodeExpiresAt = null;
        await user.save();

        res.json({ message: 'Email verified successfully. You can now log in.' });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

router.post('/resend-verification', [
    body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ error: 'Account not found' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ error: 'Email is already verified.' });
        }

        const now = new Date();
        if (user.lastVerificationSentAt && (now - user.lastVerificationSentAt) < 60 * 1000) {
            return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
        }

        const code = await assignVerificationCode(user);
        await user.save();

        if (!hasSmtpConfig()) {
            console.info('[verification] SMTP not configured. Verification code:', code);
        } else {
            await sendVerification(user, code);
        }

        res.json({ message: 'Verification code resent.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification code' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.json({ message: 'Logout successful' });
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('enrolledSessions', 'topic level date status')
            .populate('createdSessions', 'topic level date status currentParticipants');

        res.json({ user: sanitizeUser(user) });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user information' });
    }
});

module.exports = router;
