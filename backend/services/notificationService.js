const User = require('../models/User');
const Session = require('../models/Session');
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
    setSocketIo,
};