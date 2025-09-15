const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Session = require('../models/Session');
const User = require('../models/User');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all sessions
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { level, status = 'upcoming', limit = 20, page = 1 } = req.query;

        const query = { status };
        if (level) query.level = level;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const sessions = await Session.find(query)
            .populate('creator', 'name email')
            .populate('participants.user', 'name')
            .sort({ date: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const sessionsWithStatus = sessions.map(session => {
            const sessionObj = session.toObject();
            if (req.user) {
                sessionObj.isEnrolled = session.isUserEnrolled(req.user._id);
                sessionObj.isCreator = session.isCreator(req.user._id);
            }
            return sessionObj;
        });

        res.json({ sessions: sessionsWithStatus });

    } catch (error) {
        console.error('Get sessions error:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Create new session
router.post('/', authMiddleware, [
    body('topic').trim().isLength({ min: 3, max: 100 }),
    body('level').isIn(['high_school', 'college']),
    body('date').isISO8601(),
    body('maxParticipants').isInt({ min: 1, max: 20 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const sessionDate = new Date(req.body.date);
        if (sessionDate <= new Date()) {
            return res.status(400).json({ error: 'Session date must be in the future' });
        }

        const session = new Session({
            ...req.body,
            date: sessionDate,
            creator: req.user._id
        });

        await session.save();
        await session.populate('creator', 'name email');

        res.status(201).json({ message: 'Session created successfully', session });

    } catch (error) {
        console.error('Create session error:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Enroll in session
router.post('/:id/enroll', authMiddleware, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.status !== 'upcoming') {
            return res.status(400).json({ error: 'Can only enroll in upcoming sessions' });
        }

        // Add debugging
        console.log('Enrollment attempt:', {
            sessionId: req.params.id,
            userId: req.user._id,
            sessionStatus: session.status,
            isFull: session.isFull(),
            isEnrolled: session.isUserEnrolled(req.user._id),
            isCreator: session.isCreator(req.user._id),
            currentParticipants: session.participants.length,
            maxParticipants: session.maxParticipants
        });

        await session.enrollUser(req.user._id);
        await session.populate('creator', 'name email');
        await session.populate('participants.user', 'name');

        res.json({ message: 'Successfully enrolled in session', session });

    } catch (error) {
        console.error('Enrollment error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// Update session
router.put('/:id', authMiddleware, [
    body('topic').trim().isLength({ min: 3, max: 100 }),
    body('level').isIn(['high_school', 'college']),
    body('date').isISO8601(),
    body('maxParticipants').isInt({ min: 1, max: 20 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Check if user is the creator
        if (session.creator.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the creator can edit this session' });
        }

        const sessionDate = new Date(req.body.date);
        if (sessionDate <= new Date()) {
            return res.status(400).json({ error: 'Session date must be in the future' });
        }

        // Update session
        Object.assign(session, {
            ...req.body,
            date: sessionDate
        });

        await session.save();
        await session.populate('creator', 'name email');

        res.json({ message: 'Session updated successfully', session });

    } catch (error) {
        console.error('Update session error:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// Delete session
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Check if user is the creator
        if (session.creator.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Only the creator can delete this session' });
        }

        await Session.findByIdAndDelete(req.params.id);

        res.json({ message: 'Session deleted successfully' });

    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// Get user's sessions
router.get('/mine', authMiddleware, async (req, res) => {
    try {
        const sessions = await Session.find({ creator: req.user._id })
            .populate('creator', 'name email')
            .populate('participants.user', 'name email')
            .sort({ createdAt: -1 });

        res.json({ sessions });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch your sessions' });
    }
});

module.exports = router;