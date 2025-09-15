const express = require('express');
const User = require('../models/User');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get user profile (public - limited info)
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('name createdAt')
            .populate({
                path: 'createdSessions',
                match: { status: 'upcoming' },
                select: 'topic level date maxParticipants'
            });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            user: {
                id: user._id,
                displayName: user.getDisplayName(),
                memberSince: user.createdAt,
                upcomingSessions: user.createdSessions
            }
        });

    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

module.exports = router;