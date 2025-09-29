const User = require('../models/User');
const Session = require('../models/Session');
const socketService = require('./socketService');
let ioInstance = null;

function setSocketIo(io) { ioInstance = io; }

// Simple email sender using nodemailer if configured
async function sendEmail(to, subject, text) {
    try {
        const nodemailer = require('nodemailer');
        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
        if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
            console.log('Email not configured; skipping email send to', to, 'subject:', subject);
            return;
        }
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: (SMTP_SECURE || 'false') === 'true',
            auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
        await transporter.sendMail({ from: SMTP_USER, to, subject, text });
    } catch (e) {
        console.error('Error sending email', e);
    }
}

// Feynman Bot notification functions
const sendFeynmanBotNotification = async (userId, message, type = 'info') => {
    try {
        // Send via Socket.IO service if available
        if (socketService && socketService.io) {
            await socketService.sendFeynmanBotMessage(userId, message);
        }
        
        // Fallback to direct Socket.IO
        if (ioInstance) {
            ioInstance.to(`user_${userId}`).emit('feynman-bot-message', {
                message,
                type,
                timestamp: new Date().toISOString()
            });
        }
        
        console.log(`🤖 Sent Feynman Bot message to user ${userId}: ${message}`);
    } catch (error) {
        console.error('Error sending Feynman Bot notification:', error);
    }
};

const notifySessionCreated = async (sessionId, creatorId) => {
    try {
        const session = await Session.findById(sessionId).populate('creator', 'name');
        if (!session) return;
        
        const message = `🎉 Your session "${session.topic}" has been created! Participants can now enroll. Session starts on ${new Date(session.date).toLocaleDateString()} at ${session.time || 'TBD'}.`;
        
        await sendFeynmanBotNotification(creatorId, message, 'session_created');
    } catch (error) {
        console.error('Error sending session created notification:', error);
    }
};

const notifySessionEnrollment = async (sessionId, enrolledUserId, sessionCreatorId) => {
    try {
        const session = await Session.findById(sessionId);
        const enrolledUser = await User.findById(enrolledUserId);
        
        if (!session || !enrolledUser) return;
        
        // Notify session creator
        const creatorMessage = `👤 ${enrolledUser.name} just enrolled in your session "${session.topic}"! You now have ${session.participants.length} participant(s).`;
        await sendFeynmanBotNotification(sessionCreatorId, creatorMessage, 'enrollment_received');
        
        // Notify enrolled user
        const userMessage = `✅ You successfully enrolled in "${session.topic}" hosted by ${session.creator.name}. Session starts on ${new Date(session.date).toLocaleDateString()} at ${session.time || 'TBD'}.`;
        await sendFeynmanBotNotification(enrolledUserId, userMessage, 'enrollment_confirmed');
        
    } catch (error) {
        console.error('Error sending enrollment notifications:', error);
    }
};

const notifySessionReminder = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId).populate('creator participants.user', 'name');
        if (!session) return;
        
        const reminderMessage = `⏰ Your session "${session.topic}" starts in 15 minutes! Get ready to share your knowledge.`;
        
        // Notify creator
        await sendFeynmanBotNotification(session.creator._id, reminderMessage, 'session_reminder');
        
        // Notify all participants
        for (const participant of session.participants) {
            const userId = participant.user ? participant.user._id : participant;
            await sendFeynmanBotNotification(userId, reminderMessage, 'session_reminder');
        }
        
    } catch (error) {
        console.error('Error sending session reminder:', error);
    }
};

// Send session start notification (at start time)
const notifySessionStart = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId)
            .populate('creator', 'name email _id')
            .populate('participants.user', 'name email _id');

        if (!session || session.startNotificationSent) {
            return;
        }

        console.log(`Sending start notifications for session: ${session.topic}`);

        // In-app notifications via Socket.IO
        const payload = { type: 'session-start', sessionId: session._id.toString(), topic: session.topic, date: session.date };
        if (ioInstance) {
            ioInstance.to(session.creator._id.toString()).emit('session-notification', payload);
            session.participants.forEach(p => ioInstance.to(p.user._id.toString()).emit('session-notification', payload));
        }

        // Email notifications if configured
        await sendEmail(session.creator.email, `Session starting now: ${session.topic}`, `Your session "${session.topic}" is starting now.`);
        for (const p of session.participants) {
            await sendEmail(p.user.email, `Session starting now: ${session.topic}`, `The session "${session.topic}" is starting now.`);
        }

        // Mark notification as sent
        session.startNotificationSent = true;
        await session.save();
    } catch (error) {
        console.error('Error sending session start notifications:', error);
    }
};

// Duplicate function removed - using the original notifySessionReminder function above

// Send meeting link notification (5 minutes before)
const notifyMeetingLink = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId)
            .populate('creator', 'name email _id')
            .populate('participants.user', 'name email _id');

        if (!session || session.meetingLinkSent) {
            return;
        }

        console.log(`Sending meeting link for session: ${session.topic}`);

        const payload = { 
            type: 'meeting-link', 
            sessionId: session._id.toString(), 
            topic: session.topic, 
            date: session.date,
            minutes: 5
        };
        
        if (ioInstance) {
            ioInstance.to(session.creator._id.toString()).emit('session-meeting-link', payload);
            session.participants.forEach(p => ioInstance.to(p.user._id.toString()).emit('session-meeting-link', payload));
        }

        // Mark meeting link as sent
        session.meetingLinkSent = true;
        await session.save();

    } catch (error) {
        console.error('Error sending meeting link notifications:', error);
    }
};

module.exports = {
    notifySessionStart,
    notifySessionReminder,
    notifyMeetingLink,
    sendFeynmanBotNotification,
    notifySessionCreated,
    notifySessionEnrollment,
    setSocketIo,
};