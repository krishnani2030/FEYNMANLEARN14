const User = require('../models/User');
const Session = require('../models/Session');
const ablyService = require('./ablyService');
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
        // Send via Ably if available
        if (ablyService.client) {
            await ablyService.sendFeynmanBotMessage(userId, message);
        }
        
        // Fallback to Socket.IO
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

// Send session reminder (15 minutes before)
const notifySessionReminder = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId)
            .populate('creator', 'name email _id')
            .populate('participants.user', 'name email _id');

        if (!session || session.notificationSent) {
            return;
        }

        console.log(`Sending 15-min reminder for session: ${session.topic}`);

        const payload = { type: 'session-reminder', sessionId: session._id.toString(), topic: session.topic, date: session.date, minutes: 15 };
        if (ioInstance) {
            ioInstance.to(session.creator._id.toString()).emit('session-notification', payload);
            session.participants.forEach(p => ioInstance.to(p.user._id.toString()).emit('session-notification', payload));
        }

        // Send Feynman bot message to each participant
        const Message = require('../models/Message');
        const botMessage = `🤖 Feynman Learn: Your session "${session.topic}" starts in 15 minutes! Get ready to join.`;
        
        // Send to creator
        const creatorMessage = new Message({
            sessionId: null,
            sender: null, // Bot message
            senderName: 'Feynman Bot',
            senderUsername: 'feynman_bot',
            text: botMessage,
            recipient: session.creator._id,
            recipientUsername: session.creator.username || session.creator.email,
        });
        await creatorMessage.save();
        
        if (ioInstance) {
            ioInstance.to(session.creator._id.toString()).emit('chat-message', {
                _id: creatorMessage._id.toString(),
                senderId: 'bot',
                senderName: 'Feynman Bot',
                senderUsername: 'feynman_bot',
                text: botMessage,
                timestamp: creatorMessage.timestamp,
                recipientId: session.creator._id.toString(),
                isBot: true
            });
        }

        // Send to participants
        for (const p of session.participants) {
            const participantMessage = new Message({
                sessionId: null,
                sender: null, // Bot message
                senderName: 'Feynman Bot',
                senderUsername: 'feynman_bot',
                text: botMessage,
                recipient: p.user._id,
                recipientUsername: p.user.username || p.user.email,
            });
            await participantMessage.save();
            
            if (ioInstance) {
                ioInstance.to(p.user._id.toString()).emit('chat-message', {
                    _id: participantMessage._id.toString(),
                    senderId: 'bot',
                    senderName: 'Feynman Bot',
                    senderUsername: 'feynman_bot',
                    text: botMessage,
                    timestamp: participantMessage.timestamp,
                    recipientId: p.user._id.toString(),
                    isBot: true
                });
            }
        }

        await sendEmail(session.creator.email, `Reminder: ${session.topic} in 15 minutes`, `Your session "${session.topic}" starts in 15 minutes.`);
        for (const p of session.participants) {
            await sendEmail(p.user.email, `Reminder: ${session.topic} in 15 minutes`, `The session "${session.topic}" starts in 15 minutes.`);
        }

        // Mark reminder as sent
        session.notificationSent = true;
        await session.save();

    } catch (error) {
        console.error('Error sending session reminders:', error);
    }
};

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
    notifySessionReminder,
    setSocketIo,
};