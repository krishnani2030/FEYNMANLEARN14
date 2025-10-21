const express = require('express');
const { JOIN_WINDOW_MINUTES } = require('../utils/sessionJoin');

const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        joinWindowMinutes: JOIN_WINDOW_MINUTES,
        emailVerificationRequired: true,
        notificationsSender: 'Feynman'
    });
});

module.exports = router;
