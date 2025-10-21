const jwt = require('jsonwebtoken');

const WEBRTC_TOKEN_TTL_SECONDS = 60 * 30; // 30 minutes

function getSecret() {
    if (process.env.WEBRTC_SECRET && process.env.WEBRTC_SECRET.length >= 16) {
        return process.env.WEBRTC_SECRET;
    }

    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is required to generate WebRTC tokens');
    }

    return `${process.env.JWT_SECRET}-webrtc`; // derive from main secret
}

function createWebrtcToken({ sessionId, userId, name }) {
    if (!sessionId || !userId) {
        throw new Error('sessionId and userId are required to create a WebRTC token');
    }

    const payload = {
        sessionId,
        userId,
        name: name || null
    };

    return jwt.sign(payload, getSecret(), { expiresIn: WEBRTC_TOKEN_TTL_SECONDS });
}

function verifyWebrtcToken(token) {
    return jwt.verify(token, getSecret());
}

module.exports = {
    createWebrtcToken,
    verifyWebrtcToken,
    WEBRTC_TOKEN_TTL_SECONDS
};
