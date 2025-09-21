const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const { authMiddleware: protect } = require('../middleware/auth');

// Get all notes for the authenticated user and all public notes
router.get('/', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const privateNotes = await Note.find({ owner: userId, isPublic: false }).sort({ updatedAt: -1 });
        const publicNotes = await Note.find({ isPublic: true }).select('-owner').sort({ updatedAt: -1 });
        
        // Combine and sort notes (public notes might be duplicates if user is owner)
        const allNotesMap = new Map();
        privateNotes.forEach(note => allNotesMap.set(note._id.toString(), note));
        publicNotes.forEach(note => allNotesMap.set(note._id.toString(), note));

        const allNotes = Array.from(allNotesMap.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        res.json({ notes: allNotes });
    } catch (error) {
        console.error('Error fetching all notes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a single note by ID
router.get('/:id', protect, async (req, res) => {
    try {
        // Allow fetching private notes by owner or any public note
        const note = await Note.findOne({
            $or: [
                { _id: req.params.id, owner: req.user.id }, // Owner's private note
                { _id: req.params.id, isPublic: true }      // Any public note
            ]
        });

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json({ note });
    } catch (error) {
        console.error('Error fetching note:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new note
router.post('/', protect, async (req, res) => {
    try {
        const { title, content, isPublic } = req.body;
        const newNote = new Note({
            title,
            content,
            owner: req.user.id,
            isPublic: isPublic || false, // Allow setting isPublic on creation
        });
        await newNote.save();
        res.status(201).json({ note: newNote });
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a note
router.put('/:id', protect, async (req, res) => {
    try {
        const { title, content } = req.body;
        const note = await Note.findOneAndUpdate(
            { _id: req.params.id, owner: req.user.id },
            { title, content, updatedAt: Date.now() },
            { new: true, runValidators: true }
        );
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.json({ note });
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a note
router.delete('/:id', protect, async (req, res) => {
    try {
        const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        res.status(204).send(); // No content for successful deletion
    } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download a note's content as a text file
router.get('/download/:id', protect, async (req, res) => {
    try {
        const note = await Note.findById(req.params.id);

        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        // Ensure only the owner or public notes can be downloaded
        if (!note.isPublic && note.owner.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Access denied to download this note.' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${note.title.replace(/[^a-z0-9]/gi, '_')}.txt"`);
        res.setHeader('Content-Type', 'text/plain');
        res.send(note.content);

    } catch (error) {
        console.error('Error downloading note:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
