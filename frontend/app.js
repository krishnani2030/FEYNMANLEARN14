// Feynman Learn Application JavaScript - Backend Integration

// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5050/api' : '/api';

// Mock data (will be replaced with API calls)
let currentUser = null;
let sessions = [];
let chats = [];
let activeChatId = null;
const chatMessages = new Map();

function getMessageId(message) {
    return message?.id || message?._id || null;
}

function normalizeChatMessage(message) {
    if (!message) {
        return null;
    }

    const id = getMessageId(message);
    const createdAt = message.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString();

    return {
        id,
        content: message.content || '',
        status: message.status || 'sent',
        createdAt,
        deliveredAt: message.deliveredAt || null,
        readAt: message.readAt || null,
        sender: message.sender ? {
            id: message.sender.id || message.sender._id || message.sender,
            name: message.sender.name || '',
            email: message.sender.email || ''
        } : null
    };
}

function normalizeChatMessagesList(messages) {
    const normalized = [];
    const indexById = new Map();

    (messages || []).forEach(rawMessage => {
        const message = normalizeChatMessage(rawMessage);
        if (!message) {
            return;
        }

        const messageId = getMessageId(message);
        if (messageId && indexById.has(messageId)) {
            normalized[indexById.get(messageId)] = message;
        } else {
            if (messageId) {
                indexById.set(messageId, normalized.length);
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
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        credentials: 'include', // Important for cookies
        ...options
    };

    try {
        console.log(`Making API request to: ${url}`, { method: config.method || 'GET', body: config.body });
        const response = await fetch(url, config);
        const data = await response.json();
        
        console.log(`API response from ${endpoint}:`, { status: response.status, ok: response.ok, data });

        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
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
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        return data;
    } catch (error) {
        console.error('Signup API error:', error);
        
        // Provide more specific error messages
        if (error.message && error.message.includes('already exists')) {
            throw new Error('User with this email already exists');
        } else if (error.message && error.message.includes('Validation failed')) {
            throw new Error('Validation failed: Please check your input');
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
                description: sessionData.description || ''
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
                description: sessionData.description || ''
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
        startChatPolling();
        fetchChatsAndRender(true);
    }
    showSessionsTab('browse-sessions');
}

function showCreateSession() {
    hideAllPages();
    document.getElementById('create-session-page').classList.remove('hidden');
    currentView = 'create-session';
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
        showAlert('Login successful!', 'success');
        showDashboard();
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Login failed: ' + (error.message || 'Unknown error'), 'error');
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
        await signup(name, email, password);
        showAlert('Account created successfully!', 'success');
        
        // Clear the form on success
        form.reset();
        
        showDashboard();
    } catch (error) {
        console.error('Signup error:', error);
        
        // Handle specific error cases
        let errorMessage = 'Signup failed: ' + (error.message || 'Unknown error');
        
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
        meetLink: document.getElementById('session-meet-link').value
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
        meetLink: document.getElementById('edit-session-meet-link').value
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

// Chat UI helpers
function getChatPartner(chat) {
    if (!chat || !Array.isArray(chat.participants)) {
        return null;
    }

    const partner = chat.participants.find(participant => {
        const participantId = participant?.id || participant?._id || participant;
        const currentId = currentUser?.id || currentUser?._id;
        return participantId && currentId && participantId.toString() !== currentId.toString();
    });

    return partner || chat.participants[0] || null;
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
    const currentId = currentUser?.id || currentUser?._id;
    return senderId && currentId && senderId.toString() === currentId.toString();
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

    chats.sort((a, b) => {
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
        chats = fetchedChats.sort((a, b) => {
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
            actionButton = '<span class="enrollment-status">Enrolled</span>';
        } else if (isFull) {
            actionButton = '<span class="enrollment-status">Full</span>';
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