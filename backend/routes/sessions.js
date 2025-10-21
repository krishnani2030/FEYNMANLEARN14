const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Session = require('../models/Session');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const { hasGoogleMeetConfig, createMeetConference, updateMeetConference, syncEventAttendees } = require('../services/googleMeetService');
const { notifySessionEnrollment } = require('../services/notificationService');
const { sendSessionEnrollmentEmail, hasSmtpConfig } = require('../services/emailService');

const router = express.Router();

const JOIN_WINDOW_MINUTES = 15;

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

    if (!sessionObj || !sessionObj.date || !sessionObj.meetLink) {
        return defaults;
    }

    const start = new Date(sessionObj.date);
    if (Number.isNaN(start.getTime())) {
        return defaults;
    }

    const durationMinutes = Number(sessionObj.duration) || 60;
    const joinOpensAt = new Date(start.getTime() - JOIN_WINDOW_MINUTES * 60000);
    const joinClosesAt = new Date(start.getTime() + Math.max(durationMinutes, JOIN_WINDOW_MINUTES) * 60000);
    const now = new Date();

    let canJoinNow = false;
    if (sessionObj.status === 'ongoing' && now <= joinClosesAt) {
        canJoinNow = true;
    } else if (sessionObj.status !== 'completed' && now >= joinOpensAt && now <= joinClosesAt) {
        canJoinNow = true;
    }

    return {
        canJoinNow,
        joinOpensAt: joinOpensAt.toISOString(),
        joinClosesAt: joinClosesAt.toISOString(),
        joinWindowMinutes: JOIN_WINDOW_MINUTES
    };
}

function buildAttendeeFromUser(user) {
    if (!user || !user.email) {
        return null;
    }

    return {
        email: user.email,
        displayName: user.name || user.email
    };
}

function collectAttendees(session) {
    const attendees = [];

    if (!session) {
        return attendees;
    }

    if (session.creator) {
        const creatorAttendee = buildAttendeeFromUser(session.creator);
        if (creatorAttendee) {
            attendees.push(creatorAttendee);
        }
    }

    (session.participants || []).forEach(participant => {
        const user = participant && participant.user ? participant.user : participant;
        const attendee = buildAttendeeFromUser(user);
        if (attendee) {
            attendees.push(attendee);
        }
    });

    return attendees;
}

function formatSessionResponse(session, currentUser = null) {
    if (!session) {
        return null;
    }

    const sessionObj = session.toObject ? session.toObject({ virtuals: true }) : { ...session };

    if (sessionObj._id && !sessionObj.id) {
        sessionObj.id = sessionObj._id.toString();
    }

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

        const requestedMeetLink = (req.body.meetLink || '').trim();
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

        if (requestedMeetLink) {
            sessionPayload.meetLink = requestedMeetLink;
        }

        const session = new Session(sessionPayload);

        const shouldCreateMeet = req.body.createMeet === true || req.body.createMeet === 'true';

        const hostAttendee = buildAttendeeFromUser(req.user);
        const initialAttendees = hostAttendee ? [hostAttendee] : [];

        if ((shouldCreateMeet || !requestedMeetLink) && hasGoogleMeetConfig()) {
            try {
                const startDateIso = sessionDate.toISOString();
                const durationMinutes = session.duration || 60;
                const endDateIso = new Date(sessionDate.getTime() + durationMinutes * 60000).toISOString();
                const { meetLink, eventId, calendarId } = await createMeetConference({
                    topic: session.topic,
                    description: session.description,
                    startDate: startDateIso,
                    endDate: endDateIso,
                    attendees: initialAttendees
                });

                if (meetLink) {
                    session.meetLink = meetLink;
                }
                session.autoGeneratedMeetLink = true;
                session.googleEventId = eventId;
                session.googleCalendarId = calendarId;
            } catch (error) {
                console.error('Google Meet creation error:', error);
                if (shouldCreateMeet) {
                    return res.status(502).json({ error: 'Failed to create Google Meet link' });
                }
            }
        } else if (shouldCreateMeet && !hasGoogleMeetConfig()) {
            return res.status(503).json({ error: 'Google Meet integration is not configured' });
        }

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

        if (session.googleEventId && session.googleCalendarId && hasGoogleMeetConfig()) {
            try {
                await syncEventAttendees({
                    eventId: session.googleEventId,
                    calendarId: session.googleCalendarId,
                    attendees: collectAttendees(session)
                });
            } catch (syncError) {
                console.error('Failed to sync Google Meet attendees:', syncError);
            }
        }

        if (req.user && req.user.email) {
            const joinInfo = computeJoinAvailability(session);
            try {
                await sendSessionEnrollmentEmail({
                    email: req.user.email,
                    participantName: req.user.name,
                    hostName: session.creator ? session.creator.name : 'Your host',
                    sessionTopic: session.topic,
                    sessionDate: session.date,
                    meetLink: session.meetLink,
                    joinOpensMinutes: joinInfo.joinWindowMinutes
                });
            } catch (emailError) {
                if (hasSmtpConfig()) {
                    console.error('Failed to send enrollment email:', emailError);
                }
            }
        }

        res.json({ message: 'Successfully enrolled in session', session: responseSession });

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
        const wantsAutoMeet = req.body.createMeet === true || req.body.createMeet === 'true';

        if (updatedMeetLink) {
            session.meetLink = updatedMeetLink;
            session.autoGeneratedMeetLink = false;
            session.googleEventId = null;
            session.googleCalendarId = null;
        } else if (!wantsAutoMeet && !session.autoGeneratedMeetLink) {
            session.meetLink = '';
        }

        const durationMinutes = session.duration || 60;
        const startDateIso = session.date.toISOString();
        const endDateIso = new Date(session.date.getTime() + durationMinutes * 60000).toISOString();

        await session.populate('creator', 'name email');
        await session.populate('participants.user', 'name email');
        const attendeeList = collectAttendees(session);

        if (wantsAutoMeet) {
            if (!hasGoogleMeetConfig()) {
                return res.status(503).json({ error: 'Google Meet integration is not configured' });
            }

            try {
                if (session.googleEventId) {
                    const { meetLink, eventId, calendarId } = await updateMeetConference({
                        eventId: session.googleEventId,
                        topic: session.topic,
                        description: session.description,
                        startDate: startDateIso,
                        endDate: endDateIso,
                        attendees: attendeeList
                    });
                    if (meetLink) {
                        session.meetLink = meetLink;
                    }
                    session.googleEventId = eventId;
                    session.googleCalendarId = calendarId;
                    session.autoGeneratedMeetLink = true;
                } else {
                    const { meetLink, eventId, calendarId } = await createMeetConference({
                        topic: session.topic,
                        description: session.description,
                        startDate: startDateIso,
                        endDate: endDateIso,
                        attendees: attendeeList
                    });
                    if (meetLink) {
                        session.meetLink = meetLink;
                    }
                    session.googleEventId = eventId;
                    session.googleCalendarId = calendarId;
                    session.autoGeneratedMeetLink = true;
                }
            } catch (error) {
                console.error('Google Meet sync error:', error);
                return res.status(502).json({ error: 'Failed to synchronize Google Meet link' });
            }
        } else if (!updatedMeetLink && session.autoGeneratedMeetLink && session.googleEventId && hasGoogleMeetConfig()) {
            try {
                const { meetLink, eventId, calendarId } = await updateMeetConference({
                    eventId: session.googleEventId,
                    topic: session.topic,
                    description: session.description,
                    startDate: startDateIso,
                    endDate: endDateIso,
                    attendees: attendeeList
                });
                if (meetLink) {
                    session.meetLink = meetLink;
                }
                session.googleEventId = eventId;
                session.googleCalendarId = calendarId;
            } catch (error) {
                console.error('Google Meet update error:', error);
            }
        }

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