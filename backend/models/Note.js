const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    content: {
        type: String,
        required: true,
    },
    // Optional PDF attachment metadata
    pdf: {
        originalName: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        path: { type: String }, // relative path under uploads folder
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    isPublic: {
        type: Boolean,
        default: false,
    },
});

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;
