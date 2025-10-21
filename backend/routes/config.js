const express = require('express');
const { hasGoogleMeetConfig } = require('../services/googleMeetService');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null;

router.get('/', (req, res) => {
    res.json({
        googleClientId: GOOGLE_CLIENT_ID,
        googleMeetConfigured: hasGoogleMeetConfig()
    });
});

module.exports = router;
