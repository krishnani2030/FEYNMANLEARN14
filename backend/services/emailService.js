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

function buildVerificationEmail({ name, verificationUrl }) {
    const safeName = name || 'there';
    return {
        subject: 'Verify your Feynman Learn account',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h2>Welcome to Feynman Learn, ${safeName}!</h2>
                <p>Confirm your email address to start creating and joining sessions.</p>
                <p>
                    <a href="${verificationUrl}" style="display: inline-block; padding: 12px 18px; background: #046c4e; color: #fff; text-decoration: none; border-radius: 6px;">
                        Verify Email
                    </a>
                </p>
                <p>If the button does not work, copy and paste this link into your browser:</p>
                <p><a href="${verificationUrl}">${verificationUrl}</a></p>
                <p>This link expires in 24 hours.</p>
                <p>Thanks,<br />The Feynman Learn Team</p>
            </div>
        `
    };
}

async function sendVerificationEmail({ email, name, verificationUrl }) {
    const { subject, html } = buildVerificationEmail({ name, verificationUrl });
    return sendMail({ to: email, subject, html });
}

module.exports = {
    sendVerificationEmail,
    hasSmtpConfig
};
