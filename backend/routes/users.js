const express = require('express');
const User = require('../models/User');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Search for usernames (for suggestions)
router.get('/suggest-username', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) { // Require at least 2 characters for suggestion
            return res.json({ users: [] }); // Return empty array for short queries
        }

        const searchQuery = new RegExp(`^${q}`, 'i'); // Case-insensitive search, starting with query

        const users = await User.find({
            _id: { $ne: req.user.id }, // Exclude current user
            username: searchQuery,
        }).select('_id username name').limit(10); // Limit to 10 suggestions

        res.json({ users });
    } catch (error) {
        console.error('Error suggesting usernames:', error);
        res.status(500).json({ error: 'Failed to fetch username suggestions' });
    }
});

// Get all usernames sorted for client-side binary search
router.get('/all-usernames', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({
            _id: { $ne: req.user.id },
            username: { $exists: true, $ne: '' }
        })
            .select('username name _id')
            .sort({ username: 1 }); // Sort by username alphabetically
        res.json({ users });
    } catch (error) {
        console.error('Error fetching all usernames:', error);
        res.status(500).json({ error: 'Failed to fetch all usernames' });
    }
});

// Get all users (for chat list, etc.)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({ _id: { $ne: req.user.id } })
            .select('_id name username schoolGrade subjectInterests');
        res.json({ users });
    } catch (error) {
        console.error('Error fetching all users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Search users
router.get('/search', authMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const searchQuery = new RegExp(q, 'i'); // Case-insensitive search

        const users = await User.find({
            _id: { $ne: req.user.id }, // Exclude current user
            $or: [
                { name: searchQuery },
                { username: searchQuery },
                { schoolGrade: searchQuery },
                { subjectInterests: searchQuery },
            ],
        }).select('_id name username schoolGrade subjectInterests');

        res.json({ users });
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Get user details for chat (authenticated)
router.get('/:id([0-9a-fA-F]{24})', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('_id name username email schoolGrade subjectInterests createdAt');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user });

    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Get user profile (public - limited info)
router.get('/:id([0-9a-fA-F]{24})/profile', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('name username createdAt')
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
                username: user.username,
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