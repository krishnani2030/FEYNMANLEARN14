const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    readAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    _id: true
});

const chatThreadSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    participantsKey: {
        type: String,
        required: true,
        trim: true
    },
    messages: [messageSchema],
    lastMessageSnippet: {
        type: String,
        default: ''
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

chatThreadSchema.index({ participants: 1 });
chatThreadSchema.index({ lastMessageAt: -1 });
chatThreadSchema.index({ 'messages.createdAt': -1 });
chatThreadSchema.index({ participantsKey: 1 });

chatThreadSchema.pre('validate', function(next) {
    if (!Array.isArray(this.participants)) {
        this.participants = [];
    }

    const normalizedIds = this.participants
        .map(participant => {
            if (!participant) {
                return null;
            }

            if (participant._id) {
                participant = participant._id;
            }

            if (typeof participant === 'object' && typeof participant.toString === 'function') {
                return participant.toString();
            }

            return participant.toString ? participant.toString() : String(participant);
        })
        .filter(Boolean);

    const uniqueSortedIds = Array.from(new Set(normalizedIds)).sort();

    this.participants = uniqueSortedIds.map(id => new mongoose.Types.ObjectId(id));
    this.participantsKey = uniqueSortedIds.join(':');

    next();
});

chatThreadSchema.methods.addMessage = function(senderId, content) {
    const message = {
        sender: senderId,
        content,
        status: 'sent',
        deliveredAt: null,
        readAt: null
    };

    this.messages.push(message);
    this.lastMessageAt = new Date();
    this.lastMessageSnippet = content.length > 80 ? `${content.slice(0, 77)}...` : content;

    return message;
};

chatThreadSchema.methods.ensureParticipant = function(userId) {
    if (!userId) {
        return false;
    }

    const targetId = userId.toString();

    return this.participants.some(participant => {
        if (!participant) {
            return false;
        }

        if (participant._id) {
            return participant._id.toString() === targetId;
        }

        if (typeof participant === 'object' && participant.id) {
            return participant.id.toString() === targetId;
        }

        return participant.toString() === targetId;
    });
};

module.exports = mongoose.model('ChatThread', chatThreadSchema);
