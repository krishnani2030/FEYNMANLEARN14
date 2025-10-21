const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    passwordHash: {
        type: String,
        minlength: [6, 'Password must be at least 6 characters long'],
        required: [true, 'Password is required']
    },
    role: {
        type: String,
        enum: ['student', 'admin'],
        default: 'student'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isSystem: {
        type: Boolean,
        default: false
    },
    authProvider: {
        type: String,
        enum: ['password', 'system'],
        default: 'password'
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    verificationCodeHash: {
        type: String,
        default: null
    },
    verificationCodeExpiresAt: {
        type: Date,
        default: null
    },
    lastVerificationSentAt: {
        type: Date,
        default: null
    },
    lastLogin: {
        type: Date,
        default: null
    },
    enrolledSessions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session'
    }],
    createdSessions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session'
    }]
}, {
    timestamps: true,
    toJSON: {
        transform: function(doc, ret) {
            delete ret.passwordHash;
            delete ret.verificationCodeHash;
            delete ret.__v;
            return ret;
        }
    }
});

// Index for faster email lookups
userSchema.index({ email: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('passwordHash') || !this.passwordHash) return next();

    // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
    if (this.passwordHash.startsWith('$2a$') || this.passwordHash.startsWith('$2b$') || this.passwordHash.startsWith('$2y$')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(12);
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Get user's display name (first name + last initial)
userSchema.methods.getDisplayName = function() {
    const nameParts = this.name.split(' ');
    if (nameParts.length > 1) {
        return `${nameParts[0]} ${nameParts[1][0]}.`;
    }
    return nameParts[0];
};

userSchema.methods.verifyPassword = async function(candidate) {
    if (!candidate || !this.passwordHash) {
        return false;
    }

    return bcrypt.compare(candidate, this.passwordHash);
};

// Update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
};

module.exports = mongoose.model('User', userSchema);