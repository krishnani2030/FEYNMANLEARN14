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
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        lowercase: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters long'],
        maxlength: [20, 'Username cannot exceed 20 characters'],
        match: [/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores']
    },
    passwordHash: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long']
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
    }],
    schoolGrade: {
        type: String,
        enum: ['High School', 'College', 'Other'],
        default: 'Other'
    },
    subjectInterests: [
        {
            type: String,
            trim: true,
        }
    ],
}, {
    timestamps: true,
    toJSON: {
        transform: function(doc, ret) {
            delete ret.passwordHash;
            delete ret.__v;
            return ret;
        }
    }
});

// Index for faster email and username lookups
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('passwordHash')) return next();

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

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Get user's display name (first name + last initial)
userSchema.methods.getDisplayName = function() {
    const nameParts = this.name.split(' ');
    if (nameParts.length > 1) {
        return `${nameParts[0]} ${nameParts[1][0]}.`;
    }
    return nameParts[0];
};

// Update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    // Save without triggering full validation to avoid failures for legacy users missing new required fields
    return this.save({ validateBeforeSave: false });
};

// Generate unique username from name
userSchema.statics.generateUniqueUsername = async function(name) {
    // Create base username from name
    let baseUsername = name.toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
        .substring(0, 15); // Limit length
    
    if (baseUsername.length < 3) {
        baseUsername = `user_${Date.now().toString().slice(-5)}`;
    }
    
    let username = baseUsername;
    let counter = 1;
    
    // Check if username exists and increment if needed
    while (await this.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
        
        // Prevent infinite loop
        if (counter > 999) {
            username = `${baseUsername}_${Date.now().toString().slice(-5)}`;
            break;
        }
    }
    
    return username;
};

module.exports = mongoose.model('User', userSchema);