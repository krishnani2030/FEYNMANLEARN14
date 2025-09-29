const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/chat'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('File type not supported'), false);
        }
    }
});
const User = require('../models/User'); // Import User model
const mongoose = require('mongoose');

// Get chat messages for a session (general chat)
router.get('/session/:sessionId', authMiddleware, async (req, res) => {
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
router.get('/private/:recipientId', authMiddleware, async (req, res) => {
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
router.get('/history/:recipientId', authMiddleware, async (req, res) => {
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
router.get('/recent', authMiddleware, async (req, res) => {
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
router.get('/bot-messages', authMiddleware, async (req, res) => {
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

// File upload endpoint
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Create file URL
        const fileUrl = `/uploads/chat/${req.file.filename}`;
        
        res.json({
            success: true,
            fileUrl: fileUrl,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype
        });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'File upload failed' });
    }
});

// API endpoint for sending chat messages (fallback when Ably isn't used directly)
router.post('/send', authMiddleware, async (req, res) => {
    try {
        const { recipientId, text, sessionId, messageType = 'text' } = req.body;
        const userId = req.user._id.toString();
        
        // Validate required fields
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Message text is required' });
        }

        // Build message data
        const messageData = {
            sessionId: sessionId || null,
            sender: userId,
            senderName: req.user.name,
            senderUsername: req.user.username,
            text: text.trim(),
            recipient: recipientId || null,
            recipientUsername: null // Will be populated when loading user details
        };

        // If sending to a recipient, store recipient username
        if (recipientId) {
            const recipient = await User.findById(recipientId).select('username');
            if (recipient) {
                messageData.recipientUsername = recipient.username;
            }
        }

        console.log('Saving message via API endpoint:', messageData);
        
        // Save message to database
        const newMessage = new Message(messageData);
        await newMessage.save();
        
        // Prepare response (emitting to clients happens separately via Ably)
        const responseMessage = {
            _id: newMessage._id.toString(),
            senderId: userId,
            senderName: newMessage.senderName,
            senderUsername: newMessage.senderUsername,
            text: newMessage.text,
            timestamp: newMessage.timestamp,
            recipientId: newMessage.recipient?.toString(),
            recipientUsername: newMessage.recipientUsername,
            sessionId: newMessage.sessionId?.toString() || null,
            isBot: false
        };

        res.json({ success: true, message: responseMessage });
        
        // Optionally emit to connected clients via Socket.IO service (for real-time delivery)
        try {
            if (recipientId) {
                // Private message - use Socket.IO service
                if (global.socketService) {
                    await global.socketService.sendPrivateMessage(userId, recipientId, responseMessage);
                }
            } else if (sessionId) {
                // Session message - use Socket.IO service
                if (global.socketService) {
                    await global.socketService.sendSessionMessage(sessionId, responseMessage);
                }
            } else {
                // General chat message - broadcast to all
                if (global.socketService && global.socketService.io) {
                    global.socketService.io.to('general-chat').emit('chat-message', responseMessage);
                }
            }
        } catch (emitError) {
            console.error('Error emitting message via Socket.IO service:', emitError);
            // Non-critical error - message is still saved to DB
        }
        
    } catch (error) {
        console.error('Error saving message via API:', error);
        res.status(500).json({ error: 'Failed to save message' });
    }
});

// Clear all messages (for testing/debugging)
router.delete('/clear-all', authMiddleware, async (req, res) => {
    try {
        const result = await Message.deleteMany({});
        console.log(`🗑️ Cleared ${result.deletedCount} messages from database`);
        res.json({ 
            success: true, 
            deletedCount: result.deletedCount,
            message: 'All messages cleared successfully'
        });
    } catch (error) {
        console.error('Error clearing messages:', error);
        res.status(500).json({ error: 'Failed to clear messages' });
    }
});

module.exports = router;
