const express = require('express');
const router = express.Router();
const ablyService = require('../services/ablyService');
const { authMiddleware } = require('../middleware/auth');

// Generate Ably token for authenticated user
router.post('/token', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        
        // Define capabilities for the user
        const capabilities = {
            [`chat:private:${userId}_*`]: ['publish', 'subscribe', 'presence'],
            [`chat:private:*_${userId}`]: ['publish', 'subscribe', 'presence'],
            [`chat:session:*`]: ['publish', 'subscribe', 'presence'],
            [`notifications:${userId}`]: ['subscribe'],
            [`session:*:updates`]: ['subscribe'],
            [`typing:*`]: ['publish', 'subscribe', 'presence']
        };

        const tokenRequest = await ablyService.generateToken(userId, capabilities);
        
        res.json({
            tokenRequest,
            clientId: userId
        });
    } catch (error) {
        console.error('Error generating Ably token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});

// Send message via Ably (fallback endpoint)
router.post('/messages/send', authMiddleware, async (req, res) => {
    try {
        const { recipientId, sessionId, text, messageType = 'text' } = req.body;
        const senderId = req.user._id.toString();

        const messageData = {
            senderId,
            senderName: req.user.name,
            senderUsername: req.user.username,
            text,
            messageType,
            timestamp: new Date().toISOString(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        if (recipientId) {
            // Private message
            messageData.recipientId = recipientId;
            await ablyService.sendPrivateMessage(senderId, recipientId, messageData);
        } else if (sessionId) {
            // Session message
            messageData.sessionId = sessionId;
            await ablyService.sendSessionMessage(sessionId, messageData);
        } else {
            return res.status(400).json({ error: 'Either recipientId or sessionId is required' });
        }

        res.json({ success: true, messageId: messageData.messageId });
    } catch (error) {
        console.error('Error sending message via Ably:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get channel history
router.get('/channels/:channelName/history', authMiddleware, async (req, res) => {
    try {
        const { channelName } = req.params;
        const { limit = 50 } = req.query;
        const userId = req.user._id.toString();

        // Validate user has access to this channel
        if (channelName.includes('private')) {
            const channelParts = channelName.split(':');
            if (channelParts.length >= 3) {
                const userIds = channelParts[2].split('_');
                if (!userIds.includes(userId)) {
                    return res.status(403).json({ error: 'Access denied to this channel' });
                }
            }
        }

        const history = await ablyService.getChannelHistory(channelName, parseInt(limit));
        
        res.json({ messages: history });
    } catch (error) {
        console.error('Error getting channel history:', error);
        res.status(500).json({ error: 'Failed to get channel history' });
    }
});

// Send Feynman Bot notification
router.post('/bot/notify', authMiddleware, async (req, res) => {
    try {
        const { userId, message, type = 'info' } = req.body;
        
        const botMessage = await ablyService.sendFeynmanBotMessage(userId, message);
        
        res.json({ success: true, messageId: botMessage.messageId });
    } catch (error) {
        console.error('Error sending bot notification:', error);
        res.status(500).json({ error: 'Failed to send bot notification' });
    }
});

// Broadcast enrollment update
router.post('/sessions/:sessionId/enrollment-update', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { action, userId, userName } = req.body; // action: 'enrolled' | 'left'

        const enrollmentData = {
            sessionId,
            action,
            userId,
            userName,
            timestamp: new Date().toISOString()
        };

        await ablyService.broadcastEnrollmentUpdate(sessionId, enrollmentData);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error broadcasting enrollment update:', error);
        res.status(500).json({ error: 'Failed to broadcast enrollment update' });
    }
});

// Broadcast session status update
router.post('/sessions/:sessionId/status-update', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { status, message } = req.body; // status: 'upcoming' | 'ongoing' | 'completed'

        const statusData = {
            sessionId,
            status,
            message,
            timestamp: new Date().toISOString()
        };

        await ablyService.broadcastSessionStatusUpdate(sessionId, statusData);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error broadcasting status update:', error);
        res.status(500).json({ error: 'Failed to broadcast status update' });
    }
});

module.exports = router;
