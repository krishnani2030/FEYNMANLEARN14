const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ChatThread = require('../models/ChatThread');

const DEFAULT_SYSTEM_EMAIL = process.env.SYSTEM_USER_EMAIL || 'notifications@feynmanlearn.local';
const DEFAULT_SYSTEM_NAME = process.env.SYSTEM_USER_NAME || 'Feynman';
const DEFAULT_SYSTEM_PASSWORD = process.env.SYSTEM_USER_PASSWORD || 'FeynmanLearnSystem!23';

let cachedSystemUser = null;

function normalizeObjectId(id) {
    if (!id) {
        return null;
    }

    if (id instanceof mongoose.Types.ObjectId) {
        return id;
    }

    if (typeof id === 'object' && id._id) {
        return id._id instanceof mongoose.Types.ObjectId
            ? id._id
            : mongoose.Types.ObjectId.isValid(id._id)
                ? new mongoose.Types.ObjectId(id._id)
                : null;
    }

    if (mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
    }

    return null;
}

async function ensureSystemUser() {
    if (cachedSystemUser) {
        return cachedSystemUser;
    }

    let systemUser = await User.findOne({ isSystem: true });

    if (!systemUser) {
        const passwordHash = await bcrypt.hash(DEFAULT_SYSTEM_PASSWORD, 12);
        systemUser = new User({
            name: DEFAULT_SYSTEM_NAME,
            email: DEFAULT_SYSTEM_EMAIL,
            passwordHash,
            role: 'admin',
            isSystem: true,
            authProvider: 'system'
        });
        await systemUser.save();
    } else {
        const updates = {};

        if (!systemUser.passwordHash) {
            updates.passwordHash = await bcrypt.hash(DEFAULT_SYSTEM_PASSWORD, 12);
        }

        if (systemUser.authProvider !== 'system') {
            updates.authProvider = 'system';
        }

        if (Object.keys(updates).length > 0) {
            systemUser.set(updates);
            await systemUser.save();
        }
    }

    cachedSystemUser = systemUser;
    return systemUser;
}

function buildParticipantsKey(ids) {
    return ids
        .map(id => id.toString())
        .sort()
        .join(':');
}

async function getOrCreateSystemChat(targetUserId) {
    const systemUser = await ensureSystemUser();
    const targetId = normalizeObjectId(targetUserId);

    if (!targetId) {
        throw new Error('Invalid target user id for system message');
    }

    const participants = [systemUser._id, targetId];
    const participantsKey = buildParticipantsKey(participants);

    let chat = await ChatThread.findOne({ participantsKey })
        .populate('participants', 'name email');

    if (!chat) {
        chat = new ChatThread({
            participants,
            participantsKey,
            messages: [],
            lastMessageAt: new Date()
        });
        await chat.save();
        await chat.populate('participants', 'name email');
    }

    return { chat, systemUser };
}

async function sendSystemMessage(targetUserId, content) {
    if (!content || typeof content !== 'string') {
        return null;
    }

    const { chat, systemUser } = await getOrCreateSystemChat(targetUserId);
    chat.addMessage(systemUser._id, content.trim());
    await chat.save();

    const savedMessage = chat.messages[chat.messages.length - 1];

    return {
        chat: chat.toObject(),
        message: {
            id: savedMessage._id,
            content: savedMessage.content,
            status: savedMessage.status,
            createdAt: savedMessage.createdAt,
            deliveredAt: savedMessage.deliveredAt,
            readAt: savedMessage.readAt,
            sender: {
                id: systemUser._id,
                name: systemUser.name,
                email: systemUser.email
            }
        }
    };
}

module.exports = {
    ensureSystemUser,
    sendSystemMessage
};
