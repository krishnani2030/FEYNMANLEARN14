const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const ChatThread = require('../models/ChatThread');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

const formatChatSummary = (chat, currentUserId) => {
    const messages = chat.messages || [];
    const lastMessage = messages[messages.length - 1];
    const lastMessageAt = chat.lastMessageAt || (lastMessage ? lastMessage.createdAt : null);
    const snippet = chat.lastMessageSnippet || (lastMessage ? lastMessage.content : '');
    const unreadCount = messages.reduce((count, message) => {
        if (message.sender.toString() !== currentUserId.toString() && message.status !== 'delivered') {
            return count + 1;
        }
        return count;
    }, 0);

    return {
        id: chat._id,
        participants: (chat.participants || []).map(participant => ({
            id: participant._id,
            name: participant.name,
            email: participant.email
        })),
        lastMessageSnippet: snippet,
        lastMessageAt,
        unreadCount
    };
};

router.get('/', async (req, res) => {
    try {
        const chats = await ChatThread.find({ participants: req.user._id })
            .populate('participants', 'name email')
            .sort({ lastMessageAt: -1 })
            .lean({ virtuals: true });

        const formattedChats = chats.map(chat => formatChatSummary(chat, req.user._id));

        res.json({ chats: formattedChats });
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

router.post('/', [
    body('participantId')
        .custom(value => mongoose.Types.ObjectId.isValid(value))
        .withMessage('participantId must be a valid ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const participantId = req.body.participantId;

        if (participantId === req.user._id.toString()) {
            return res.status(400).json({ error: 'Cannot start a chat with yourself' });
        }

        const participant = await User.findById(participantId).select('name email');
        if (!participant) {
            return res.status(404).json({ error: 'Participant not found' });
        }

        let chat = await ChatThread.findOne({
            participants: { $all: [req.user._id, participantId] },
            $expr: { $eq: [{ $size: '$participants' }, 2] }
        })
            .populate('participants', 'name email');

        if (!chat) {
            chat = new ChatThread({
                participants: [req.user._id, participantId],
                messages: [],
                lastMessageAt: new Date()
            });
            await chat.save();
            await chat.populate('participants', 'name email');
        }

        res.status(201).json({ chat: formatChatSummary(chat, req.user._id) });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

router.get('/:chatId/messages', async (req, res) => {
    try {
        const chat = await ChatThread.findById(req.params.chatId)
            .populate('participants', 'name email')
            .populate('messages.sender', 'name email');

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.ensureParticipant(req.user._id)) {
            return res.status(403).json({ error: 'You do not have access to this chat' });
        }

        const messages = chat.messages
            .map(message => ({
                id: message._id,
                content: message.content,
                status: message.status,
                createdAt: message.createdAt,
                deliveredAt: message.deliveredAt,
                sender: message.sender ? {
                    id: message.sender._id,
                    name: message.sender.name,
                    email: message.sender.email
                } : null
            }));

        res.json({
            chat: formatChatSummary(chat.toObject(), req.user._id),
            messages
        });
    } catch (error) {
        console.error('Get chat messages error:', error);
        res.status(500).json({ error: 'Failed to fetch chat messages' });
    }
});

router.post('/:chatId/messages', [
    body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be between 1 and 1000 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const chat = await ChatThread.findById(req.params.chatId)
            .populate('participants', 'name email');

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.ensureParticipant(req.user._id)) {
            return res.status(403).json({ error: 'You do not have access to this chat' });
        }

        const message = chat.addMessage(req.user._id, req.body.content);

        await chat.save();

        const formattedMessage = {
            id: message._id,
            content: message.content,
            status: message.status,
            createdAt: message.createdAt,
            deliveredAt: message.deliveredAt,
            sender: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email
            }
        };

        res.status(201).json({
            chat: formatChatSummary(chat.toObject(), req.user._id),
            message: formattedMessage
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

router.patch('/:chatId/messages/ack', [
    body('messageIds').isArray({ min: 1 }).withMessage('messageIds must be a non-empty array')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const chat = await ChatThread.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        if (!chat.ensureParticipant(req.user._id)) {
            return res.status(403).json({ error: 'You do not have access to this chat' });
        }

        const idsToUpdate = new Set(req.body.messageIds.map(id => id.toString()));
        const updatedMessages = [];
        const now = new Date();

        chat.messages.forEach(message => {
            if (
                idsToUpdate.has(message._id.toString()) &&
                message.sender.toString() !== req.user._id.toString() &&
                message.status !== 'delivered'
            ) {
                message.status = 'delivered';
                message.deliveredAt = now;
                updatedMessages.push({
                    id: message._id,
                    status: message.status,
                    deliveredAt: message.deliveredAt
                });
            }
        });

        if (updatedMessages.length > 0) {
            await chat.save();
        }

        res.json({ updated: updatedMessages });
    } catch (error) {
        console.error('Acknowledge messages error:', error);
        res.status(500).json({ error: 'Failed to update message status' });
    }
});

module.exports = router;
