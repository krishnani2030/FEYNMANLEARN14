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
        ? `<p>If the host prefers an external call, join using this link:<br /><a href="${meetLink}">${meetLink}</a></p>`
        : `<p>Open the Feynman Learn dashboard ${safeJoinMinutes} minutes early and tap <strong>Join</strong> to enter the live room.</p>`;

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

function buildVerificationEmail({ name, code }) {
    const safeName = name || 'there';
    const safeCode = code || '000000';

    return {
        subject: 'Verify your Feynman Learn email',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
                <h2 style="color: #1d4ed8;">Welcome${safeName ? `, ${safeName}` : ''}!</h2>
                <p>Use the one-time code below to verify your email address:</p>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${safeCode}</p>
                <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
                <p>Thanks for joining Feynman Learn!</p>
            </div>
        `
    };
}

async function sendVerificationEmail(details) {
    const { subject, html } = buildVerificationEmail(details);
    return sendMail({ to: details.email, subject, html });
}

module.exports = {
    hasSmtpConfig,
    sendSessionEnrollmentEmail,
    sendVerificationEmail,
    buildVerificationEmail
};
