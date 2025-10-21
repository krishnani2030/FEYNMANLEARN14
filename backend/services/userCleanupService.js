const User = require('../models/User');

async function removeLegacyUsers() {
    try {
        const filter = {
            isSystem: { $ne: true },
            $or: [
                { authProvider: { $exists: false } },
                { authProvider: { $ne: 'google' } },
                { googleId: { $exists: false } },
                { googleId: null }
            ]
        };

        const result = await User.deleteMany(filter);
        return result.deletedCount || 0;
    } catch (error) {
        console.error('Error removing legacy users:', error);
        throw error;
    }
}

module.exports = {
    removeLegacyUsers
};
