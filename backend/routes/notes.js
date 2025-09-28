const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const { authMiddleware: protect } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage config for PDFs
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.pdf';
        cb(null, `${uniqueSuffix}${ext}`);
    }
});

const pdfOnly = function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
        return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
};

const upload = multer({ storage, fileFilter: pdfOnly, limits: { fileSize: 20 * 1024 * 1024 } });

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

// Get all public notes (without owner info)
router.get('/public', protect, async (req, res) => {
    try {
        const publicNotes = await Note.find({ isPublic: true }).select('-owner').sort({ updatedAt: -1 });
        res.json({ notes: publicNotes });
    } catch (error) {
        console.error('Error fetching public notes:', error);
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
        const { title, content } = req.body;
        const newNote = new Note({
            title,
            content,
            owner: req.user.id,
            // Make all notes public so everyone can see them
            isPublic: true,
        });
        await newNote.save();
        res.status(201).json({ note: newNote });
    } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new note by uploading a PDF (multipart/form-data)
router.post('/upload', protect, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        const { title, isPublic } = req.body;
        const safeTitle = (title && title.trim().length > 0) ? title.trim() : (req.file.originalname.replace(/\.pdf$/i, ''));
        const newNote = new Note({
            title: safeTitle,
            content: 'See attached PDF',
            owner: req.user.id,
            // Make uploaded PDFs globally accessible by default
            isPublic: true,
            pdf: {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                path: path.relative(path.join(__dirname, '..'), req.file.path)
            }
        });
        await newNote.save();
        res.status(201).json({ note: newNote });
    } catch (error) {
        console.error('Error uploading PDF note:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Attach/replace a PDF on an existing note (owner only)
router.post('/:id/attach-pdf', protect, upload.single('pdf'), async (req, res) => {
    try {
        const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        // Optionally remove old file
        if (note.pdf?.path) {
            const oldPath = path.join(__dirname, '..', note.pdf.path);
            fs.unlink(oldPath, () => {}); // best-effort cleanup
        }
        note.pdf = {
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            path: path.relative(path.join(__dirname, '..'), req.file.path)
        };
        // Make PDFs globally accessible; mark note public
        note.isPublic = true;
        note.updatedAt = Date.now();
        await note.save();
        res.json({ note });
    } catch (error) {
        console.error('Error attaching PDF to note:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
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

// Download attached PDF (owner for private notes, anyone for public notes)
router.get('/download-pdf/:id', protect, async (req, res) => {
    try {
        const note = await Note.findById(req.params.id);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }
        if (!note.pdf || !note.pdf.path) {
            return res.status(404).json({ error: 'No PDF attached to this note' });
        }
        // PDFs are global: allow any authenticated user to download
        const absolutePath = path.join(__dirname, '..', note.pdf.path);
        res.setHeader('Content-Disposition', `attachment; filename="${(note.pdf.originalName || (note.title + '.pdf')).replace(/[^a-z0-9_.-]/gi, '_')}"`);
        res.setHeader('Content-Type', note.pdf.mimeType || 'application/pdf');
        return res.sendFile(absolutePath);
    } catch (error) {
        console.error('Error downloading note PDF:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
