const Session = require('../models/Session');
const { sendSystemMessage } = require('./systemMessageService');

const JOIN_WINDOW_MINUTES = 15;

function formatDateTime(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getJoinOpensAt(session) {
    const start = new Date(session.date);
    if (Number.isNaN(start.getTime())) {
        return null;
    }

    return new Date(start.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000);
}

function collectSessionRecipientIds(session) {
    const recipients = new Set();

    const addRecipient = (user) => {
        if (!user) {
            return;
        }

        if (user._id) {
            recipients.add(user._id.toString());
            return;
        }

        if (user.id) {
            recipients.add(user.id.toString());
            return;
        }

        if (typeof user === 'string') {
            recipients.add(user);
        }
    };

    if (session.creator) {
        addRecipient(session.creator);
    }

    (session.participants || []).forEach(participant => {
        if (participant && participant.user) {
            addRecipient(participant.user);
        } else {
            addRecipient(participant);
        }
    });

    return Array.from(recipients);
}

async function dispatchSystemNotifications(session, message) {
    if (!message) {
        return;
    }

    const recipients = collectSessionRecipientIds(session);
    const tasks = recipients.map(async userId => {
        try {
            await sendSystemMessage(userId, message);
        } catch (error) {
            console.error('Failed to send session notification message', {
                sessionId: session._id,
                userId,
                error
            });
        }
    });

    await Promise.all(tasks);
}

const notifySessionStart = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId)
            .populate('creator', 'name email')
            .populate('participants.user', 'name email');

        if (!session || session.startNotificationSent) {
            return;
        }

        const startTime = formatDateTime(session.date);
        const messageParts = [
            `It's time! "${session.topic}" is starting now.`
        ];

        if (session.meetLink) {
            messageParts.push(`Join here: ${session.meetLink}`);
        }

        await dispatchSystemNotifications(session, messageParts.join(' '));

        session.startNotificationSent = true;
        await session.save();
    } catch (error) {
        console.error('Error sending session start notifications:', error);
    }
};

const notifySessionReminder = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId)
            .populate('creator', 'name email')
            .populate('participants.user', 'name email');

        if (!session || session.notificationSent) {
            return;
        }

        const sessionTime = formatDateTime(session.date);
        const joinOpensAt = getJoinOpensAt(session);
        const joinOpensLabel = joinOpensAt ? formatDateTime(joinOpensAt) : null;

        const messageParts = [
            `Reminder: "${session.topic}" starts at ${sessionTime}.`
        ];

        if (session.meetLink && joinOpensLabel) {
            messageParts.push(`You'll be able to join from ${joinOpensLabel}: ${session.meetLink}`);
        } else if (session.meetLink) {
            messageParts.push(`A join link is available: ${session.meetLink}`);
        } else {
            messageParts.push('The host will share the meeting link before it begins.');
        }

        await dispatchSystemNotifications(session, messageParts.join(' '));

        session.notificationSent = true;
        await session.save();
    } catch (error) {
        console.error('Error sending session reminders:', error);
    }
};

const notifySessionEnrollment = async (session, user) => {
    try {
        if (!session || !user) {
            return;
        }

        const sessionTime = formatDateTime(session.date);
        const joinOpensAt = getJoinOpensAt(session);
        const joinOpensLabel = joinOpensAt ? formatDateTime(joinOpensAt) : null;

        const parts = [
            `You're enrolled in "${session.topic}" scheduled for ${sessionTime}.`
        ];

        if (session.meetLink && joinOpensLabel) {
            parts.push(`The join link opens ${JOIN_WINDOW_MINUTES} minutes early at ${joinOpensLabel}.`);
        } else if (session.meetLink) {
            parts.push('The join link will unlock shortly before the session starts.');
        } else {
            parts.push('Watch your messages for the meeting link before it begins.');
        }

        const targetUserId = user._id || user.id || user;
        await sendSystemMessage(targetUserId, parts.join(' '));
    } catch (error) {
        console.error('Error sending enrollment notification:', error);
    }
};

module.exports = {
    notifySessionStart,
    notifySessionReminder,
    notifySessionEnrollment
};
