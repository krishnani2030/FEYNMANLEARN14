const nodemailer = require('nodemailer');

const REQUIRED_CONFIG = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD'
];

function hasSmtpConfig() {
    return REQUIRED_CONFIG.every(key => !!process.env[key]);
}

function createTransporter() {
    if (!hasSmtpConfig()) {
        console.warn('SMTP credentials are not fully configured. Email delivery will be skipped.');
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    });
}

async function sendMail({ to, subject, html }) {
    const transporter = createTransporter();
    if (!transporter) {
        console.info('[email] Preview message (no SMTP):', { to, subject });
        console.info(html);
        return { skipped: true };
    }

    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        html
    });

    return { sent: true };
}

function buildSessionEnrollmentEmail({
    participantName,
    hostName,
    sessionTopic,
    sessionDate,
    meetLink,
    joinOpensMinutes
}) {
    const start = sessionDate ? new Date(sessionDate) : null;
    const formattedStart = start && !Number.isNaN(start.getTime())
        ? start.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : 'the scheduled time';

    const safeParticipant = participantName || 'there';
    const safeHost = hostName || 'your host';
    const safeTopic = sessionTopic || 'your upcoming session';
    const safeJoinMinutes = joinOpensMinutes || 15;

    const joinMessage = meetLink
        ? `<p>You can join the meeting a few minutes early using this link:<br /><a href="${meetLink}">${meetLink}</a></p>`
        : '<p>The host will share a Google Meet link shortly before the session begins.</p>';

    return {
        subject: `You're enrolled: ${safeTopic}`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
                <h2 style="color: #046c4e;">Hi ${safeParticipant},</h2>
                <p>${safeHost} just confirmed your spot in <strong>${safeTopic}</strong>.</p>
                <p>The session starts at <strong>${formattedStart}</strong>. You'll be able to join about ${safeJoinMinutes} minutes early.</p>
                ${joinMessage}
                <p>If you have any questions, simply reply to this email.</p>
                <p>See you soon,<br />${safeHost} &amp; the Feynman Learn team</p>
            </div>
        `
    };
}

async function sendSessionEnrollmentEmail(details) {
    const { subject, html } = buildSessionEnrollmentEmail(details);
    return sendMail({ to: details.email, subject, html });
}

module.exports = {
    hasSmtpConfig,
    sendSessionEnrollmentEmail
};
