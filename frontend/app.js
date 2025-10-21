// Feynman Learn Application JavaScript - Backend Integration

// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5050/api' : '/api';

// Mock data (will be replaced with API calls)
let currentUser = null;
let sessions = [];
let chats = [];
let activeChatId = null;
const chatMessages = new Map();
let notes = [];
let activeNoteId = null;
let chatUserSearchTimeout = null;
let isNewChatPanelVisible = false;

function getMessageId(message) {
    return message?.id || message?._id || null;
}

const MESSAGE_STATUS_PRIORITY = {
    error: 0,
    sending: 1,
    sent: 2,
    delivered: 3,
    read: 4
};

function toISOStringSafe(value, fallback = null) {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }

    return date.toISOString();
}

function getMessageStatusRank(status) {
    if (!status) {
        return MESSAGE_STATUS_PRIORITY.sent;
    }

    return MESSAGE_STATUS_PRIORITY[status] ?? MESSAGE_STATUS_PRIORITY.sent;
}

function choosePreferredMessage(existing, candidate) {
    if (!existing) {
        return candidate;
    }
    if (!candidate) {
        return existing;
    }

    const existingRank = getMessageStatusRank(existing.status);
    const candidateRank = getMessageStatusRank(candidate.status);

    if (candidateRank > existingRank) {
        return candidate;
    }
    if (candidateRank < existingRank) {
        return existing;
    }

    if (!existing.id && candidate.id) {
        return candidate;
    }

    if (candidate.readAt && !existing.readAt) {
        return candidate;
    }

    if (candidate.deliveredAt && !existing.deliveredAt) {
        return candidate;
    }

    if (!existing.createdAt && candidate.createdAt) {
        return candidate;
    }

    return existing;
}

function normalizeChatMessage(message) {
    if (!message) {
        return null;
    }

    const messageId = getMessageId(message);
    const createdAtIso = toISOStringSafe(message.createdAt, toISOStringSafe(message.updatedAt, new Date().toISOString()));
    const deliveredAtIso = toISOStringSafe(message.deliveredAt, null);
    const readAtIso = toISOStringSafe(message.readAt, null);

    const senderRaw = message.sender || null;
    let senderId = null;
    let senderName = '';
    let senderEmail = '';

    if (senderRaw && typeof senderRaw === 'object') {
        senderId = senderRaw.id || senderRaw._id || senderRaw.user || null;
        senderName = senderRaw.name || '';
        senderEmail = senderRaw.email || '';
    } else if (senderRaw) {
        senderId = senderRaw;
    }

    if (senderId && typeof senderId === 'object' && typeof senderId.toString === 'function') {
        senderId = senderId.toString();
    }

    const normalizedStatus = message.status && MESSAGE_STATUS_PRIORITY.hasOwnProperty(message.status)
        ? message.status
        : (message.status === 'sending' ? 'sending' : 'sent');

    return {
        id: messageId,
        content: message.content || '',
        status: normalizedStatus,
        createdAt: createdAtIso,
        deliveredAt: deliveredAtIso,
        readAt: readAtIso,
        sender: senderId ? {
            id: senderId,
            name: senderName,
            email: senderEmail
        } : null
    };
}

function createCompositeMessageKey(message) {
    if (!message) {
        return null;
    }

    const senderId = message.sender?.id || null;
    if (!senderId || !message.createdAt || typeof message.content !== 'string') {
        return null;
    }

    return `${senderId}|${message.createdAt}|${message.content}`;
}

function normalizeChatMessagesList(messages) {
    const normalized = [];
    const indexById = new Map();
    const indexByComposite = new Map();

    (messages || []).forEach(rawMessage => {
        const message = normalizeChatMessage(rawMessage);
        if (!message) {
            return;
        }

        const messageId = getMessageId(message);
        if (messageId) {
            if (indexById.has(messageId)) {
                const existingIndex = indexById.get(messageId);
                normalized[existingIndex] = choosePreferredMessage(normalized[existingIndex], message);
            } else {
                indexById.set(messageId, normalized.length);
                const compositeKey = createCompositeMessageKey(message);
                if (compositeKey) {
                    indexByComposite.set(compositeKey, normalized.length);
                }
                normalized.push(message);
            }
            return;
        }

        const compositeKey = createCompositeMessageKey(message);
        if (compositeKey && indexByComposite.has(compositeKey)) {
            const existingIndex = indexByComposite.get(compositeKey);
            normalized[existingIndex] = choosePreferredMessage(normalized[existingIndex], message);
        } else {
            if (compositeKey) {
                indexByComposite.set(compositeKey, normalized.length);
            }
            normalized.push(message);
        }
    });

    return normalized.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function replaceChatMessages(chatId, messages) {
    const normalized = normalizeChatMessagesList(messages);
    chatMessages.set(chatId, normalized);
}

function upsertChatMessage(chatId, message) {
    const normalizedMessage = normalizeChatMessage(message);
    if (!normalizedMessage) {
        return;
    }

    const existing = chatMessages.get(chatId) || [];
    const messageId = getMessageId(normalizedMessage);

    if (!messageId) {
        chatMessages.set(chatId, normalizeChatMessagesList([...existing, normalizedMessage]));
        return;
    }

    const index = existing.findIndex(item => getMessageId(item) === messageId);
    if (index >= 0) {
        existing[index] = normalizedMessage;
        chatMessages.set(chatId, normalizeChatMessagesList(existing));
    } else {
        chatMessages.set(chatId, normalizeChatMessagesList([...existing, normalizedMessage]));
    }
}

function removeChatMessage(chatId, messageId) {
    if (!messageId) {
        return;
    }

    const existing = chatMessages.get(chatId) || [];
    const filtered = existing.filter(message => getMessageId(message) !== messageId);
    chatMessages.set(chatId, filtered);
}
let chatPollingInterval = null;
let currentDiscussionSessionId = null;
let users = [
    {
        "id": "1",
        "name": "Alex Chen",
        "email": "alex@example.com",
        "createdAt": "2025-08-10T09:00:00Z"
    },
    {
        "id": "2", 
        "name": "Sarah Kim",
        "email": "sarah@example.com",
        "createdAt": "2025-08-12T14:30:00Z"
    },
    {
        "id": "3",
        "name": "Mike Johnson", 
        "email": "mike@example.com",
        "createdAt": "2025-08-15T11:15:00Z"
    }
];

// API Helper Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const isFormData = options.body instanceof FormData;

    const providedHeaders = options.headers && typeof options.headers === 'object'
        ? options.headers
        : {};

    const headers = {
        ...providedHeaders
    };

    if (!isFormData && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers,
        credentials: 'include' // Important for cookies
    };

    try {
        if (!isFormData) {
            let loggedBody = config.body;
            if (typeof config.body === 'string' && config.body.length > 500) {
                loggedBody = '[body omitted]';
            }
            console.log(`Making API request to: ${url}`, { method: config.method || 'GET', body: loggedBody });
        } else {
            console.log(`Making API request to: ${url}`, { method: config.method || 'GET', body: '[FormData]' });
        }
        const response = await fetch(url, config);
        const data = await response.json();

        console.log(`API response from ${endpoint}:`, { status: response.status, ok: response.ok, data });

        if (!response.ok) {
            const error = new Error(data.error || `HTTP error! status: ${response.status}`);
            error.status = response.status;
            error.responseData = data;
            throw error;
        }

        return data;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Authentication Functions
async function login(email, password) {
    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        return data;
    } catch (error) {
        if (error.responseData && error.responseData.requiresVerification) {
            error.requiresVerification = true;
            error.email = error.responseData.email;
            error.emailDelivery = error.responseData.emailDelivery;
            error.smtpConfigured = error.responseData.smtpConfigured;
        }

        throw error;
    }
}

async function signup(name, email, password) {
    try {
        console.log('Attempting to signup with email:', email);
        const data = await apiRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });

        console.log('Signup successful:', data);
        return data;
    } catch (error) {
        console.error('Signup API error:', error);

        // Provide more specific error messages
        if (error.message && error.message.includes('already exists')) {
            throw new Error('User with this email already exists');
        } else if (error.message && error.message.includes('Validation failed')) {
            throw new Error('Validation failed: Please check your input');
        }

        if (error.responseData && error.responseData.error) {
            throw new Error(error.responseData.error);
        }

        throw error;
    }
}

async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
        currentUser = null;
        localStorage.removeItem('user');
    } catch (error) {
        console.error('Logout error:', error);
        // Still clear local state even if API call fails
        currentUser = null;
        localStorage.removeItem('user');
    }
}

function hideVerificationNotice() {
    const container = document.getElementById('verification-notice');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
}

function renderVerificationNotice(email, deliveryStatus = 'sent', smtpConfigured = true) {
    const container = document.getElementById('verification-notice');
    if (!container) {
        return;
    }

    const statusMessage = !smtpConfigured
        ? 'Email delivery is not configured. Contact support to get verified.'
        : deliveryStatus === 'failed'
            ? 'We could not send the verification email. Try again in a moment.'
            : deliveryStatus === 'skipped'
                ? 'Email delivery is disabled. We generated a verification link for when email is available.'
                : 'We sent a fresh verification email to your inbox.';

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="verification-card">
            <p><strong>Verify your email to continue.</strong></p>
            <p>${escapeHtml(statusMessage)}</p>
            <p class="verification-email">${escapeHtml(email)}</p>
            <button type="button" class="btn btn--secondary btn--sm" id="resend-verification-btn">Resend verification</button>
        </div>
    `;

    const button = container.querySelector('#resend-verification-btn');
    if (button) {
        if (!smtpConfigured) {
            button.disabled = true;
            button.classList.add('btn--disabled');
        } else {
            button.addEventListener('click', async () => {
                button.disabled = true;
                button.textContent = 'Sending…';
                try {
                    const result = await resendVerificationEmail(email);
                    const message = result?.message || 'Verification email sent!';
                    showAlert(message, 'success');
                    renderVerificationNotice(email, result?.emailDelivery || 'sent', result?.smtpConfigured !== false);
                } catch (error) {
                    showAlert(error.message || 'Failed to send verification email', 'error');
                    button.disabled = false;
                    button.textContent = 'Resend verification';
                }
            });
        }
    }
}

async function resendVerificationEmail(email) {
    try {
        return await apiRequest('/auth/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        if (error.responseData && error.responseData.error) {
            throw new Error(error.responseData.error);
        }
        throw error;
    }
}

async function getCurrentUser() {
    try {
        const data = await apiRequest('/auth/me');
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        return data.user;
    } catch (error) {
        // If API call fails, clear local state
        currentUser = null;
        localStorage.removeItem('user');
        throw error;
    }
}

// Session Functions
async function getSessions() {
    try {
        const data = await apiRequest('/sessions');
        sessions = data.sessions || [];
        return sessions;
    } catch (error) {
        console.error('Failed to fetch sessions:', error);
        // IMPORTANT: Removed fallback to mock data to diagnose actual API issues
        throw error; // Re-throw the error so it can be caught higher up if needed
    }
}

async function getUserSessions() {
    try {
        const data = await apiRequest('/sessions/mine');
        return data.sessions || [];
    } catch (error) {
        console.error('Failed to fetch user sessions:', error);
        return [];
    }
}

async function createSession(sessionData) {
    try {
        // Convert date and time to ISO string
        const dateTime = new Date(`${sessionData.date}T${sessionData.time}`);

        const data = await apiRequest('/sessions', {
            method: 'POST',
            body: JSON.stringify({
                topic: sessionData.topic,
                level: sessionData.level === 'High School' ? 'high_school' : 'college',
                date: dateTime.toISOString(),
                maxParticipants: parseInt(sessionData.maxParticipants),
                meetLink: sessionData.meetLink || '',
                description: sessionData.description || '',
                createMeet: Boolean(sessionData.createMeet)
            })
        });

        return data.session;
    } catch (error) {
        // If backend is not available, create mock session
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.log('Backend not available, creating mock session');
            const mockSession = {
                id: Date.now().toString(),
                topic: sessionData.topic,
                level: sessionData.level,
                date: dateTime.toISOString(),
                time: sessionData.time,
                maxParticipants: parseInt(sessionData.maxParticipants),
                meetLink: sessionData.meetLink || '',
                creatorId: currentUser?.id || '1',
                creatorName: currentUser?.name || 'You',
                participants: [],
                status: 'upcoming',
                createdAt: new Date().toISOString()
            };
            
            // Add to local sessions array
            sessions.push(mockSession);
            return mockSession;
        }
        throw error;
    }
}

async function updateSession(sessionId, sessionData) {
    try {
        // Convert date and time to ISO string
        const dateTime = new Date(`${sessionData.date}T${sessionData.time}`);

        const data = await apiRequest(`/sessions/${sessionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                topic: sessionData.topic,
                level: sessionData.level === 'High School' ? 'high_school' : 'college',
                date: dateTime.toISOString(),
                maxParticipants: parseInt(sessionData.maxParticipants),
                meetLink: sessionData.meetLink || '',
                description: sessionData.description || '',
                createMeet: Boolean(sessionData.createMeet)
            })
        });

        return data.session;
    } catch (error) {
        // If backend is not available, update mock session
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.log('Backend not available, updating mock session');
            const sessionIndex = sessions.findIndex(s => (s.id === sessionId || s._id === sessionId));
            if (sessionIndex !== -1) {
                sessions[sessionIndex] = {
                    ...sessions[sessionIndex],
                    topic: sessionData.topic,
                    level: sessionData.level,
                    date: dateTime.toISOString(),
                    time: sessionData.time,
                    maxParticipants: parseInt(sessionData.maxParticipants),
                    meetLink: sessionData.meetLink || ''
                };
                return sessions[sessionIndex];
            }
        }
        throw error;
    }
}

async function deleteSession(sessionId) {
    try {
        await apiRequest(`/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        return true;
    } catch (error) {
        // If backend is not available, delete mock session
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            console.log('Backend not available, deleting mock session');
            const sessionIndex = sessions.findIndex(s => (s.id === sessionId || s._id === sessionId));
            if (sessionIndex !== -1) {
                sessions.splice(sessionIndex, 1);
                return true;
            }
        }
        throw error;
    }
}

async function enrollInSession(sessionId) {
    try {
        const data = await apiRequest(`/sessions/${sessionId}/enroll`, {
            method: 'POST'
        });
        return data.session;
    } catch (error) {
        throw error;
    }
}

// Chat Functions
async function getChatsList() {
    const data = await apiRequest('/chats');
    return data.chats || [];
}

async function createChatThread(participantId) {
    const data = await apiRequest('/chats', {
        method: 'POST',
        body: JSON.stringify({ participantId })
    });
    return data.chat;
}

async function getChatMessages(chatId) {
    return apiRequest(`/chats/${chatId}/messages`);
}

async function searchUsersForChat(query) {
    const params = new URLSearchParams();
    if (query) {
        params.append('search', query);
    }

    const endpoint = params.toString() ? `/users?${params.toString()}` : '/users';
    const data = await apiRequest(endpoint);
    return data.users || [];
}

async function sendChatMessageRequest(chatId, content) {
    const data = await apiRequest(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content })
    });
    return data;
}

async function acknowledgeChatMessages(chatId, messageIds) {
    if (!messageIds || messageIds.length === 0) {
        return { updated: [] };
    }

    const data = await apiRequest(`/chats/${chatId}/messages/ack`, {
        method: 'PATCH',
        body: JSON.stringify({ messageIds })
    });
    return data;
}

async function markChatMessagesRead(chatId, messageIds) {
    if (!messageIds || messageIds.length === 0) {
        return { updated: [] };
    }

    const data = await apiRequest(`/chats/${chatId}/messages/read`, {
        method: 'PATCH',
        body: JSON.stringify({ messageIds })
    });
    return data;
}

// Notes API Functions
const NOTE_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
]);
const NOTE_ATTACHMENT_ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
const MAX_NOTE_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_NOTE_ATTACHMENTS_PER_UPLOAD = 10;

function getFileExtension(name) {
    if (typeof name !== 'string') {
        return '';
    }

    const parts = name.split('.');
    if (parts.length < 2) {
        return '';
    }

    return parts.pop().toLowerCase();
}

function isSupportedNoteAttachment(file) {
    if (!file) {
        return false;
    }

    const extension = getFileExtension(file.name);
    const mimeType = (file.type || '').toLowerCase();

    return NOTE_ATTACHMENT_ALLOWED_EXTENSIONS.includes(extension) || NOTE_ATTACHMENT_ALLOWED_MIME_TYPES.has(mimeType);
}

function validateNoteAttachmentFile(file) {
    if (!isSupportedNoteAttachment(file)) {
        throw new Error('Unsupported file type. Upload PDF, Word, Excel, or PowerPoint documents.');
    }

    if (typeof file.size === 'number' && file.size > MAX_NOTE_ATTACHMENT_BYTES) {
        throw new Error('Files must be 15 MB or smaller.');
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('Unable to read file.'));
            }
        };
        reader.onerror = () => {
            reject(reader.error || new Error('Unable to read file.'));
        };
        reader.readAsDataURL(file);
    });
}

async function buildNoteAttachmentPayload(file) {
    validateNoteAttachmentFile(file);
    const dataUrl = await readFileAsBase64(file);
    return {
        name: file.name,
        mimeType: file.type || '',
        content: dataUrl
    };
}

async function prepareNoteAttachments(files) {
    const fileArray = Array.from(files || []);

    if (fileArray.length === 0) {
        return [];
    }

    if (fileArray.length > MAX_NOTE_ATTACHMENTS_PER_UPLOAD) {
        throw new Error(`You can upload up to ${MAX_NOTE_ATTACHMENTS_PER_UPLOAD} files at a time.`);
    }

    const payloads = [];
    for (const file of fileArray) {
        const payload = await buildNoteAttachmentPayload(file);
        payloads.push(payload);
    }

    return payloads;
}

async function fetchNotesCollection() {
    if (!currentUser) {
        return [];
    }

    const data = await apiRequest('/notes');
    return Array.isArray(data.notes) ? data.notes.map(normalizeNote).filter(Boolean) : [];
}

async function createNoteRequest({ title, content, files } = {}) {
    if (!currentUser) {
        throw new Error('You must be logged in to create a note.');
    }

    const payload = {
        title: title || 'Untitled note',
        content: content || ''
    };

    if (Array.isArray(files) && files.length > 0) {
        payload.attachments = await prepareNoteAttachments(files);
    }

    const response = await apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    return response.note ? normalizeNote(response.note) : null;
}

async function updateNoteRequest(noteId, { title, content } = {}) {
    if (!noteId) {
        throw new Error('Note id is required');
    }

    const payload = {};

    if (typeof title === 'string') {
        payload.title = title;
    }

    if (typeof content === 'string') {
        payload.content = content;
    }

    const response = await apiRequest(`/notes/${noteId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    });

    return response.note ? normalizeNote(response.note) : null;
}

async function uploadNoteAttachments(noteId, files) {
    if (!noteId) {
        throw new Error('Note id is required');
    }

    const attachments = await prepareNoteAttachments(files);
    if (attachments.length === 0) {
        return null;
    }

    const response = await apiRequest(`/notes/${noteId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({ attachments })
    });

    return response.note ? normalizeNote(response.note) : null;
}

async function deleteNoteAttachmentRequest(noteId, attachmentId) {
    if (!noteId || !attachmentId) {
        throw new Error('Note and attachment ids are required');
    }

    const response = await apiRequest(`/notes/${noteId}/attachments/${attachmentId}`, {
        method: 'DELETE'
    });

    return response.note ? normalizeNote(response.note) : null;
}

async function deleteNoteRequest(noteId) {
    if (!noteId) {
        throw new Error('Note id is required');
    }

    return apiRequest(`/notes/${noteId}`, {
        method: 'DELETE'
    });
}

async function getSessionDiscussionMessages(sessionId) {
    const data = await apiRequest(`/sessions/${sessionId}/discussion`);
    return data.discussion || [];
}

async function postSessionDiscussionMessage(sessionId, message) {
    const data = await apiRequest(`/sessions/${sessionId}/discussion`, {
        method: 'POST',
        body: JSON.stringify({ message })
    });
    return data.message;
}

// Mock data functions (fallback when API is not available)
function getMockSessions() {
    return [
        {
            "id": "1",
            "topic": "Calculus Derivatives",
            "level": "College",
            "date": "2025-08-20",
            "time": "15:00",
            "maxParticipants": 4,
            "meetLink": "https://meet.google.com/abc-defg-hij",
            "creatorId": "2",
            "creatorName": "Sarah Kim",
            "participants": ["1"],
            "status": "upcoming",
            "createdAt": "2025-08-17T10:30:00Z"
        },
        {
            "id": "2",
            "topic": "Photosynthesis Process",
            "level": "High School", 
            "date": "2025-08-19",
            "time": "16:30",
            "maxParticipants": 3,
            "meetLink": "https://meet.google.com/xyz-uvw-rst",
            "creatorId": "3",
            "creatorName": "Mike Johnson",
            "participants": [],
            "status": "upcoming",
            "createdAt": "2025-08-17T12:00:00Z"
        },
        {
            "id": "3",
            "topic": "Spanish Verb Conjugations",
            "level": "High School",
            "date": "2025-08-18",
            "time": "14:00", 
            "maxParticipants": 5,
            "meetLink": "https://meet.google.com/def-ghi-jkl",
            "creatorId": "1",
            "creatorName": "Alex Chen",
            "participants": ["2", "3"],
            "status": "upcoming",
            "createdAt": "2025-08-16T16:45:00Z"
        },
        {
            "id": "4",
            "topic": "World War II Timeline",
            "level": "High School",
            "date": "2025-08-21",
            "time": "10:00",
            "maxParticipants": 6,
            "meetLink": "",
            "creatorId": "1", 
            "creatorName": "Alex Chen",
            "participants": [],
            "status": "upcoming",
            "createdAt": "2025-08-17T09:15:00Z"
        }
    ];
}

// Initialize application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Feynman Learn App Starting...');

    // Set up form event listeners
    setupFormEventListeners();
    initializeChatUI();
    initializeNotesUI();
    renderNotesList();
    renderNotesEditor();

    // Check if user is already logged in
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            // Verify with backend
            await getCurrentUser();
        } catch (error) {
            console.log('Session expired, please log in again');
            currentUser = null;
            localStorage.removeItem('user');
        }
    }

    // Show appropriate page
    if (currentUser) {
        showDashboard();
    } else {
        showLandingPage();
    }

    // Load sessions
    try {
        await getSessions();
    } catch (error) {
        console.log('Using mock data - backend may not be available');
        sessions = getMockSessions();
    }
});

// Set up form event listeners
function setupFormEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Create session form
    const createSessionForm = document.getElementById('create-session-form');
    if (createSessionForm) {
        createSessionForm.addEventListener('submit', handleCreateSession);
    }

    // Edit session form
    const editSessionForm = document.getElementById('edit-session-form');
    if (editSessionForm) {
        editSessionForm.addEventListener('submit', handleEditSession);
    }

    // Tab navigation
    const tabButtons = document.querySelectorAll('.nav-tab');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            showSessionsTab(tab);
        });
    });
}

function initializeChatUI() {
    const chatList = document.getElementById('chat-list');
    if (chatList) {
        chatList.addEventListener('click', handleChatListClick);
    }

    const chatForm = document.getElementById('chat-message-form');
    if (chatForm) {
        chatForm.addEventListener('submit', handleChatMessageSubmit);
    }

    const discussionForm = document.getElementById('session-discussion-form');
    if (discussionForm) {
        discussionForm.addEventListener('submit', handleSessionDiscussionSubmit);
    }

    const startChatButton = document.getElementById('start-chat-button');
    if (startChatButton) {
        startChatButton.addEventListener('click', () => {
            if (!currentUser) {
                showLogin();
                return;
            }
            toggleNewChatPanel();
        });
    }

    const chatUserSearch = document.getElementById('chat-user-search');
    if (chatUserSearch) {
        chatUserSearch.addEventListener('input', handleChatUserSearchInput);
    }

    const chatUserResults = document.getElementById('chat-user-results');
    if (chatUserResults) {
        chatUserResults.addEventListener('click', handleChatUserResultsClick);
    }
}

function initializeNotesUI() {
    const addNoteButton = document.getElementById('add-note-button');
    if (addNoteButton) {
        addNoteButton.addEventListener('click', handleAddNote);
    }

    const notesListElement = document.getElementById('notes-list');
    if (notesListElement) {
        notesListElement.addEventListener('click', handleNotesListClick);
    }

    const notesForm = document.getElementById('notes-editor-form');
    if (notesForm) {
        notesForm.addEventListener('submit', handleNoteFormSubmit);
    }

    const deleteButton = document.getElementById('delete-note-button');
    if (deleteButton) {
        deleteButton.addEventListener('click', handleDeleteNote);
    }

    const uploadButton = document.getElementById('note-attachment-upload');
    if (uploadButton) {
        uploadButton.addEventListener('click', handleNoteAttachmentUploadClick);
    }

    const attachmentInput = document.getElementById('note-attachment-input');
    if (attachmentInput) {
        attachmentInput.addEventListener('change', handleNoteAttachmentInputChange);
    }

    const attachmentsList = document.getElementById('note-attachments-list');
    if (attachmentsList) {
        attachmentsList.addEventListener('click', handleNoteAttachmentListClick);
    }
}

// Rest of the original JavaScript code follows...
// (The navigation, UI, and form handling functions remain the same)

// Global variables
let currentView = 'landing';
let selectedSessionTab = 'browse';

// Navigation functions
function showLandingPage() {
    hideAllPages();
    document.getElementById('landing-page').classList.remove('hidden');
    currentView = 'landing';
}

function showLogin() {
    hideAllPages();
    document.getElementById('login-page').classList.remove('hidden');
    currentView = 'login';
}

function showSignup() {
    hideAllPages();
    document.getElementById('signup-page').classList.remove('hidden');
    currentView = 'signup';
}

function showDashboard() {
    hideAllPages();
    document.getElementById('dashboard-page').classList.remove('hidden');
    currentView = 'dashboard';
    updateDashboard();
    if (currentUser) {
        loadSharedNotes();
        startChatPolling();
        fetchChatsAndRender(true);
    } else {
        resetNotesState();
    }
    toggleNewChatPanel(false);
    showSessionsTab('browse-sessions');
}

function showCreateSession() {
    hideAllPages();
    document.getElementById('create-session-page').classList.remove('hidden');
    currentView = 'create-session';
    const createMeetCheckbox = document.getElementById('session-generate-meet');
    if (createMeetCheckbox) {
        createMeetCheckbox.checked = false;
    }
}

function showEditSession(sessionId) {
    hideAllPages();
    document.getElementById('edit-session-page').classList.remove('hidden');
    currentView = 'edit-session';
    
    // Load session data into the form
    loadSessionForEdit(sessionId);
}

function hideAllPages() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.add('hidden'));
}

// Authentication handlers
async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        showAlert('Logging in...', 'info');
        await login(email, password);
        hideVerificationNotice();
        showAlert('Login successful!', 'success');
        showDashboard();
    } catch (error) {
        console.error('Login error:', error);
        if (error.requiresVerification) {
            showAlert('Please verify your email before signing in.', 'warning');
            renderVerificationNotice(error.email || email, error.emailDelivery, error.smtpConfigured);
            return;
        }

        const message = error.responseData?.error || error.message || 'Unknown error';
        showAlert('Login failed: ' + message, 'error');
    }
}

async function handleSignup(event) {
    event.preventDefault();
    const form = event.target;
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    // Clear any previous error styling
    document.getElementById('signup-email').classList.remove('form-field--error');
    document.getElementById('signup-name').classList.remove('form-field--error');
    document.getElementById('signup-password').classList.remove('form-field--error');

    // Validate that all fields are filled
    if (!name || !email || !password) {
        showAlert('Please fill in all fields', 'error');
        if (!name) document.getElementById('signup-name').classList.add('form-field--error');
        if (!email) document.getElementById('signup-email').classList.add('form-field--error');
        if (!password) document.getElementById('signup-password').classList.add('form-field--error');
        return;
    }

    try {
        showAlert('Creating account...', 'info');
        const result = await signup(name, email, password);
        showAlert('Account created successfully! Check your email to verify your account.', 'success');

        // Clear the form on success
        form.reset();

        showLogin();
        const loginEmail = document.getElementById('login-email');
        if (loginEmail) {
            loginEmail.value = email;
        }
        renderVerificationNotice(email, result?.emailDelivery || 'sent', result?.smtpConfigured !== false);
    } catch (error) {
        console.error('Signup error:', error);

        // Handle specific error cases
        let errorMessage = 'Signup failed: ' + (error.responseData?.error || error.message || 'Unknown error');

        if (error.message && error.message.includes('already exists')) {
            errorMessage = 'This email is already registered. Please use a different email or try logging in instead.';
            // Clear only the email field for duplicate email errors and add error styling
            document.getElementById('signup-email').value = '';
            document.getElementById('signup-email').classList.add('form-field--error');
            document.getElementById('signup-email').focus();
        } else if (error.message && error.message.includes('Validation failed')) {
            errorMessage = 'Please check your input and try again.';
        }
        
        showAlert(errorMessage, 'error');
    }
}

async function handleLogout() {
    await logout();
    resetChatState();
    resetNotesState();
    showLandingPage();
}

// Session handlers
async function handleCreateSession(event) {
    event.preventDefault();
    const form = event.target;
    
    const sessionData = {
        topic: document.getElementById('session-topic').value,
        level: document.getElementById('session-level').value,
        date: document.getElementById('session-date').value,
        time: document.getElementById('session-time').value,
        maxParticipants: document.getElementById('session-capacity').value,
        meetLink: document.getElementById('session-meet-link').value,
        createMeet: document.getElementById('session-generate-meet').checked
    };

    try {
        showAlert('Creating session...', 'info');
        const newSession = await createSession(sessionData);
        showAlert('Session created successfully!', 'success');

        // Reset form
        form.reset();

        // Refresh sessions list and update UI
        await getSessions();
        updateSessionsList();

        // Redirect to dashboard after a delay
        setTimeout(() => {
            showDashboard();
        }, 2000);

    } catch (error) {
        console.error('Create session error:', error);
        showAlert('Failed to create session: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function handleEditSession(event) {
    event.preventDefault();
    const form = event.target;
    const sessionId = document.getElementById('edit-session-id').value;
    
    const sessionData = {
        topic: document.getElementById('edit-session-topic').value,
        level: document.getElementById('edit-session-level').value,
        date: document.getElementById('edit-session-date').value,
        time: document.getElementById('edit-session-time').value,
        maxParticipants: document.getElementById('edit-session-capacity').value,
        meetLink: document.getElementById('edit-session-meet-link').value,
        createMeet: document.getElementById('edit-session-generate-meet').checked
    };

    try {
        showAlert('Updating session...', 'info');
        const updatedSession = await updateSession(sessionId, sessionData);
        showAlert('Session updated successfully!', 'success');

        // Refresh sessions list and update UI
        await getSessions();
        updateSessionsList();

        // Redirect to dashboard after a delay
        setTimeout(() => {
            showDashboard();
        }, 2000);

    } catch (error) {
        console.error('Update session error:', error);
        showAlert('Failed to update session: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function handleDeleteSession() {
    const sessionId = document.getElementById('edit-session-id').value;
    
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
        return;
    }

    try {
        showAlert('Deleting session...', 'info');
        await deleteSession(sessionId);
        showAlert('Session deleted successfully!', 'success');

        // Refresh sessions list and update UI
        await getSessions();
        updateSessionsList();

        // Redirect to dashboard after a delay
        setTimeout(() => {
            showDashboard();
        }, 2000);

    } catch (error) {
        console.error('Delete session error:', error);
        showAlert('Failed to delete session: ' + (error.message || 'Unknown error'), 'error');
    }
}

function loadSessionForEdit(sessionId) {
    // Find the session in the current sessions array
    const session = sessions.find(s => s.id === sessionId || s._id === sessionId);
    if (!session) {
        showAlert('Session not found', 'error');
        showDashboard();
        return;
    }

    // Populate the edit form
    document.getElementById('edit-session-id').value = session.id || session._id;
    document.getElementById('edit-session-topic').value = session.topic;
    
    // Convert backend level format to frontend format
    const editLevel = session.level === 'high_school' ? 'High School' : 
                     session.level === 'college' ? 'College' : session.level;
    document.getElementById('edit-session-level').value = editLevel;
    
    // Convert date and time for the form inputs
    const sessionDate = new Date(session.date);
    document.getElementById('edit-session-date').value = sessionDate.toISOString().split('T')[0];
    document.getElementById('edit-session-time').value = session.time || sessionDate.toTimeString().slice(0, 5);
    
    document.getElementById('edit-session-capacity').value = session.maxParticipants;
    document.getElementById('edit-session-meet-link').value = session.meetLink || '';
    const editGenerateMeet = document.getElementById('edit-session-generate-meet');
    if (editGenerateMeet) {
        editGenerateMeet.checked = Boolean(session.autoGeneratedMeetLink);
    }
}

async function handleEnrollInSession(sessionId) {
    if (!currentUser) {
        showLogin();
        return;
    }

    try {
        showAlert('Enrolling in session...', 'info');
        await enrollInSession(sessionId);
        
        // Immediately update the local sessions array to reflect enrollment
        const sessionIndex = sessions.findIndex(s => (s.id === sessionId || s._id === sessionId));
        if (sessionIndex !== -1) {
            // Add current user to participants if not already there
            const session = sessions[sessionIndex];
            if (!session.participants) {
                session.participants = [];
            }
            
            const isAlreadyEnrolled = session.participants.some(p => {
                if (typeof p === 'string') {
                    return p === currentUser.id;
                } else if (p.user) {
                    return p.user === currentUser.id || p.user.toString() === currentUser.id;
                }
                return false;
            });
            
            if (!isAlreadyEnrolled) {
                session.participants.push(currentUser.id);
            }
        }
        
        // Refresh sessions from backend to get complete updated data
        await getSessions();
        updateSessionsList();
        
        showAlert('Successfully enrolled in session!', 'success');
    } catch (error) {
        console.error('Enrollment error:', error);
        showAlert('Failed to enroll: ' + (error.message || 'Unknown error'), 'error');
    }
}

// UI Update functions
function updateDashboard() {
    if (currentUser) {
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = `Welcome, ${currentUser.name}`;
        }
    }
}

function showSessionsTab(tab) {
    selectedSessionTab = tab;

    // Update tab appearance
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    // Show appropriate content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    const tabContent = document.getElementById(tab);
    if (tabContent) {
        tabContent.classList.remove('hidden');
    }

    if (tab === 'messages') {
        renderChatList();
        if (currentUser) {
            fetchChatsAndRender(!activeChatId);
        }
        return;
    }

    if (tab === 'notes') {
        renderNotesList();
        renderNotesEditor();
        return;
    }

    updateSessionsList();
}

async function updateSessionsList() {
    if (selectedSessionTab === 'messages') {
        return;
    }
    if (selectedSessionTab === 'browse-sessions') {
        // Show all sessions
        const container = document.getElementById('browse-sessions-list');
        const allSessions = await getSessions();
        displaySessions(allSessions, container);
    } else if (selectedSessionTab === 'my-sessions') {
        // Show user's sessions
        const container = document.getElementById('my-sessions-list');
        try {
            const userSessions = await getUserSessions();
            displaySessions(userSessions, container, true);
        } catch (error) {
            // Fallback to mock data
            const userSessions = sessions.filter(s => s.creatorId === currentUser?.id);
            displaySessions(userSessions, container, true);
        }
    }
}

// Notes helpers
function normalizeAttachment(attachment) {
    if (!attachment) {
        return null;
    }

    const id = attachment.id || attachment._id || null;
    const uploadedBy = attachment.uploadedBy && typeof attachment.uploadedBy === 'object'
        ? {
            id: attachment.uploadedBy.id || attachment.uploadedBy._id || attachment.uploadedBy,
            name: attachment.uploadedBy.name || '',
            email: attachment.uploadedBy.email || ''
        }
        : null;

    const url = attachment.url || (attachment.fileName ? `/uploads/notes/${attachment.fileName}` : '');

    return {
        id,
        originalName: attachment.originalName || attachment.name || 'Attachment',
        mimeType: attachment.mimeType || '',
        size: typeof attachment.size === 'number' ? attachment.size : 0,
        uploadedAt: attachment.uploadedAt || attachment.createdAt || null,
        uploadedBy,
        url
    };
}

function normalizeNote(note) {
    if (!note) {
        return null;
    }

    const createdBy = note.createdBy && typeof note.createdBy === 'object'
        ? {
            id: note.createdBy.id || note.createdBy._id || note.createdBy,
            name: note.createdBy.name || '',
            email: note.createdBy.email || ''
        }
        : null;

    const createdAtIso = note.createdAt || note.updatedAt || new Date().toISOString();

    return {
        id: note.id || note._id || `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: note.title || 'Untitled note',
        content: note.content || '',
        createdAt: createdAtIso,
        updatedAt: note.updatedAt || createdAtIso,
        createdBy,
        attachments: Array.isArray(note.attachments) ? note.attachments.map(normalizeAttachment).filter(Boolean) : []
    };
}

function sortNotesDescending(list) {
    return [...list].sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt).getTime();
        return bTime - aTime;
    });
}

async function loadSharedNotes() {
    if (!currentUser) {
        resetNotesState();
        return;
    }

    try {
        const fetched = await fetchNotesCollection();
        notes = sortNotesDescending(fetched);

        if (!activeNoteId || !notes.some(note => note.id === activeNoteId)) {
            activeNoteId = notes.length > 0 ? notes[0].id : null;
        }

        renderNotesList();
        renderNotesEditor();
    } catch (error) {
        console.error('Failed to load notes:', error);
        showAlert('Unable to load shared notes right now. Please try again later.', 'error');
        resetNotesState();
    }
}

function getActiveNote() {
    if (!activeNoteId) {
        return null;
    }
    return notes.find(note => note.id === activeNoteId) || null;
}

function upsertNoteInState(note) {
    const normalized = normalizeNote(note);
    if (!normalized) {
        return;
    }

    const index = notes.findIndex(item => item.id === normalized.id);
    if (index >= 0) {
        notes[index] = normalized;
    } else {
        notes = [normalized, ...notes];
    }

    notes = sortNotesDescending(notes);
}

function removeNoteFromState(noteId) {
    notes = notes.filter(note => note.id !== noteId);
}

function renderNotesList() {
    const listElement = document.getElementById('notes-list');
    if (!listElement) {
        return;
    }

    if (!currentUser) {
        listElement.innerHTML = '<div class="notes-list-empty">Log in to access shared notes.</div>';
        return;
    }

    if (!notes || notes.length === 0) {
        listElement.innerHTML = '<div class="notes-list-empty">No notes yet. Create one to share resources with everyone.</div>';
        return;
    }

    listElement.innerHTML = notes.map(note => {
        const id = escapeHtml(note.id);
        const title = escapeHtml(note.title || 'Untitled note');
        const previewSource = note.content ? note.content.replace(/\s+/g, ' ').trim() : '';
        const preview = previewSource ? escapeHtml(previewSource.slice(0, 80) + (previewSource.length > 80 ? '…' : '')) : 'Add details to this note.';
        const updated = note.updatedAt ? formatNoteTimestamp(note.updatedAt) : '';
        const owner = note.createdBy ? (note.createdBy.name || note.createdBy.email || '') : '';
        const attachmentsCount = note.attachments ? note.attachments.length : 0;

        const metaParts = [];
        if (updated) {
            metaParts.push(escapeHtml(updated));
        }
        if (owner) {
            metaParts.push(escapeHtml(owner));
        }
        if (attachmentsCount > 0) {
            metaParts.push(`${attachmentsCount} file${attachmentsCount === 1 ? '' : 's'}`);
        }

        const meta = metaParts.length > 0 ? metaParts.join(' • ') : '';

        return `
            <button type="button" class="notes-list-item ${note.id === activeNoteId ? 'active' : ''}" data-note-id="${id}">
                <div class="notes-list-item-title">${title}</div>
                <div class="notes-list-item-meta">${meta}</div>
                <p class="notes-list-item-preview">${preview}</p>
            </button>
        `;
    }).join('');
}

function renderNotesEditor() {
    const emptyState = document.getElementById('notes-empty-state');
    const form = document.getElementById('notes-editor-form');
    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content-input');
    const updatedElement = document.getElementById('note-updated-at');
    const ownerElement = document.getElementById('note-owner');
    const uploadButton = document.getElementById('note-attachment-upload');

    if (!emptyState || !form) {
        return;
    }

    if (!currentUser) {
        form.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.innerHTML = '<h4>Notes unavailable</h4><p>Log in to create, view, and download shared notes.</p>';
        return;
    }

    const note = getActiveNote();

    if (!note) {
        form.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.innerHTML = '<h4>No note selected</h4><p>Create or choose a note to start sharing resources.</p>';
        renderNoteAttachments(null);
        if (uploadButton) {
            uploadButton.disabled = true;
        }
        return;
    }

    emptyState.classList.add('hidden');
    form.classList.remove('hidden');

    const ownerId = note.createdBy?.id ? note.createdBy.id.toString() : null;
    const currentId = getCurrentUserId();
    const canEdit = ownerId ? ownerId === currentId : true;

    if (titleInput) {
        titleInput.value = note.title || '';
        titleInput.disabled = !canEdit;
    }
    if (contentInput) {
        contentInput.value = note.content || '';
        contentInput.disabled = !canEdit;
    }
    if (updatedElement) {
        updatedElement.textContent = note.updatedAt ? `Updated ${formatNoteTimestamp(note.updatedAt)}` : '';
    }
    if (ownerElement) {
        const ownerLabel = note.createdBy ? (note.createdBy.name || note.createdBy.email || '') : '';
        ownerElement.textContent = ownerLabel ? `Shared by ${ownerLabel}` : '';
    }

    const saveButton = document.querySelector('#notes-editor-form button[type="submit"]');
    const deleteButton = document.getElementById('delete-note-button');

    if (saveButton) {
        saveButton.disabled = !canEdit;
    }
    if (deleteButton) {
        deleteButton.classList.toggle('hidden', !canEdit);
        deleteButton.disabled = !canEdit;
    }
    if (uploadButton) {
        uploadButton.disabled = !canEdit;
    }

    renderNoteAttachments(note, canEdit);
}

async function handleAddNote() {
    if (!currentUser) {
        showLogin();
        return;
    }

    try {
        const newNote = await createNoteRequest({ title: 'Untitled note', content: '' });
        if (!newNote) {
            return;
        }

        upsertNoteInState(newNote);
        activeNoteId = newNote.id;
        renderNotesList();
        renderNotesEditor();
        focusNoteTitle();
        showAlert('Note created successfully.', 'success');
    } catch (error) {
        console.error('Failed to create note:', error);
        showAlert('Unable to create note: ' + (error.message || 'Unknown error'), 'error');
    }
}

function handleNotesListClick(event) {
    const item = event.target.closest('.notes-list-item');
    if (!item) {
        return;
    }

    const noteId = item.getAttribute('data-note-id');
    if (!noteId || noteId === activeNoteId) {
        return;
    }

    activeNoteId = noteId;
    renderNotesList();
    renderNotesEditor();
}

async function handleNoteFormSubmit(event) {
    event.preventDefault();

    if (!currentUser) {
        showLogin();
        return;
    }

    const note = getActiveNote();
    if (!note) {
        return;
    }

    const ownerId = note.createdBy?.id ? note.createdBy.id.toString() : null;
    if (ownerId && ownerId !== getCurrentUserId()) {
        showAlert('Only the creator can edit this note.', 'info');
        return;
    }

    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content-input');
    const title = titleInput ? titleInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';

    try {
        const updated = await updateNoteRequest(note.id, {
            title: title || 'Untitled note',
            content
        });

        if (updated) {
            upsertNoteInState(updated);
            activeNoteId = updated.id;
            renderNotesList();
            renderNotesEditor();
            showAlert('Note saved.', 'success');
        }
    } catch (error) {
        console.error('Failed to save note:', error);
        showAlert('Unable to save note: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function handleDeleteNote(event) {
    event.preventDefault();

    if (!currentUser) {
        showLogin();
        return;
    }

    const note = getActiveNote();
    if (!note) {
        return;
    }

    const ownerId = note.createdBy?.id ? note.createdBy.id.toString() : null;
    if (ownerId && ownerId !== getCurrentUserId()) {
        showAlert('Only the creator can delete this note.', 'info');
        return;
    }

    try {
        await deleteNoteRequest(note.id);
        removeNoteFromState(note.id);
        activeNoteId = notes.length > 0 ? notes[0].id : null;
        renderNotesList();
        renderNotesEditor();
        showAlert('Note deleted.', 'success');
    } catch (error) {
        console.error('Failed to delete note:', error);
        showAlert('Unable to delete note: ' + (error.message || 'Unknown error'), 'error');
    }
}

function resetNotesState() {
    notes = [];
    activeNoteId = null;
    renderNotesList();
    renderNotesEditor();
    renderNoteAttachments(null);
}

function renderNoteAttachments(note, canEdit = false) {
    const listElement = document.getElementById('note-attachments-list');
    if (!listElement) {
        return;
    }

    if (!note) {
        listElement.innerHTML = '<p class="notes-attachments-empty">Select a note to view shared files.</p>';
        return;
    }

    const attachments = Array.isArray(note.attachments) ? note.attachments : [];

    if (attachments.length === 0) {
        listElement.innerHTML = '<p class="notes-attachments-empty">No files yet. Upload PDFs, Word docs, or spreadsheets to share resources.</p>';
        return;
    }

    listElement.innerHTML = attachments.map(attachment => {
        const attachmentId = attachment.id || attachment._id || '';
        const sizeLabel = attachment.size ? formatFileSize(attachment.size) : '';
        const uploadedLabel = attachment.uploadedAt ? formatNoteTimestamp(attachment.uploadedAt) : '';
        const uploaderRaw = attachment.uploadedBy ? (attachment.uploadedBy.name || attachment.uploadedBy.email || '') : '';
        const uploader = uploaderRaw ? escapeHtml(uploaderRaw) : '';

        const metaParts = [];
        if (sizeLabel) {
            metaParts.push(sizeLabel);
        }
        if (uploadedLabel || uploader) {
            const uploadedText = uploadedLabel ? `Uploaded ${escapeHtml(uploadedLabel)}` : 'Uploaded';
            const byText = uploader ? ` by ${uploader}` : '';
            metaParts.push(`${uploadedText}${byText}`);
        }

        const meta = metaParts.join(' • ');
        const downloadUrl = attachment.url ? escapeHtml(attachment.url) : '#';
        const name = escapeHtml(attachment.originalName || 'Attachment');

        const removeButton = canEdit && attachmentId
            ? `<button type="button" class="note-attachment-remove" data-attachment-id="${escapeHtml(attachmentId)}">Remove</button>`
            : '';

        return `
            <div class="note-attachment" data-attachment-id="${escapeHtml(attachmentId)}">
                <div class="note-attachment-details">
                    <span class="note-attachment-name">${name}</span>
                    <span class="note-attachment-meta">${meta}</span>
                </div>
                <div class="note-attachment-actions">
                    <a class="note-attachment-download" href="${downloadUrl}" target="_blank" rel="noopener">Download</a>
                    ${removeButton}
                </div>
            </div>
        `;
    }).join('');
}

function handleNoteAttachmentUploadClick() {
    if (!currentUser) {
        showLogin();
        return;
    }

    const note = getActiveNote();
    if (!note) {
        showAlert('Select or create a note before uploading files.', 'info');
        return;
    }

    const ownerId = note.createdBy?.id ? note.createdBy.id.toString() : null;
    if (ownerId && ownerId !== getCurrentUserId()) {
        showAlert('Only the creator can add files to this note.', 'info');
        return;
    }

    const input = document.getElementById('note-attachment-input');
    if (input) {
        input.value = '';
        input.click();
    }
}

async function handleNoteAttachmentInputChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (files.length === 0) {
        return;
    }

    if (!currentUser) {
        showLogin();
        return;
    }

    const note = getActiveNote();
    if (!note) {
        showAlert('Select or create a note before uploading files.', 'info');
        return;
    }

    const ownerId = note.createdBy?.id ? note.createdBy.id.toString() : null;
    if (ownerId && ownerId !== getCurrentUserId()) {
        showAlert('Only the creator can add files to this note.', 'info');
        return;
    }

    try {
        const updated = await uploadNoteAttachments(note.id, files);
        if (updated) {
            upsertNoteInState(updated);
            activeNoteId = updated.id;
            renderNotesList();
            renderNotesEditor();
            showAlert('Files uploaded successfully.', 'success');
        }
    } catch (error) {
        console.error('Failed to upload attachments:', error);
        showAlert('Unable to upload files: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function handleNoteAttachmentListClick(event) {
    const removeButton = event.target.closest('.note-attachment-remove');
    if (!removeButton) {
        return;
    }

    event.preventDefault();

    if (!currentUser) {
        showLogin();
        return;
    }

    const attachmentId = removeButton.getAttribute('data-attachment-id');
    if (!attachmentId) {
        return;
    }

    const note = getActiveNote();
    if (!note) {
        return;
    }

    const ownerId = note.createdBy?.id ? note.createdBy.id.toString() : null;
    if (ownerId && ownerId !== getCurrentUserId()) {
        showAlert('Only the creator can remove files from this note.', 'info');
        return;
    }

    try {
        const updated = await deleteNoteAttachmentRequest(note.id, attachmentId);
        if (updated) {
            upsertNoteInState(updated);
            activeNoteId = updated.id;
            renderNotesList();
            renderNotesEditor();
            showAlert('Attachment removed.', 'success');
        }
    } catch (error) {
        console.error('Failed to remove attachment:', error);
        showAlert('Unable to remove attachment: ' + (error.message || 'Unknown error'), 'error');
    }
}

function focusNoteTitle() {
    const titleInput = document.getElementById('note-title-input');
    if (titleInput) {
        titleInput.focus();
        titleInput.select();
    }
}

function formatNoteTimestamp(dateString) {
    if (!dateString) {
        return '';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
        return '';
    }

    const absoluteBytes = Math.max(bytes, 0);
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = absoluteBytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    const formatted = value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1);
    return `${formatted} ${units[index]}`;
}

function getCurrentUserId() {
    if (!currentUser) {
        return null;
    }

    const id = currentUser.id || currentUser._id || currentUser.email;
    return id ? id.toString() : null;
}

// Chat UI helpers
function getChatPartner(chat) {
    if (!chat || !Array.isArray(chat.participants)) {
        return null;
    }

    const partner = chat.participants.find(participant => {
        const participantId = participant?.id || participant?._id || participant;
        const currentId = getCurrentUserId();
        return participantId && currentId && participantId.toString() !== currentId.toString();
    });

    return partner || chat.participants[0] || null;
}

function getChatSummaryPartnerKey(chat) {
    if (!chat || !Array.isArray(chat.participants)) {
        return chat?.id || chat?._id || null;
    }

    if (chat.participantsKey) {
        return chat.participantsKey;
    }

    const currentId = getCurrentUserId();
    if (!currentId) {
        return chat.id || chat._id || null;
    }

    if (chat.participants.length !== 2) {
        return chat.id || chat._id || null;
    }

    const partner = chat.participants.find(participant => {
        const participantId = participant?.id || participant?._id || participant;
        return participantId && participantId.toString() !== currentId;
    });

    if (!partner) {
        return chat.id || chat._id || null;
    }

    const partnerId = partner.id || partner._id || partner;
    return partnerId ? partnerId.toString() : (chat.id || chat._id || null);
}

function dedupeChatsByPartner(chatSummaries, preferredChatId = null) {
    const deduped = new Map();

    (chatSummaries || []).forEach(chat => {
        if (!chat) {
            return;
        }

        const partnerKey = chat.participantsKey || getChatSummaryPartnerKey(chat) || (chat.id || chat._id || Math.random().toString(36).slice(2));
        const normalizedKey = partnerKey ? partnerKey.toString() : (chat.id || chat._id);
        const existing = deduped.get(normalizedKey);

        if (!existing) {
            deduped.set(normalizedKey, chat);
            return;
        }

        const existingId = existing.id || existing._id;
        const chatId = chat.id || chat._id;

        if (preferredChatId && chatId && chatId === preferredChatId) {
            deduped.set(normalizedKey, chat);
            return;
        }

        const existingTime = existing.lastMessageAt ? new Date(existing.lastMessageAt).getTime() : 0;
        const newTime = chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : 0;

        if (newTime > existingTime || (!existingTime && newTime)) {
            deduped.set(normalizedKey, chat);
        } else if (existingId === preferredChatId) {
            deduped.set(normalizedKey, existing);
        }
    });

    return Array.from(deduped.values());
}

function findChatByPartnerId(partnerId) {
    if (!partnerId) {
        return null;
    }

    const normalized = partnerId.toString();
    return chats.find(chat => {
        const partner = getChatPartner(chat);
        const candidateId = partner?.id || partner?._id || partner;
        return candidateId && candidateId.toString() === normalized;
    }) || null;
}

function renderChatList() {
    const chatListElement = document.getElementById('chat-list');
    if (!chatListElement) {
        return;
    }

    if (!currentUser) {
        chatListElement.innerHTML = '<div class="chat-list-empty">Log in to start chatting.</div>';
        return;
    }

    if (!chats || chats.length === 0) {
        chatListElement.innerHTML = '<div class="chat-list-empty">No conversations yet.</div>';
        return;
    }

    const sortedChats = [...chats].sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
    });

    chatListElement.innerHTML = sortedChats.map(chat => {
        const partner = getChatPartner(chat);
        const name = partner?.name || 'Conversation';
        const email = partner?.email || '';
        const chatId = chat.id || chat._id;
        const timeLabel = chat.lastMessageAt ? formatChatTimestamp(chat.lastMessageAt) : '';
        const snippet = chat.lastMessageSnippet ? escapeHtml(chat.lastMessageSnippet) : 'No messages yet';
        const unreadBadge = chat.unreadCount > 0 ? `<span class="chat-unread-badge">${chat.unreadCount}</span>` : '';
        const meta = `<div class="chat-item-meta">${timeLabel ? `<span class="chat-item-time">${timeLabel}</span>` : ''}${unreadBadge}</div>`;

        return `
            <div class="chat-item ${chatId === activeChatId ? 'active' : ''}" data-chat-id="${chatId}" data-partner-name="${escapeHtml(name)}" data-partner-email="${escapeHtml(email)}">
                <div class="chat-item-header">
                    <span class="chat-item-name">${escapeHtml(name)}</span>
                    ${meta}
                </div>
                <p class="chat-item-snippet">${snippet}</p>
            </div>
        `;
    }).join('');
}

function toggleNewChatPanel(forceState = null) {
    const panel = document.getElementById('chat-new');
    const button = document.getElementById('start-chat-button');
    const searchInput = document.getElementById('chat-user-search');

    if (!panel || !button) {
        return;
    }

    let shouldShow = typeof forceState === 'boolean' ? forceState : !isNewChatPanelVisible;

    if (!currentUser) {
        shouldShow = false;
    }

    if (shouldShow) {
        panel.classList.remove('hidden');
        button.textContent = 'Cancel';
        isNewChatPanelVisible = true;
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        renderChatUserResults([], '');
    } else {
        panel.classList.add('hidden');
        button.textContent = 'New Chat';
        isNewChatPanelVisible = false;
        if (searchInput) {
            searchInput.value = '';
        }
        renderChatUserResults([], '');
    }
}

function handleChatUserSearchInput(event) {
    const query = event.target.value.trim();

    if (chatUserSearchTimeout) {
        clearTimeout(chatUserSearchTimeout);
    }

    if (!query) {
        renderChatUserResults([], '');
        return;
    }

    chatUserSearchTimeout = setTimeout(async () => {
        try {
            const users = await searchUsersForChat(query);
            renderChatUserResults(users, query);
        } catch (error) {
            console.error('Failed to search users for chat:', error);
            const container = document.getElementById('chat-user-results');
            if (container) {
                container.innerHTML = '<div class="chat-user-results-empty">Unable to search right now. Please try again.</div>';
            }
        }
    }, 250);
}

function renderChatUserResults(users, query) {
    const container = document.getElementById('chat-user-results');
    if (!container) {
        return;
    }

    if (!currentUser) {
        container.innerHTML = '<div class="chat-user-results-empty">Log in to start new conversations.</div>';
        return;
    }

    if (!query) {
        container.innerHTML = '<div class="chat-user-results-empty">Start typing to find someone to message.</div>';
        return;
    }

    if (!users || users.length === 0) {
        container.innerHTML = `<div class="chat-user-results-empty">No people found for "${escapeHtml(query)}".</div>`;
        return;
    }

    container.innerHTML = users.map(user => {
        const userId = user.id || user._id || '';
        const name = user.name || user.email || 'Member';
        const email = user.email ? `<span class="chat-user-result-email">${escapeHtml(user.email)}</span>` : '';
        return `
            <button type="button" class="chat-user-result" data-user-id="${escapeHtml(userId)}">
                <span class="chat-user-result-name">${escapeHtml(name)}</span>
                ${email}
            </button>
        `;
    }).join('');
}

function handleChatUserResultsClick(event) {
    const target = event.target.closest('.chat-user-result');
    if (!target) {
        return;
    }

    const userId = target.getAttribute('data-user-id');
    if (!userId) {
        return;
    }

    startChatWithUser(userId);
}

async function startChatWithUser(userId) {
    if (!currentUser) {
        showLogin();
        return;
    }

    const existingChat = findChatByPartnerId(userId);
    if (existingChat) {
        const chatId = existingChat.id || existingChat._id;
        activeChatId = chatId;
        renderChatList();
        toggleNewChatPanel(false);
        showSessionsTab('messages');
        await openChat(chatId);
        return;
    }

    try {
        const chat = await createChatThread(userId);
        updateChatSummary(chat);
        renderChatList();
        toggleNewChatPanel(false);
        showSessionsTab('messages');
        await openChat(chat.id || chat._id);
    } catch (error) {
        console.error('Failed to start chat:', error);
        showAlert('Unable to start chat: ' + (error.message || 'Unknown error'), 'error');
    }
}

function handleChatListClick(event) {
    const chatItem = event.target.closest('.chat-item');
    if (!chatItem) {
        return;
    }

    const chatId = chatItem.getAttribute('data-chat-id');
    if (!chatId) {
        return;
    }

    if (chatId === activeChatId) {
        return;
    }

    openChat(chatId);
}

async function openChat(chatId) {
    activeChatId = chatId;
    toggleNewChatPanel(false);
    const chat = chats.find(thread => (thread.id || thread._id) === chatId);
    const placeholder = document.getElementById('chat-placeholder');
    const conversation = document.getElementById('chat-conversation');

    if (placeholder && conversation) {
        placeholder.classList.add('hidden');
        conversation.classList.remove('hidden');
    }

    if (chat) {
        const partner = getChatPartner(chat);
        const nameElement = document.getElementById('chat-participant-name');
        const emailElement = document.getElementById('chat-participant-email');
        if (nameElement) {
            nameElement.textContent = partner?.name || 'Conversation';
        }
        if (emailElement) {
            emailElement.textContent = partner?.email || '';
        }
    }

    renderChatList();
    await loadChatMessages(chatId, { scroll: true });
}

async function loadChatMessages(chatId, { scroll = false } = {}) {
    try {
        const data = await getChatMessages(chatId);
        const messages = (data.messages || []).map(normalizeChatMessage);
        replaceChatMessages(chatId, messages);
        updateChatSummary(data.chat);
        renderChatMessages(chatId);
        renderChatList();
        await markMessagesDelivered(chatId);
        await markMessagesRead(chatId);
        if (scroll) {
            scrollChatToBottom();
        }
    } catch (error) {
        console.error('Failed to load chat messages:', error);
    }
}

function renderChatMessages(chatId) {
    const container = document.getElementById('chat-messages');
    if (!container) {
        return;
    }

    const messages = chatMessages.get(chatId) || [];

    if (messages.length === 0) {
        container.innerHTML = '<div class="chat-notification">No messages yet. Start the conversation!</div>';
        return;
    }

    container.innerHTML = messages.map(message => {
        const outgoing = isOutgoingMessage(message);
        const status = formatMessageStatus(message.status);
        const timestamp = formatChatTimestamp(message.createdAt);
        const statusMarkup = outgoing ? `<span class="chat-message-status">${status}</span>` : '';

        return `
            <div class="chat-message ${outgoing ? 'outgoing' : 'incoming'}" data-message-id="${message.id || message._id}">
                <p class="chat-message-text">${escapeHtml(message.content)}</p>
                <div class="chat-message-meta">
                    <span>${timestamp}</span>
                    ${statusMarkup}
                </div>
            </div>
        `;
    }).join('');

    scrollChatToBottom();
}

function formatMessageStatus(status) {
    switch (status) {
        case 'sending':
            return 'Sending…';
        case 'sent':
            return 'Sent';
        case 'delivered':
            return 'Delivered';
        case 'read':
            return 'Read';
        case 'error':
            return 'Failed';
        default:
            return status || '';
    }
}

function isOutgoingMessage(message) {
    const senderId = message?.sender?.id || message?.sender?._id || message?.sender;
    const currentId = getCurrentUserId();

    if (!senderId || !currentId) {
        return false;
    }

    const normalizedSender = senderId.toString ? senderId.toString() : String(senderId);
    return normalizedSender === currentId.toString();
}

function scrollChatToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function resetChatConversationPanel() {
    const placeholder = document.getElementById('chat-placeholder');
    const conversation = document.getElementById('chat-conversation');
    if (placeholder && conversation) {
        placeholder.classList.remove('hidden');
        conversation.classList.add('hidden');
    }

    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '<div class="chat-notification">Select a conversation to get started.</div>';
    }
}

function updateChatSummary(summary) {
    if (!summary) {
        return;
    }

    const chatId = summary.id || summary._id;
    const existingIndex = chats.findIndex(chat => (chat.id || chat._id) === chatId);

    if (existingIndex >= 0) {
        chats[existingIndex] = { ...chats[existingIndex], ...summary };
    } else {
        chats.push(summary);
    }

    const preferredChatId = activeChatId || chatId;
    const deduped = dedupeChatsByPartner(chats, preferredChatId);
    chats = deduped.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
    });
}

async function fetchChatsAndRender(forceReloadActive = false) {
    if (!currentUser) {
        return;
    }

    try {
        const fetchedChats = await getChatsList();
        const deduped = dedupeChatsByPartner(fetchedChats, activeChatId);
        chats = deduped.sort((a, b) => {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTime - aTime;
        });
        renderChatList();

        if (activeChatId) {
            const hasActiveChat = chats.some(chat => (chat.id || chat._id) === activeChatId);
            if (hasActiveChat && forceReloadActive) {
                await loadChatMessages(activeChatId);
            } else if (!hasActiveChat) {
                activeChatId = null;
                resetChatConversationPanel();
            }
        }
    } catch (error) {
        console.error('Failed to fetch chats:', error);
    }
}

function startChatPolling() {
    stopChatPolling();
    if (!currentUser) {
        return;
    }

    chatPollingInterval = setInterval(async () => {
        await fetchChatsAndRender(false);
        if (activeChatId) {
            await loadChatMessages(activeChatId);
        }
    }, 5000);
}

function stopChatPolling() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
}

function resetChatState() {
    stopChatPolling();
    chats = [];
    activeChatId = null;
    chatMessages.clear();
    renderChatList();
    resetChatConversationPanel();
    toggleNewChatPanel(false);
}

async function handleChatMessageSubmit(event) {
    event.preventDefault();

    if (!currentUser) {
        showLogin();
        return;
    }

    if (!activeChatId) {
        showAlert('Select a chat before sending a message.', 'info');
        return;
    }

    const input = document.getElementById('chat-message-input');
    const content = input ? input.value.trim() : '';

    if (!content) {
        return;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const temporaryMessage = {
        id: tempId,
        content,
        status: 'sending',
        createdAt: new Date().toISOString(),
        sender: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email
        }
    };

    upsertChatMessage(activeChatId, temporaryMessage);
    renderChatMessages(activeChatId);
    scrollChatToBottom();

    if (input) {
        input.value = '';
        input.focus();
    }

    try {
        const response = await sendChatMessageRequest(activeChatId, content);
        const savedMessage = response.message;
        updateChatSummary(response.chat);
        removeChatMessage(activeChatId, tempId);
        upsertChatMessage(activeChatId, { ...savedMessage, status: savedMessage.status || 'sent' });
        renderChatMessages(activeChatId);
        renderChatList();
    } catch (error) {
        console.error('Send chat message error:', error);
        const storedMessages = chatMessages.get(activeChatId) || [];
        const failed = storedMessages.find(msg => msg.id === tempId);
        if (failed) {
            failed.status = 'error';
        }
        chatMessages.set(activeChatId, storedMessages);
        renderChatMessages(activeChatId);
        showAlert('Failed to send message: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function markMessagesDelivered(chatId) {
    const storedMessages = chatMessages.get(chatId) || [];
    const undeliveredMessages = storedMessages.filter(message => !isOutgoingMessage(message) && message.status === 'sent');
    if (undeliveredMessages.length === 0) {
        return;
    }

    try {
        const ids = Array.from(new Set(undeliveredMessages.map(msg => msg.id)));
        const response = await acknowledgeChatMessages(chatId, ids);
        const updates = response.updated || [];
        if (updates.length > 0) {
            const refreshed = chatMessages.get(chatId) || [];
            updates.forEach(update => {
                const target = refreshed.find(msg => msg.id === update.id);
                if (target) {
                    target.status = update.status;
                    target.deliveredAt = update.deliveredAt;
                    target.readAt = update.readAt || target.readAt;
                }
            });
            chatMessages.set(chatId, normalizeChatMessagesList(refreshed));
            renderChatMessages(chatId);
        }
    } catch (error) {
        console.error('Failed to acknowledge messages:', error);
    }
}

async function markMessagesRead(chatId) {
    if (chatId !== activeChatId) {
        return;
    }

    const storedMessages = chatMessages.get(chatId) || [];
    const unreadMessages = storedMessages.filter(message => !isOutgoingMessage(message) && message.status !== 'read');
    if (unreadMessages.length === 0) {
        return;
    }

    try {
        const ids = Array.from(new Set(unreadMessages.map(msg => msg.id)));
        const response = await markChatMessagesRead(chatId, ids);
        const updates = response.updated || [];
        if (updates.length > 0) {
            const refreshed = chatMessages.get(chatId) || [];
            updates.forEach(update => {
                const target = refreshed.find(msg => msg.id === update.id);
                if (target) {
                    target.status = update.status;
                    target.deliveredAt = update.deliveredAt;
                    target.readAt = update.readAt;
                }
            });
            chatMessages.set(chatId, normalizeChatMessagesList(refreshed));
            renderChatMessages(chatId);
        }

        if (response.chat) {
            updateChatSummary(response.chat);
            renderChatList();
        }
    } catch (error) {
        console.error('Failed to mark messages as read:', error);
    }
}

function displaySessions(sessionsList, container, isOwner = false) {
    if (!sessionsList || sessionsList.length === 0) {
        container.innerHTML = '<p class="empty-state">No sessions found.</p>';
        return;
    }

    container.innerHTML = sessionsList.map(session => {
        const isEnrolled = session.participants && session.participants.some(p => {
            if (typeof p === 'string') {
                return p === currentUser?.id || p === currentUser?._id;
            } else if (p.user) {
                return p.user === currentUser?.id || p.user === currentUser?._id || 
                       p.user.toString() === currentUser?.id || p.user.toString() === currentUser?._id;
            }
            return false;
        });
        
        const isCreator = session.creatorId === currentUser?.id || 
                         session.creator?.id === currentUser?.id || 
                         session.creator?._id === currentUser?.id ||
                         (session.creator && session.creator.toString() === currentUser?.id);

        // Debug logging for enrollment
        console.log('Session enrollment check:', {
            topic: session.topic,
            sessionId: session.id || session._id,
            participants: session.participants,
            currentUserId: currentUser?.id,
            isEnrolled: isEnrolled,
            isCreator: isCreator
        });
        const isFull = session.participants && session.participants.length >= session.maxParticipants;

        let actionButton = '';
        if (isCreator) {
            actionButton = `<button class="btn btn--outline btn--sm" onclick="showEditSession('${session.id || session._id}')">Edit</button>`;
        } else if (isEnrolled) {
            actionButton = '<button class="btn btn--enrolled btn--sm" disabled>Enrolled</button>';
        } else if (isFull) {
            actionButton = '<button class="btn btn--full btn--sm" disabled>Full</button>';
        } else if (session.meetLink && session.status === 'ongoing') {
            actionButton = `<button class="btn btn--primary btn--sm" onclick="window.open('${session.meetLink}', '_blank')">Join Now</button>`;
        } else {
            actionButton = `<button class="btn btn--primary btn--sm" onclick="handleEnrollInSession('${session.id || session._id}')">Enroll</button>`;
        }

        const detailsButton = `<button class="btn btn--secondary btn--sm" onclick="openSessionDetails('${session.id || session._id}')">Details</button>`;

        // Convert backend level format to display format
        const displayLevel = session.level === 'high_school' ? 'High School' : 
                           session.level === 'college' ? 'College' : session.level;
        
        return `
            <div class="session-card ${isCreator ? 'session-card--own' : ''}">
                <div class="session-header">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <h3 style="margin: 0;">${session.topic}</h3>
                        ${isCreator ? '<span class="session-owner-badge">Created by you</span>' : ''}
                    </div>
                    <span class="session-level">${displayLevel}</span>
                </div>
                <div class="session-details">
                    <p><strong>Instructor:</strong> ${session.creatorName || session.creator?.name || 'Unknown'}</p>
                    <p><strong>Date:</strong> ${formatDate(session.date)}</p>
                    <p><strong>Time:</strong> ${session.time || formatTime(session.date)}</p>
                    <p><strong>Participants:</strong> ${session.participants?.length || 0}/${session.maxParticipants}</p>
                </div>
                <div class="session-actions">
                    ${detailsButton}
                    ${actionButton}
                </div>
            </div>
        `;
    }).join('');
}

function openSessionDetails(sessionId) {
    const session = sessions.find(item => (item.id || item._id) === sessionId);
    if (!session) {
        showAlert('Session not found.', 'error');
        return;
    }

    const modal = document.getElementById('session-modal');
    const modalDetails = document.getElementById('modal-details');
    if (!modal || !modalDetails) {
        return;
    }

    const creatorName = session.creatorName || session.creator?.name || 'Unknown instructor';
    const sessionDate = formatDate(session.date);
    const sessionTime = session.time || formatTime(session.date);
    const creatorId = session.creatorId || session.creator?._id || (typeof session.creator === 'string' ? session.creator : null);
    const currentUserId = currentUser?.id || currentUser?._id;
    const canMessageInstructor = creatorId && (!currentUserId || creatorId.toString() !== currentUserId.toString());

    modalDetails.innerHTML = `
        <div class="session-details-overview">
            <p><strong>Topic:</strong> ${escapeHtml(session.topic)}</p>
            <p><strong>Instructor:</strong> ${escapeHtml(creatorName)}</p>
            <p><strong>Level:</strong> ${escapeHtml(session.level === 'high_school' ? 'High School' : session.level === 'college' ? 'College' : session.level)}</p>
            <p><strong>Date:</strong> ${escapeHtml(sessionDate)}</p>
            <p><strong>Time:</strong> ${escapeHtml(sessionTime)}</p>
            <p><strong>Participants:</strong> ${(session.participants?.length || 0)} / ${session.maxParticipants}</p>
            ${canMessageInstructor ? '<button class="btn btn--secondary btn--sm" id="session-message-host">Message instructor</button>' : ''}
        </div>
    `;

    currentDiscussionSessionId = sessionId;

    const discussionContainer = document.getElementById('session-discussion-container');
    const discussionForm = document.getElementById('session-discussion-form');
    const discussionInput = document.getElementById('session-discussion-input');

    if (discussionContainer) {
        discussionContainer.classList.remove('hidden');
    }

    if (discussionForm) {
        discussionForm.dataset.sessionId = sessionId;
        const submitButton = discussionForm.querySelector('button[type="submit"]');
        if (!currentUser) {
            if (discussionInput) {
                discussionInput.disabled = true;
                discussionInput.placeholder = 'Log in to participate in the discussion';
            }
            if (submitButton) {
                submitButton.disabled = true;
            }
        } else {
            if (discussionInput) {
                discussionInput.disabled = false;
                discussionInput.placeholder = 'Share updates or ask a question';
            }
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    }

    if (modal) {
        modal.classList.remove('hidden');
    }

    if (canMessageInstructor) {
        const messageButton = modalDetails.querySelector('#session-message-host');
        if (messageButton) {
            messageButton.addEventListener('click', async () => {
                if (!currentUser) {
                    showLogin();
                    return;
                }

                try {
                    const chat = await createChatThread(creatorId);
                    updateChatSummary(chat);
                    renderChatList();
                    showSessionsTab('messages');
                    openChat(chat.id || chat._id);
                } catch (error) {
                    console.error('Failed to start chat with instructor:', error);
                    showAlert('Unable to start chat: ' + (error.message || 'Unknown error'), 'error');
                }
            });
        }
    }

    loadSessionDiscussion(sessionId);
}

function closeModal() {
    const modal = document.getElementById('session-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentDiscussionSessionId = null;
}

async function loadSessionDiscussion(sessionId) {
    try {
        const messages = await getSessionDiscussionMessages(sessionId);
        renderSessionDiscussion(messages);
    } catch (error) {
        console.error('Failed to load session discussion:', error);
        renderSessionDiscussion([]);
    }
}

function renderSessionDiscussion(messages) {
    const thread = document.getElementById('session-discussion-thread');
    const emptyState = document.getElementById('session-discussion-empty');

    if (!thread || !emptyState) {
        return;
    }

    if (!messages || messages.length === 0) {
        thread.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    thread.innerHTML = messages.map(message => {
        const author = message.sender?.name || 'Participant';
        const timestamp = formatDiscussionTimestamp(message.createdAt);
        return `
            <div class="discussion-message">
                <div class="discussion-message-header">
                    <span class="discussion-message-author">${escapeHtml(author)}</span>
                    <span class="discussion-message-time">${escapeHtml(timestamp)}</span>
                </div>
                <p class="discussion-message-text">${escapeHtml(message.message)}</p>
            </div>
        `;
    }).join('');

    thread.scrollTop = thread.scrollHeight;
}

function appendSessionDiscussionMessage(message) {
    if (!message || message.session && message.session !== currentDiscussionSessionId) {
        return;
    }

    const thread = document.getElementById('session-discussion-thread');
    const emptyState = document.getElementById('session-discussion-empty');
    if (!thread) {
        return;
    }

    if (emptyState) {
        emptyState.classList.add('hidden');
    }

    const author = message.sender?.name || 'Participant';
    const timestamp = formatDiscussionTimestamp(message.createdAt);
    const markup = `
        <div class="discussion-message">
            <div class="discussion-message-header">
                <span class="discussion-message-author">${escapeHtml(author)}</span>
                <span class="discussion-message-time">${escapeHtml(timestamp)}</span>
            </div>
            <p class="discussion-message-text">${escapeHtml(message.message)}</p>
        </div>
    `;

    thread.insertAdjacentHTML('beforeend', markup);
    thread.scrollTop = thread.scrollHeight;
}

async function handleSessionDiscussionSubmit(event) {
    event.preventDefault();

    if (!currentUser) {
        showLogin();
        return;
    }

    const form = event.target;
    const sessionId = form.dataset.sessionId || currentDiscussionSessionId;
    if (!sessionId) {
        return;
    }

    const input = document.getElementById('session-discussion-input');
    const message = input ? input.value.trim() : '';

    if (!message) {
        return;
    }

    try {
        const savedMessage = await postSessionDiscussionMessage(sessionId, message);
        if (input) {
            input.value = '';
        }
        if (sessionId === currentDiscussionSessionId) {
            appendSessionDiscussionMessage(savedMessage);
        }
    } catch (error) {
        console.error('Failed to post discussion message:', error);
        showAlert('Failed to post message: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Alert system
function showAlert(message, type = 'info') {
    const alertDiv = document.getElementById('alert');
    const alertMessage = document.getElementById('alert-message');
    
    if (alertDiv && alertMessage) {
        alertMessage.textContent = message;
        alertDiv.className = `alert alert--${type}`;
        alertDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 5000);
    } else {
        // Fallback to browser alert
        alert(message);
    }
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatChatTimestamp(dateString) {
    if (!dateString) {
        return '';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDiscussionTimestamp(dateString) {
    if (!dateString) {
        return '';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const datePart = date.toLocaleDateString();
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Set minimum date to today for session creation
document.addEventListener('DOMContentLoaded', function() {
    const dateInput = document.getElementById('session-date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
    }

    // Add event listeners to clear error styling when users start typing
    const signupEmail = document.getElementById('signup-email');
    if (signupEmail) {
        signupEmail.addEventListener('input', function() {
            this.classList.remove('form-field--error');
        });
    }

    const signupName = document.getElementById('signup-name');
    if (signupName) {
        signupName.addEventListener('input', function() {
            this.classList.remove('form-field--error');
        });
    }

    const signupPassword = document.getElementById('signup-password');
    if (signupPassword) {
        signupPassword.addEventListener('input', function() {
            this.classList.remove('form-field--error');
        });
    }
});

console.log('Feynman Learn App Loaded');