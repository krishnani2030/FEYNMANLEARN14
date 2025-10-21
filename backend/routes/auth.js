const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

let oauthClient = null;

function getOAuthClient() {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
        throw new Error('Google OAuth client ID is not configured');
    }

    if (!oauthClient) {
        oauthClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);
    }

    return oauthClient;
}

async function verifyGoogleToken(idToken) {
    const client = getOAuthClient();
    const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_OAUTH_CLIENT_ID
    });

    return ticket.getPayload();
}

function sanitizeUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        googleAvatarUrl: user.googleAvatarUrl,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
    };
}

router.post('/google', [
    body('idToken').notEmpty().withMessage('Google credential is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
            return res.status(503).json({ error: 'Google login is not configured' });
        }

        const { idToken } = req.body;
        let payload;

        try {
            payload = await verifyGoogleToken(idToken);
        } catch (error) {
            console.error('Google token verification failed:', error);
            return res.status(401).json({ error: 'Invalid Google credential' });
        }

        const {
            sub: googleId,
            email,
            name,
            picture
        } = payload;

        if (!email) {
            return res.status(400).json({ error: 'Google account email is required' });
        }

        let user = await User.findOne({ googleId });

        if (!user) {
            user = await User.findOne({ email });
        }

        if (!user) {
            user = new User({
                name: name || email,
                email,
                googleId,
                googleAvatarUrl: picture || null,
                authProvider: 'google',
                isActive: true
            });
        } else {
            user.googleId = googleId;
            user.authProvider = user.isSystem ? 'system' : 'google';
        }

        if (name && user.name !== name) {
            user.name = name;
        }

        if (user.email !== email) {
            user.email = email;
        }

        if (picture) {
            user.googleAvatarUrl = picture;
        }

        if (!user.isSystem) {
            user.isActive = true;
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
        console.error('Google sign-in error:', error);
        res.status(500).json({ error: 'Failed to authenticate with Google' });
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
