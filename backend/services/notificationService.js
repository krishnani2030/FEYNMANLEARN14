const Session = require('../models/Session');
const { sendSystemMessage } = require('./systemMessageService');
const { JOIN_WINDOW_MINUTES, computeJoinWindow } = require('../utils/sessionJoin');

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
    const { joinOpensAt } = computeJoinWindow(session);
    return joinOpensAt || null;
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
            `Feynman here—"${session.topic}" is starting now.`,
            'Open the session in your dashboard and tap Join to enter the live room.'
        ];

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
            `Feynman reminder: "${session.topic}" starts at ${sessionTime}.`
        ];

        if (joinOpensLabel) {
            messageParts.push(`The room unlocks ${JOIN_WINDOW_MINUTES} minutes early at ${joinOpensLabel}.`);
        } else {
            messageParts.push('The room unlocks 5 minutes early in your Sessions tab.');
        }

        messageParts.push('Look for the Join button inside the session when the window opens.');

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
            `Feynman here—you're enrolled in "${session.topic}" scheduled for ${sessionTime}.`
        ];

        if (joinOpensLabel) {
            parts.push(`Come back ${JOIN_WINDOW_MINUTES} minutes early at ${joinOpensLabel} to hit Join.`);
        } else {
            parts.push('Come back five minutes early and hit Join from your Sessions tab.');
        }

        parts.push('I will remind you right before we begin.');

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
