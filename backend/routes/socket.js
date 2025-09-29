const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');

// Send message via Socket.IO (fallback endpoint)
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
            await global.socketService.sendPrivateMessage(senderId, recipientId, messageData);
        } else if (sessionId) {
            // Session message
            messageData.sessionId = sessionId;
            await global.socketService.sendSessionMessage(sessionId, messageData);
        } else {
            return res.status(400).json({ error: 'Either recipientId or sessionId is required' });
        }

        res.json({ success: true, messageId: messageData.messageId });
    } catch (error) {
        console.error('Error sending message via Socket.IO:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get online users in a channel
router.get('/channels/:channelName/users', authMiddleware, async (req, res) => {
    try {
        const { channelName } = req.params;
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

        const onlineUsers = await global.socketService.getOnlineUsers(channelName);
        
        res.json({ users: onlineUsers });
    } catch (error) {
        console.error('Error getting online users:', error);
        res.status(500).json({ error: 'Failed to get online users' });
    }
});

// Send Feynman Bot notification
router.post('/bot/notify', authMiddleware, async (req, res) => {
    try {
        const { userId, message, type = 'info' } = req.body;
        
        const botMessage = await global.socketService.sendFeynmanBotMessage(userId, message);
        
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

        await global.socketService.broadcastEnrollmentUpdate(sessionId, enrollmentData);
        
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

        await global.socketService.broadcastSessionStatusUpdate(sessionId, statusData);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error broadcasting status update:', error);
        res.status(500).json({ error: 'Failed to broadcast status update' });
    }
});

// Check connection status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const isOnline = global.socketService.isUserOnline(userId);
        const socketId = global.socketService.getUserSocket(userId);
        
        res.json({ 
            isOnline, 
            socketId,
            userId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error checking connection status:', error);
        res.status(500).json({ error: 'Failed to check connection status' });
    }
});

module.exports = router;
