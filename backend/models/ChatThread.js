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
    return this.participants.some(participant => participant.toString() === userId.toString());
};

module.exports = mongoose.model('ChatThread', chatThreadSchema);
