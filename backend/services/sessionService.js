const Session = require('../models/Session');
const { notifySessionStart, notifySessionReminder } = require('./notificationService');

// Check and update session statuses
const checkOngoingSessions = async () => {
    try {
        const now = new Date();

        // Find sessions that should be starting soon (15 minutes before)
        const reminderTime = new Date(now.getTime() + 15 * 60 * 1000);
        const sessionsForReminder = await Session.find({
            status: 'upcoming',
            date: { $lte: reminderTime, $gt: now },
            notificationSent: false
        });

        // Send reminders
        for (const session of sessionsForReminder) {
            await notifySessionReminder(session._id);
        }

        // Find sessions that should be starting now
        const sessionsToStart = await Session.find({
            status: 'upcoming',
            date: { $lte: now },
            startNotificationSent: false
        });

        // Update to ongoing and notify
        for (const session of sessionsToStart) {
            session.status = 'ongoing';
            await session.save();
            await notifySessionStart(session._id);
        }

        // Find sessions that ended more than 2 hours ago and mark as completed
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const sessionsToComplete = await Session.find({
            status: 'ongoing',
            date: { $lte: twoHoursAgo }
        });

        // Update to completed
        for (const session of sessionsToComplete) {
            session.status = 'completed';
            await session.save();
        }

        // Clean up very old sessions (more than 30 days old)
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const oldSessions = await Session.find({
            date: { $lte: thirtyDaysAgo },
            status: { $in: ['completed', 'cancelled'] }
        });

        if (oldSessions.length > 0) {
            await Session.deleteMany({
                _id: { $in: oldSessions.map(s => s._id) }
            });
            console.log(`Cleaned up ${oldSessions.length} old sessions`);
        }

        console.log(`Session check completed at ${now.toISOString()}`);

    } catch (error) {
        console.error('Error checking ongoing sessions:', error);
    }
};

module.exports = {
    checkOngoingSessions
};