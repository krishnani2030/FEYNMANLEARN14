const express = require('express');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        const query = {
            _id: { $ne: req.user._id },
            isSystem: { $ne: true }
        };

        if (search) {
            const pattern = new RegExp(escapeRegex(search), 'i');
            query.$or = [
                { name: pattern },
                { email: pattern }
            ];
        }

        const users = await User.find(query)
            .select('name email')
            .sort({ name: 1 })
            .limit(20)
            .lean();

        res.json({
            users: users.map(user => ({
                id: user._id.toString(),
                name: user.name,
                email: user.email
            }))
        });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

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
