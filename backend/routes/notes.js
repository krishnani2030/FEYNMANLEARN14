const express = require('express');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Note = require('../models/Note');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../uploads/notes');
fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_ATTACHMENT_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_ATTACHMENTS_PER_REQUEST = 10;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt']);

const SAFE_FILENAME_REGEX = /[\\/:*?"<>|]/g;

function sanitizeFileName(name) {
    const fallback = 'attachment';
    if (!name || typeof name !== 'string') {
        return fallback;
    }

    const trimmed = name.trim();
    if (!trimmed) {
        return fallback;
    }

    return trimmed.replace(SAFE_FILENAME_REGEX, '_').slice(0, 180) || fallback;
}

function guessMimeType(extension) {
    switch (extension) {
        case '.pdf':
            return 'application/pdf';
        case '.doc':
            return 'application/msword';
        case '.docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.xls':
            return 'application/vnd.ms-excel';
        case '.xlsx':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case '.ppt':
            return 'application/vnd.ms-powerpoint';
        case '.pptx':
            return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        case '.txt':
            return 'text/plain';
        default:
            return 'application/octet-stream';
    }
}

function isAllowedFileType(mimeType, extension) {
    const normalizedMime = (mimeType || '').toLowerCase();
    const normalizedExtension = (extension || '').toLowerCase();
    return ALLOWED_MIME_TYPES.has(normalizedMime) || ALLOWED_EXTENSIONS.has(normalizedExtension);
}

function extractBase64Content(raw) {
    if (typeof raw !== 'string') {
        return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }

    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
        return trimmed.slice(commaIndex + 1).trim();
    }

    return trimmed;
}

function parseAttachmentPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid attachment payload.');
    }

    const originalName = typeof payload.name === 'string' ? payload.name.trim() : '';
    const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.trim() : '';
    const base64Content = extractBase64Content(payload.content);

    if (!originalName || !base64Content) {
        throw new Error('Attachments must include a filename and encoded content.');
    }

    const extension = path.extname(originalName).toLowerCase();

    if (!isAllowedFileType(mimeType, extension)) {
        throw new Error('Unsupported file type. Upload PDF, Word, Excel, or PowerPoint documents.');
    }

    const normalizedContent = base64Content.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(normalizedContent)) {
        throw new Error('Attachment content must be valid base64 data.');
    }

    return {
        originalName: sanitizeFileName(originalName),
        mimeType: mimeType || guessMimeType(extension),
        base64: normalizedContent,
        extension
    };
}

async function removeAttachmentFile(fileName) {
    if (!fileName) {
        return;
    }

    const filePath = path.join(uploadsDir, fileName);
    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Failed to delete attachment file:', error);
        }
    }
}

function formatAttachment(attachment) {
    if (!attachment) {
        return null;
    }

    const uploadedBy = attachment.uploadedBy && typeof attachment.uploadedBy === 'object'
        ? {
            id: attachment.uploadedBy._id || attachment.uploadedBy.id || attachment.uploadedBy,
            name: attachment.uploadedBy.name || '',
            email: attachment.uploadedBy.email || ''
        }
        : null;

    return {
        id: attachment._id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        uploadedAt: attachment.uploadedAt,
        uploadedBy,
        url: `/uploads/notes/${attachment.fileName}`
    };
}

function formatNote(note) {
    if (!note) {
        return null;
    }

    const createdBy = note.createdBy && typeof note.createdBy === 'object'
        ? {
            id: note.createdBy._id || note.createdBy.id || note.createdBy,
            name: note.createdBy.name || '',
            email: note.createdBy.email || ''
        }
        : null;

    return {
        id: note._id,
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        createdBy,
        attachments: Array.isArray(note.attachments) ? note.attachments.map(formatAttachment).filter(Boolean) : []
    };
}

async function decodeAndStoreAttachment(payload, userId) {
    const parsed = parseAttachmentPayload(payload);
    let buffer;

    try {
        buffer = Buffer.from(parsed.base64, 'base64');
    } catch (error) {
        throw new Error('Failed to decode attachment content.');
    }

    if (!buffer || buffer.length === 0) {
        throw new Error('Attachment content is empty.');
    }

    if (buffer.length > MAX_ATTACHMENT_SIZE) {
        throw new Error('Attachments must be 15 MB or smaller.');
    }

    const normalizedBase64 = parsed.base64.replace(/=+$/, '');
    const reencoded = buffer.toString('base64').replace(/=+$/, '');
    if (normalizedBase64 !== reencoded) {
        throw new Error('Attachment content must be valid base64 data.');
    }

    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${parsed.extension || ''}`;
    const filePath = path.join(uploadsDir, uniqueName);

    await fs.promises.writeFile(filePath, buffer);

    return {
        originalName: parsed.originalName,
        fileName: uniqueName,
        mimeType: parsed.mimeType,
        size: buffer.length,
        uploadedBy: userId,
        uploadedAt: new Date()
    };
}

async function processAttachmentsPayload(attachments, userId) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return [];
    }

    if (attachments.length > MAX_ATTACHMENTS_PER_REQUEST) {
        throw new Error(`You can upload up to ${MAX_ATTACHMENTS_PER_REQUEST} files at a time.`);
    }

    const saved = [];

    try {
        for (const attachmentPayload of attachments) {
            const stored = await decodeAndStoreAttachment(attachmentPayload, userId);
            saved.push(stored);
        }

        return saved;
    } catch (error) {
        await Promise.all(saved.map(item => removeAttachmentFile(item.fileName)));
        throw error;
    }
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
    try {
        const notes = await Note.find({})
            .sort({ updatedAt: -1 })
            .populate('createdBy', 'name email')
            .populate('attachments.uploadedBy', 'name email')
            .lean();

        res.json({ notes: notes.map(formatNote) });
    } catch (error) {
        console.error('Failed to fetch notes:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

router.post('/', async (req, res) => {
    try {
        const title = (req.body.title || '').trim();
        const content = (req.body.content || '').trim();

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const attachmentsPayload = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const storedAttachments = await processAttachmentsPayload(attachmentsPayload, req.user._id);

        const note = new Note({
            title,
            content,
            createdBy: req.user._id,
            attachments: storedAttachments
        });

        await note.save();
        await note.populate('createdBy', 'name email');
        await note.populate('attachments.uploadedBy', 'name email');

        res.status(201).json({ note: formatNote(note) });
    } catch (error) {
        console.error('Failed to create note:', error);
        const message = error.message || 'Failed to create note';
        res.status(message.includes('Attachment') ? 400 : 500).json({ error: message });
    }
});

router.put('/:noteId', async (req, res) => {
    try {
        const { noteId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(noteId)) {
            return res.status(400).json({ error: 'Invalid note id' });
        }

        const note = await Note.findById(noteId);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const title = typeof req.body.title === 'string' ? req.body.title.trim() : null;
        const content = typeof req.body.content === 'string' ? req.body.content.trim() : null;

        if (title) {
            note.title = title;
        }
        if (content !== null) {
            note.content = content;
        }

        await note.save();
        await note.populate('createdBy', 'name email');
        await note.populate('attachments.uploadedBy', 'name email');

        res.json({ note: formatNote(note) });
    } catch (error) {
        console.error('Failed to update note:', error);
        res.status(500).json({ error: 'Failed to update note' });
    }
});

router.post('/:noteId/attachments', async (req, res) => {
    try {
        const { noteId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(noteId)) {
            return res.status(400).json({ error: 'Invalid note id' });
        }

        const note = await Note.findById(noteId);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const attachmentsPayload = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const storedAttachments = await processAttachmentsPayload(attachmentsPayload, req.user._id);

        note.attachments.push(...storedAttachments);
        note.updatedAt = new Date();
        await note.save();
        await note.populate('createdBy', 'name email');
        await note.populate('attachments.uploadedBy', 'name email');

        res.status(201).json({ note: formatNote(note) });
    } catch (error) {
        console.error('Failed to upload attachments:', error);
        const message = error.message || 'Failed to upload attachments';
        res.status(message.includes('Attachment') ? 400 : 500).json({ error: message });
    }
});

router.delete('/:noteId/attachments/:attachmentId', async (req, res) => {
    try {
        const { noteId, attachmentId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(noteId) || !mongoose.Types.ObjectId.isValid(attachmentId)) {
            return res.status(400).json({ error: 'Invalid note or attachment id' });
        }

        const note = await Note.findById(noteId);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const attachment = note.attachments.id(attachmentId);
        if (!attachment) {
            return res.status(404).json({ error: 'Attachment not found' });
        }

        await removeAttachmentFile(attachment.fileName);
        attachment.deleteOne();
        note.updatedAt = new Date();
        await note.save();
        await note.populate('createdBy', 'name email');
        await note.populate('attachments.uploadedBy', 'name email');

        res.json({ note: formatNote(note) });
    } catch (error) {
        console.error('Failed to delete attachment:', error);
        res.status(500).json({ error: 'Failed to delete attachment' });
    }
});

router.delete('/:noteId', async (req, res) => {
    try {
        const { noteId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(noteId)) {
            return res.status(400).json({ error: 'Invalid note id' });
        }

        const note = await Note.findById(noteId);
        if (!note) {
            return res.status(404).json({ error: 'Note not found' });
        }

        const attachments = note.attachments || [];
        await Promise.all(attachments.map(attachment => removeAttachmentFile(attachment.fileName)));

        await note.deleteOne();

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete note:', error);
        res.status(500).json({ error: 'Failed to delete note' });
    }
});

module.exports = router;
