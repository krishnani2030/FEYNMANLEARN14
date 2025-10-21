const { google } = require('googleapis');

const REQUIRED_CONFIG = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CALENDAR_ID'
];

function hasGoogleMeetConfig() {
    return REQUIRED_CONFIG.every(key => !!process.env[key]);
}

function getAuthClient() {
    if (!hasGoogleMeetConfig()) {
        throw new Error('Google Meet integration is not fully configured.');
    }

    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    return new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/calendar']
    });
}

function getCalendarClient(auth) {
    return google.calendar({ version: 'v3', auth });
}

function extractMeetLink(eventData) {
    if (!eventData) {
        return null;
    }

    if (eventData.hangoutLink) {
        return eventData.hangoutLink;
    }

    const entryPoints = eventData.conferenceData?.entryPoints || [];
    const meetEntry = entryPoints.find(entry => entry.entryPointType === 'video');
    return meetEntry ? meetEntry.uri : null;
}

function normalizeAttendees(attendees = []) {
    return attendees
        .filter(Boolean)
        .filter(entry => entry.email)
        .map(entry => ({
            email: entry.email,
            displayName: entry.displayName,
            responseStatus: entry.responseStatus || 'accepted'
        }));
}

function buildEventResource({ topic, description, startDate, endDate, attendees }) {
    const timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'UTC';
    return {
        summary: topic,
        description,
        start: {
            dateTime: startDate,
            timeZone
        },
        end: {
            dateTime: endDate,
            timeZone
        },
        attendees: normalizeAttendees(attendees),
        conferenceData: {
            createRequest: {
                requestId: `meet-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
        }
    };
}

async function createMeetConference({ topic, description, startDate, endDate, attendees = [] }) {
    if (!hasGoogleMeetConfig()) {
        throw new Error('Google Meet integration is not configured.');
    }

    const auth = getAuthClient();
    await auth.authorize();

    const calendar = getCalendarClient(auth);
    const resource = buildEventResource({ topic, description, startDate, endDate, attendees });

    const { data } = await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        conferenceDataVersion: 1,
        sendUpdates: attendees.length > 0 ? 'all' : 'none',
        requestBody: resource
    });

    return {
        meetLink: extractMeetLink(data),
        eventId: data.id,
        calendarId: process.env.GOOGLE_CALENDAR_ID
    };
}

async function updateMeetConference({ eventId, topic, description, startDate, endDate, attendees = [] }) {
    if (!hasGoogleMeetConfig()) {
        throw new Error('Google Meet integration is not configured.');
    }

    const auth = getAuthClient();
    await auth.authorize();
    const calendar = getCalendarClient(auth);

    const resource = buildEventResource({ topic, description, startDate, endDate, attendees });

    const { data } = await calendar.events.patch({
        calendarId: process.env.GOOGLE_CALENDAR_ID,
        eventId,
        conferenceDataVersion: 1,
        sendUpdates: attendees.length > 0 ? 'all' : 'none',
        requestBody: resource
    });

    return {
        meetLink: extractMeetLink(data),
        eventId: data.id,
        calendarId: process.env.GOOGLE_CALENDAR_ID
    };
}

async function syncEventAttendees({ eventId, calendarId, attendees = [] }) {
    if (!hasGoogleMeetConfig()) {
        return null;
    }

    if (!eventId || !calendarId || attendees.length === 0) {
        return null;
    }

    const auth = getAuthClient();
    await auth.authorize();
    const calendar = getCalendarClient(auth);

    const { data: existingEvent } = await calendar.events.get({
        calendarId,
        eventId
    });

    const existingAttendees = Array.isArray(existingEvent.attendees)
        ? existingEvent.attendees
        : [];

    const attendeeMap = new Map();

    existingAttendees.forEach(attendee => {
        if (attendee && attendee.email) {
            attendeeMap.set(attendee.email.toLowerCase(), attendee);
        }
    });

    normalizeAttendees(attendees).forEach(attendee => {
        attendeeMap.set(attendee.email.toLowerCase(), {
            ...attendeeMap.get(attendee.email.toLowerCase()),
            ...attendee
        });
    });

    const mergedAttendees = Array.from(attendeeMap.values());

    await calendar.events.patch({
        calendarId,
        eventId,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
            attendees: mergedAttendees
        }
    });

    return mergedAttendees;
}

module.exports = {
    hasGoogleMeetConfig,
    createMeetConference,
    updateMeetConference,
    syncEventAttendees
};
