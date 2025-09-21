const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Resolve .env relative to this script

const addUsernameToExistingUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/feynman-learn', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Find users missing a valid username (not existing, null, or empty string)
        const users = await User.find({
            $or: [
                { username: { $exists: false } },
                { username: null },
                { username: '' }
            ]
        });
        console.log(`Found ${users.length} users missing a valid username.`);

        for (const user of users) {
            try {
                const safeName = (user.name && typeof user.name === 'string' && user.name.trim().length > 0)
                    ? user.name
                    : 'user';
                const username = await User.generateUniqueUsername(safeName);
                user.username = username;
                await user.save({ validateBeforeSave: false });
                console.log(`Assigned username '${username}' to user ${user.name} (ID: ${user._id})`);
            } catch (e) {
                console.error(`Failed to assign username for user ID ${user._id}:`, e);
            }
        }

        console.log('Finished assigning usernames to existing users.');
    } catch (error) {
        console.error('Error in addUsernameToExistingUsers script:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

addUsernameToExistingUsers();


