const User = require('../models/User');
const Session = require('../models/Session');

// Send session start notification
const notifySessionStart = async (sessionId) => {
    try {
        const session = await Session.findById(sessionId)
            .populate('creator', 'name email')
            .populate('participants.user', 'name email');

        if (!session || session.startNotificationSent) {
            return;
        }

        console.log(`Sending start notifications for session: ${session.topic}`);

        // Log notification (replace with push notification service in production)
        session.participants.forEach(participant => {
            console.log(`Notified ${participant.user.name} about session start: ${session.topic}`);
        });

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
            .populate('participants.user', 'name email');

        if (!session || session.notificationSent) {
            return;
        }

        console.log(`Sending reminder notifications for session: ${session.topic}`);

        session.participants.forEach(participant => {
            console.log(`Reminded ${participant.user.name} about upcoming session: ${session.topic}`);
        });

        // Mark reminder as sent
        session.notificationSent = true;
        await session.save();

    } catch (error) {
        console.error('Error sending session reminders:', error);
    }
};

module.exports = {
    notifySessionStart,
    notifySessionReminder
};