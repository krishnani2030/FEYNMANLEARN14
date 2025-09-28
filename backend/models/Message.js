const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption configuration
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32); // 32 bytes key
const IV_LENGTH = 16; // For AES, this is always 16

// Encryption function
function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// Decryption function
function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const messageSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: false, // sessionId is now optional for private messages
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Allow null for bot messages
    },
    senderName: {
        type: String,
        required: true,
    },
    senderUsername: {
        type: String,
        required: false,
    },
    text: {
        type: String,
        required: true,
        trim: true,
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Make recipient optional for general chat messages
    },
    recipientUsername: {
        type: String,
        required: false,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
    isEncrypted: {
        type: Boolean,
        default: false,
    },
});

// Pre-save middleware to encrypt private messages
messageSchema.pre('save', function(next) {
    // Only encrypt private messages (messages with a recipient)
    if (this.recipient && this.text && !this.isEncrypted) {
        this.text = encrypt(this.text);
        this.isEncrypted = true;
    }
    next();
});

// Method to get decrypted text
messageSchema.methods.getDecryptedText = function() {
    if (this.isEncrypted && this.recipient) {
        return decrypt(this.text);
    }
    return this.text;
};

// Transform function to automatically decrypt when converting to JSON
messageSchema.set('toJSON', {
    transform: function(doc, ret) {
        if (ret.isEncrypted && ret.recipient) {
            ret.text = decrypt(ret.text);
        }
        delete ret.isEncrypted; // Don't expose encryption status in API
        return ret;
    }
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
