const JOIN_WINDOW_MINUTES = 5;

function ensureDate(dateLike) {
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
}

function computeJoinWindow(session) {
    if (!session || !session.date) {
        return { joinOpensAt: null, joinClosesAt: null };
    }

    const start = ensureDate(session.date);
    if (!start) {
        return { joinOpensAt: null, joinClosesAt: null };
    }

    const durationMinutes = Number(session.duration) || 60;
    const joinOpensAt = new Date(start.getTime() - JOIN_WINDOW_MINUTES * 60 * 1000);
    const joinClosesAt = new Date(start.getTime() + Math.max(durationMinutes, JOIN_WINDOW_MINUTES) * 60 * 1000);

    return { joinOpensAt, joinClosesAt };
}

function canJoinSession(session, referenceDate = new Date()) {
    if (!session) {
        return false;
    }

    if (session.status === 'cancelled' || session.status === 'completed') {
        return false;
    }

    const { joinOpensAt, joinClosesAt } = computeJoinWindow(session);
    if (!joinOpensAt || !joinClosesAt) {
        return false;
    }

    const now = ensureDate(referenceDate);
    if (!now) {
        return false;
    }

    if (now < joinOpensAt) {
        return false;
    }

    return now <= joinClosesAt;
}

module.exports = {
    JOIN_WINDOW_MINUTES,
    computeJoinWindow,
    canJoinSession
};
