const express = require('express');
const { hasGoogleMeetConfig } = require('../services/googleMeetService');

const router = express.Router();

router.get('/', (req, res) => {
    res.json({
        googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || null,
        googleMeetConfigured: hasGoogleMeetConfig()
    });
});

module.exports = router;
