const express = require('express');
const router = express.Router();
const mediasoupService = require('../services/mediasoupService');
const { authMiddleware } = require('../middleware/auth');

// Get router RTP capabilities for a session
router.get('/sessions/:sessionId/rtp-capabilities', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Create room if it doesn't exist
        await mediasoupService.createRoom(sessionId);
        
        const rtpCapabilities = mediasoupService.getRouterRtpCapabilities(sessionId);
        
        res.json({ rtpCapabilities });
    } catch (error) {
        console.error('Error getting RTP capabilities:', error);
        res.status(500).json({ error: 'Failed to get RTP capabilities' });
    }
});

// Join a session room
router.post('/sessions/:sessionId/join', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const peerId = req.user._id.toString();
        const { socketId } = req.body;

        const { room, peer } = await mediasoupService.joinRoom(sessionId, peerId, socketId);
        
        res.json({ 
            success: true,
            roomInfo: {
                id: room.id,
                peerCount: room.peers.size,
                peers: Array.from(room.peers.keys())
            }
        });
    } catch (error) {
        console.error('Error joining room:', error);
        res.status(500).json({ error: 'Failed to join room' });
    }
});

// Create WebRTC transport
router.post('/sessions/:sessionId/create-transport', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const peerId = req.user._id.toString();

        const transportOptions = await mediasoupService.createWebRtcTransport(sessionId, peerId);
        
        res.json(transportOptions);
    } catch (error) {
        console.error('Error creating transport:', error);
        res.status(500).json({ error: 'Failed to create transport' });
    }
});

// Connect transport
router.post('/transports/:transportId/connect', authMiddleware, async (req, res) => {
    try {
        const { transportId } = req.params;
        const { dtlsParameters } = req.body;

        await mediasoupService.connectTransport(transportId, dtlsParameters);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error connecting transport:', error);
        res.status(500).json({ error: 'Failed to connect transport' });
    }
});

// Produce media (audio/video)
router.post('/sessions/:sessionId/produce', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const peerId = req.user._id.toString();
        const { transportId, kind, rtpParameters, appData } = req.body;

        const { id: producerId } = await mediasoupService.produce(
            sessionId, 
            peerId, 
            transportId, 
            kind, 
            rtpParameters, 
            appData
        );
        
        res.json({ producerId });
    } catch (error) {
        console.error('Error producing media:', error);
        res.status(500).json({ error: 'Failed to produce media' });
    }
});

// Consume media from other peers
router.post('/sessions/:sessionId/consume', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const peerId = req.user._id.toString();
        const { transportId, producerId, rtpCapabilities } = req.body;

        const consumerOptions = await mediasoupService.consume(
            sessionId,
            peerId,
            transportId,
            producerId,
            rtpCapabilities
        );
        
        res.json(consumerOptions);
    } catch (error) {
        console.error('Error consuming media:', error);
        res.status(500).json({ error: 'Failed to consume media' });
    }
});

// Resume consumer
router.post('/consumers/:consumerId/resume', authMiddleware, async (req, res) => {
    try {
        const { consumerId } = req.params;

        await mediasoupService.resumeConsumer(consumerId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error resuming consumer:', error);
        res.status(500).json({ error: 'Failed to resume consumer' });
    }
});

// Pause consumer
router.post('/consumers/:consumerId/pause', authMiddleware, async (req, res) => {
    try {
        const { consumerId } = req.params;

        await mediasoupService.pauseConsumer(consumerId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error pausing consumer:', error);
        res.status(500).json({ error: 'Failed to pause consumer' });
    }
});

// Leave room
router.post('/sessions/:sessionId/leave', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const peerId = req.user._id.toString();

        mediasoupService.leaveRoom(sessionId, peerId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error leaving room:', error);
        res.status(500).json({ error: 'Failed to leave room' });
    }
});

// Get room info
router.get('/sessions/:sessionId/info', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const roomInfo = mediasoupService.getRoomInfo(sessionId);
        
        if (!roomInfo) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        res.json(roomInfo);
    } catch (error) {
        console.error('Error getting room info:', error);
        res.status(500).json({ error: 'Failed to get room info' });
    }
});

module.exports = router;
