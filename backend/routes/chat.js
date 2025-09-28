const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const { authMiddleware: protect } = require('../middleware/auth');
const User = require('../models/User'); // Import User model
const mongoose = require('mongoose');

// Get chat messages for a session (general chat)
router.get('/session/:sessionId', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;
        // General chat uses sessionId null, while specific sessions use an ObjectId
        const query = { recipient: null };
        if (sessionId === 'general-chat') {
            query.sessionId = null;
        } else {
            query.sessionId = sessionId;
        }
        const messages = await Message.find(query)
            .sort({ timestamp: 1 })
            .select('sender senderName senderUsername text timestamp');
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching general chat messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get private chat messages between two users
router.get('/private/:recipientId', protect, async (req, res) => {
    try {
        const { recipientId } = req.params;
        const userId = req.user.id; // Current authenticated user

        const messages = await Message.find({
            $or: [
                { sender: userId, recipient: recipientId },
                { sender: recipientId, recipient: userId },
            ]
        }).sort({ timestamp: 1 }).select('sender senderName senderUsername recipient recipientUsername text timestamp');
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching private chat messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get chat history with a specific user (alias for private chat)
router.get('/history/:recipientId', protect, async (req, res) => {
    try {
        const { recipientId } = req.params;
        const userId = req.user.id; // Current authenticated user

        console.log(`Loading chat history between ${userId} and ${recipientId}`);

        // Special case for Feynman Bot
        if (recipientId === 'feynman-bot') {
            const messages = await Message.find({
                sender: null,
                recipient: userId,
                senderName: 'Feynman Bot'
            }).sort({ timestamp: 1 }).select('sender senderName senderUsername recipient recipientUsername text timestamp');

            console.log(`Found ${messages.length} bot messages`);
            res.json({ messages });
            return;
        }

        const messages = await Message.find({
            $or: [
                { sender: userId, recipient: recipientId },
                { sender: recipientId, recipient: userId }
            ]
        }).sort({ timestamp: 1 }).select('sender senderName senderUsername recipient recipientUsername text timestamp');

        console.log(`Found ${messages.length} messages between users`);
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching chat history:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent chat partners (users with whom current user has chatted)
router.get('/recent', protect, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find distinct users with whom the current user has chatted
        const recentChatUsers = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { sender: new mongoose.Types.ObjectId(userId) },
                        { recipient: new mongoose.Types.ObjectId(userId) }
                    ],
                    recipient: { $ne: null } // Only consider private messages
                }
            },
            {
                $group: {
                    _id: null,
                    users: { 
                        $addToSet: {
                            $cond: [
                                { $eq: ['$sender', new mongoose.Types.ObjectId(userId)] },
                                '$recipient',
                                '$sender'
                            ]
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    users: 1
                }
            }
        ]);

        let userIds = [];
        if (recentChatUsers.length > 0) {
            userIds = recentChatUsers[0].users.filter(id => id !== null); // Filter out null recipients
        }

        // Fetch user details for these IDs
        const users = await User.find({ _id: { $in: userIds } }).select('_id name username schoolGrade subjectInterests');

        res.json({ recentChats: users });

    } catch (error) {
        console.error('Error fetching recent chat partners:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get bot messages for current user
router.get('/bot-messages', protect, async (req, res) => {
    try {
        const messages = await Message.find({
            recipient: req.user.id,
            sender: null, // Bot messages have no sender
            senderName: 'Feynman Bot'
        }).sort({ timestamp: 1 });

        res.json({ messages });
    } catch (error) {
        console.error('Error fetching bot messages:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
