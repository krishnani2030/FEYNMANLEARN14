const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Session = require('../models/Session');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { notifySessionEnrollment } = require('../services/notificationService');
const { createWebrtcToken } = require('../services/webrtcTokenService');
const { JOIN_WINDOW_MINUTES, computeJoinWindow, canJoinSession } = require('../utils/sessionJoin');

const router = express.Router();

function normalizeId(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (value._id) {
        return value._id.toString();
    }

    if (value.id) {
        return value.id.toString();
    }

    if (typeof value === 'object' && typeof value.toString === 'function') {
        return value.toString();
    }

    return null;
}

function isUserInParticipants(participants = [], userId) {
    if (!userId) {
        return false;
    }

    return participants.some(participant => {
        if (!participant) {
            return false;
        }

        if (participant.user) {
            return normalizeId(participant.user) === userId;
        }

        return normalizeId(participant) === userId;
    });
}

function checkIsCreator(creator, userId) {
    if (!creator || !userId) {
        return false;
    }

    return normalizeId(creator) === userId;
}

function computeJoinAvailability(sessionObj) {
    const defaults = {
        canJoinNow: false,
        joinOpensAt: null,
        joinClosesAt: null,
        joinWindowMinutes: JOIN_WINDOW_MINUTES
    };

    if (!sessionObj) {
        return defaults;
    }

    const { joinOpensAt, joinClosesAt } = computeJoinWindow(sessionObj);
    if (!joinOpensAt || !joinClosesAt) {
        return defaults;
    }

    return {
        canJoinNow: canJoinSession(sessionObj),
        joinOpensAt: joinOpensAt.toISOString(),
        joinClosesAt: joinClosesAt.toISOString(),
        joinWindowMinutes: JOIN_WINDOW_MINUTES
    };
}

function formatSessionResponse(session, currentUser = null) {
    if (!session) {
        return null;
    }

    const sessionObj = session.toObject ? session.toObject({ virtuals: true }) : { ...session };

    if (sessionObj._id && !sessionObj.id) {
        sessionObj.id = sessionObj._id.toString();
    }

    sessionObj.roomCode = sessionObj.id;

    const joinInfo = computeJoinAvailability(sessionObj);

    if (currentUser && currentUser._id) {
        const userId = currentUser._id.toString();

        if (typeof session.isUserEnrolled === 'function') {
            sessionObj.isEnrolled = session.isUserEnrolled(currentUser._id);
        } else {
            sessionObj.isEnrolled = isUserInParticipants(sessionObj.participants, userId);
        }

        if (typeof session.isCreator === 'function') {
            sessionObj.isCreator = session.isCreator(currentUser._id);
        } else {
            sessionObj.isCreator = checkIsCreator(sessionObj.creator, userId);
        }
    }

    return Object.assign({}, sessionObj, joinInfo);
}

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

        const sessionsWithStatus = sessions.map(session => formatSessionResponse(session, req.user));

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

        const parsedMaxParticipants = parseInt(req.body.maxParticipants, 10);
        const parsedDuration = req.body.duration ? parseInt(req.body.duration, 10) : undefined;

        const sessionPayload = {
            topic: req.body.topic.trim(),
            level: req.body.level,
            date: sessionDate,
            maxParticipants: parsedMaxParticipants,
            creator: req.user._id,
            description: (req.body.description || '').trim()
        };

        if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
            sessionPayload.duration = parsedDuration;
        }

        const session = new Session(sessionPayload);

        await session.save();
        await session.populate('creator', 'name email');

        const responseSession = formatSessionResponse(session, req.user);

        res.status(201).json({ message: 'Session created successfully', session: responseSession });

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

        if (session.isUserEnrolled(req.user._id)) {
            await session.populate('creator', 'name email');
            await session.populate('participants.user', 'name email');
            const alreadyEnrolledSession = formatSessionResponse(session, req.user);
            return res.json({ message: 'Already enrolled in session', session: alreadyEnrolledSession });
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
        await session.populate('participants.user', 'name email');

        const responseSession = formatSessionResponse(session, req.user);

        await notifySessionEnrollment(session, req.user);

        res.json({ message: 'Successfully enrolled in session', session: responseSession });

    } catch (error) {
        console.error('Enrollment error:', error.message);
        res.status(400).json({ error: error.message });
    }
});

router.post('/:id/webrtc-token', authMiddleware, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id)
            .populate('participants.user', 'name email')
            .populate('creator', 'name email');

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const userId = req.user._id;
        const isCreator = typeof session.isCreator === 'function'
            ? session.isCreator(userId)
            : session.creator && session.creator._id && session.creator._id.toString() === userId.toString();
        const isEnrolled = typeof session.isUserEnrolled === 'function'
            ? session.isUserEnrolled(userId)
            : isUserInParticipants(session.participants, userId.toString());

        if (!isCreator && !isEnrolled) {
            return res.status(403).json({ error: 'You must be enrolled in this session to join the call.' });
        }

        if (!canJoinSession(session)) {
            const { joinOpensAt, joinClosesAt } = computeJoinWindow(session);
            return res.status(403).json({
                error: 'The session room is not open right now.',
                joinOpensAt: joinOpensAt ? joinOpensAt.toISOString() : null,
                joinClosesAt: joinClosesAt ? joinClosesAt.toISOString() : null
            });
        }

        const token = createWebrtcToken({
            sessionId: session._id.toString(),
            userId: userId.toString(),
            name: req.user.name
        });

        res.json({
            token,
            joinWindowMinutes: JOIN_WINDOW_MINUTES
        });
    } catch (error) {
        console.error('Failed to create WebRTC token:', error);
        res.status(500).json({ error: 'Failed to prepare meeting room' });
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

        session.topic = req.body.topic.trim();
        session.level = req.body.level;
        session.date = sessionDate;
        session.maxParticipants = parseInt(req.body.maxParticipants, 10);
        session.description = (req.body.description || '').trim();

        if (req.body.duration) {
            const parsedDuration = parseInt(req.body.duration, 10);
            if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
                session.duration = parsedDuration;
            }
        }

        const updatedMeetLink = (req.body.meetLink || '').trim();
        session.meetLink = updatedMeetLink;
        session.autoGeneratedMeetLink = false;
        session.googleEventId = null;
        session.googleCalendarId = null;

        await session.save();
        await session.populate('creator', 'name email');

        const responseSession = formatSessionResponse(session, req.user);

        res.json({ message: 'Session updated successfully', session: responseSession });

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

        const formatted = sessions.map(session => formatSessionResponse(session, req.user));

        res.json({ sessions: formatted });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch your sessions' });
    }
});

// Get discussion for a session
router.get('/:id/discussion', optionalAuth, async (req, res) => {
    try {
        const session = await Session.findById(req.params.id)
            .populate('discussion.sender', 'name email');

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const discussion = (session.discussion || [])
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)
            .map(entry => ({
                id: entry._id,
                message: entry.message,
                createdAt: entry.createdAt,
                sender: entry.sender ? {
                    id: entry.sender._id,
                    name: entry.sender.name,
                    email: entry.sender.email
                } : null
            }));

        res.json({ discussion });
    } catch (error) {
        console.error('Get discussion error:', error);
        res.status(500).json({ error: 'Failed to fetch session discussion' });
    }
});

// Post a message to session discussion
router.post('/:id/discussion', authMiddleware, [
    body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1 and 1000 characters')
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

        const messageContent = req.body.message.trim();

        session.discussion.push({
            sender: req.user._id,
            message: messageContent,
            createdAt: new Date()
        });

        await session.save();

        const newMessage = session.discussion[session.discussion.length - 1];

        res.status(201).json({
            message: {
                id: newMessage._id,
                message: newMessage.message,
                createdAt: newMessage.createdAt,
                sender: {
                    id: req.user._id,
                    name: req.user.name,
                    email: req.user.email
                }
            }
        });
    } catch (error) {
        console.error('Post discussion message error:', error);
        res.status(500).json({ error: 'Failed to post discussion message' });
    }
});

module.exports = router;