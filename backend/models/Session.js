const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    topic: {
        type: String,
        required: [true, 'Topic is required'],
        trim: true,
        minlength: [3, 'Topic must be at least 3 characters long'],
        maxlength: [100, 'Topic cannot exceed 100 characters']
    },
    level: {
        type: String,
        required: [true, 'Level is required'],
        enum: {
            values: ['high_school', 'college'],
            message: 'Level must be either high_school or college'
        }
    },
    date: {
        type: Date,
        required: [true, 'Date is required'],
        validate: {
            validator: function(value) {
                // Allow sessions up to 5 minutes in the past for creation, or any time in the past if status is 'ongoing' or 'completed'
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                if (this.status === 'ongoing' || this.status === 'completed') {
                    return true; // Already ongoing or completed sessions can be in the past
                }
                return value > fiveMinutesAgo;
            },
            message: 'Session date must be at least 5 minutes in the future, or the session must be ongoing/completed'
        }
    },
    duration: {
        type: Number,
        default: 60, // minutes
        min: [15, 'Session must be at least 15 minutes'],
        max: [180, 'Session cannot exceed 3 hours']
    },
    maxParticipants: {
        type: Number,
        required: [true, 'Maximum participants is required'],
        min: [1, 'Must allow at least 1 participant'],
        max: [20, 'Cannot exceed 20 participants']
    },
    meetLink: {
        type: String,
        trim: true,
        validate: {
            validator: function(value) {
                if (!value) return true; // Optional field
                return /^https?:\/\//.test(value);
            },
            message: 'Meet link must be a valid URL'
        }
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        enrolledAt: {
            type: Date,
            default: Date.now
        },
        attended: {
            type: Boolean,
            default: false
        }
    }],
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters'],
        trim: true
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    notificationSent: {
        type: Boolean,
        default: false
    },
    startNotificationSent: {
        type: Boolean,
        default: false
    },
    meetingLinkSent: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: {
        transform: function(doc, ret) {
            delete ret.__v;
            return ret;
        }
    }
});

// Indexes for efficient queries
sessionSchema.index({ date: 1, status: 1 });
sessionSchema.index({ creator: 1 });
sessionSchema.index({ 'participants.user': 1 });
sessionSchema.index({ level: 1, status: 1 });

// Virtual for current participant count
sessionSchema.virtual('currentParticipants').get(function() {
    return this.participants.length;
});

// Virtual for available spots
sessionSchema.virtual('availableSpots').get(function() {
    return this.maxParticipants - this.participants.length;
});

// Check if session is full
sessionSchema.methods.isFull = function() {
    return this.participants.length >= this.maxParticipants;
};

// Check if user is enrolled
sessionSchema.methods.isUserEnrolled = function(userId) {
    return this.participants.some(p => p.user.toString() === userId.toString());
};

// Check if user is the creator
sessionSchema.methods.isCreator = function(userId) {
    return this.creator.toString() === userId.toString();
};

// Enroll a user
sessionSchema.methods.enrollUser = function(userId) {
    if (this.isFull()) {
        throw new Error('Session is full');
    }

    if (this.isUserEnrolled(userId)) {
        throw new Error('User already enrolled');
    }

    if (this.isCreator(userId)) {
        throw new Error('Creator cannot enroll in their own session');
    }

    this.participants.push({
        user: userId,
        enrolledAt: new Date()
    });

    return this.save();
};

// Unenroll a user
sessionSchema.methods.unenrollUser = function(userId) {
    this.participants = this.participants.filter(
        p => p.user.toString() !== userId.toString()
    );
    return this.save();
};

module.exports = mongoose.model('Session', sessionSchema);