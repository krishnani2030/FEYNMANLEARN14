// Feynman Learn Application JavaScript - Backend Integration

// API Configuration
// Use same-origin API base so frontend and backend run on the same port
const API_BASE_URL = '/api';

// Mock data (will be replaced with API calls)
let currentUser = null;
let sessions = [];
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
async function login(identifier, password) {
    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier, password })
        });

        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        // Join user-specific room immediately after login
        if (window.appSocket && currentUser?.id) {
            window.appSocket.emit('join-user', currentUser.id);
        }
        return data;
    } catch (error) {
        throw error;
    }
}

async function signup(name, email, password, schoolGrade, subjectInterests) {
    try {
        console.log('Attempting to signup with email:', email);
        const data = await apiRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, schoolGrade, subjectInterests })
        });

        console.log('Signup successful:', data);
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        // Join user-specific room immediately after signup
        if (window.appSocket && currentUser?.id) {
            window.appSocket.emit('join-user', currentUser.id);
        }
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
        // Ensure we are in the user-specific room for private messages
        if (window.appSocket && currentUser?.id) {
            window.appSocket.emit('join-user', currentUser.id);
        }
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

    // Initialize Socket.IO (same-origin)
    const socket = io(window.location.origin, {
        withCredentials: true
    });
    window.appSocket = socket;

    socket.on('connect', () => {
        console.log('Connected to Socket.IO');
        // Join a default room or a user-specific room if needed
        // For now, let's assume a general chat room
        socket.emit('join-session', 'general-chat'); 
        if (currentUser?.id) {
            socket.emit('join-user', currentUser.id);
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO');
    });

    socket.on('chat-message', (message) => {
        console.log('Received chat message:', message);
        displayChatMessage(message);
    });

    // Handle sending chat messages
    const chatMessageInput = document.getElementById('chat-message-input');
    const sendChatButton = document.getElementById('send-chat-button');

    if (sendChatButton) {
        sendChatButton.addEventListener('click', () => {
            sendChatMessage(chatMessageInput.value);
            chatMessageInput.value = '';
        });
    }

    if (chatMessageInput) {
        chatMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage(chatMessageInput.value);
                chatMessageInput.value = '';
            }
        });
    }

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

    // Event listener for starting a private video call
    document.getElementById('start-private-video-call-btn')?.addEventListener('click', () => {
        if (selectedChatRecipient) {
            startPrivateVideoCall(selectedChatRecipient._id, selectedChatRecipient.name);
        } else {
            showAlert('Please select a user to start a video call.', 'error');
        }
    });

    // Event listener for starting a private voice (audio-only) call
    document.getElementById('start-private-voice-call-btn')?.addEventListener('click', () => {
        if (selectedChatRecipient) {
            startPrivateVoiceCall(selectedChatRecipient._id, selectedChatRecipient.name);
        } else {
            showAlert('Please select a user to start a voice call.', 'error');
        }
    });
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

// Rest of the original JavaScript code follows...
// (The navigation, UI, and form handling functions remain the same)

// Global variables
let currentView = 'landing';
let selectedSessionTab = 'browse';
let selectedChatRecipient = null; // Stores the currently selected user for private chat

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
    showSessionsTab('browse-sessions');
    // Ensure user joins their private room for receiving DMs
    if (window.appSocket && currentUser?.id) {
        window.appSocket.emit('join-user', currentUser.id);
    }
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

function showVideoConference(sessionId, topic) {
    hideAllPages();
    document.getElementById('video-conference-page').classList.remove('hidden');
    document.getElementById('conference-topic').textContent = topic;
    currentView = 'video-conference';
    
    // Initialize Jitsi Meet
    const domain = 'meet.jit.si'; // Using public Jitsi Meet instance
    const options = {
        roomName: `feynman-learn-${sessionId}`,
        width: '100%',
        height: '100%',
        parentNode: document.querySelector('#jitsi-container'),
        configOverwrite: {},
        interfaceConfigOverwrite: {
            // Optional: customize Jitsi Meet UI
            DEFAULT_BACKGROUND_IMAGE: 'https://feynmanlearn.com/background.jpg',
            APPLICATION_NAME: 'Feynman Learn',
            NATIVE_APP_NAME: 'Feynman Learn',
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'profile', 'chat', 'raisehand',
                'sharedvideo', 'settings', 'tileview', 'toggle-camera'
            ],
        },
    };
    const api = new JitsiMeetExternalAPI(domain, options);

    // Handle Jitsi API events (optional)
    api.addEventListener('videoConferenceJoined', (response) => {
        console.log('Jitsi conference joined', response);
    });
    api.addEventListener('readyToClose', () => {
        console.log('Jitsi conference ready to close');
        showDashboard(); // Go back to dashboard when conference ends
    });
}

function startPrivateVideoCall(recipientId, recipientName) {
    hideAllPages();
    document.getElementById('video-conference-page').classList.remove('hidden');
    document.getElementById('conference-topic').textContent = `Call with ${recipientName}`;
    currentView = 'video-conference';

    const domain = 'meet.jit.si';
    const options = {
        roomName: `feynman-learn-private-${currentUser.id}-${recipientId}`,
        width: '100%',
        height: '100%',
        parentNode: document.querySelector('#jitsi-container'),
        configOverwrite: {},
        interfaceConfigOverwrite: {
            DEFAULT_BACKGROUND_IMAGE: 'https://feynmanlearn.com/background.jpg',
            APPLICATION_NAME: 'Feynman Learn',
            NATIVE_APP_NAME: 'Feynman Learn',
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'profile', 'chat', 'raisehand',
                'sharedvideo', 'settings', 'tileview', 'toggle-camera'
            ],
        },
    };
    const api = new JitsiMeetExternalAPI(domain, options);

    api.addEventListener('videoConferenceJoined', (response) => {
        console.log('Jitsi private conference joined', response);
    });
    api.addEventListener('readyToClose', () => {
        console.log('Jitsi private conference ready to close');
        showDashboard();
    });
}

function hideAllPages() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.add('hidden'));
}

// Authentication handlers
async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const identifier = document.getElementById('login-identifier').value;
    const password = document.getElementById('login-password').value;

    try {
        showAlert('Logging in...', 'info');
        await login(identifier, password);
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
    const schoolGrade = document.getElementById('signup-school-grade').value;
    const subjectInterests = document.getElementById('signup-subject-interests').value.split(',').map(item => item.trim()).filter(item => item !== '');

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
        await signup(name, email, password, schoolGrade, subjectInterests);
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
    document.getElementById(tab).classList.remove('hidden');

    // Call specific update functions for each tab
    if (tab === 'my-sessions' || tab === 'browse-sessions') {
        updateSessionsList();
    } else if (tab === 'chat') {
        updateChatUI();
    } else if (tab === 'notes') {
        updateNotesUI();
    }
}

async function updateSessionsList() {
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
        } else if (session.status === 'ongoing') {
            actionButton = `<button class="btn btn--primary btn--sm" onclick="showVideoConference('${session.id || session._id}', '${session.topic}')">Join Now</button>`;
        } else {
            actionButton = `<button class="btn btn--primary btn--sm" onclick="handleEnrollInSession('${session.id || session._id}')">Enroll</button>`;
        }

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
                    ${actionButton}
                </div>
            </div>
        `;
    }).join('');
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

// New functions for Chat and Notes
let chatUserSearchTimeout;
let allUsernamesCache = null; // [{_id, username, name}]

async function ensureAllUsernamesLoaded() {
    if (allUsernamesCache) return allUsernamesCache;
    try {
        const data = await apiRequest('/users/all-usernames');
        allUsernamesCache = (data.users || [])
            .filter(u => u && typeof u.username === 'string' && u.username.length > 0)
            .map(u => ({
                _id: u._id,
                username: u.username,
                name: u.name
            }));
        return allUsernamesCache;
    } catch (e) {
        console.error('Failed to load all usernames:', e);
        allUsernamesCache = [];
        return allUsernamesCache;
    }
}

function findPrefixRange(sortedArray, prefix) {
    // Binary search lower and upper bounds for prefix on .username
    let lo = 0, hi = sortedArray.length;
    const p = prefix.toLowerCase();
    // lower bound
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (sortedArray[mid].username < p) lo = mid + 1; else hi = mid;
    }
    const start = lo;
    // upper bound for prefix by next string after prefix
    lo = 0; hi = sortedArray.length;
    const next = p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1);
    const upperKey = p + '\uffff'; // simpler: highest possible continuation
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (sortedArray[mid].username <= upperKey) lo = mid + 1; else hi = mid;
    }
    const end = lo;
    // filter to actual prefix match (defensive) and cap
    const results = [];
    for (let i = start; i < end && results.length < 10; i++) {
        if (sortedArray[i].username.startsWith(p)) results.push(sortedArray[i]);
        else break;
    }
    return results;
}

function updateChatUI() {
    console.log('Updating chat UI...');

    // Get references to main chat sections
    const chatMainArea = document.getElementById('chat-main-area');
    const chatNewMessageSection = document.getElementById('chat-new-message-section');
    const activeChatWindow = document.getElementById('active-chat-window');
    const existingChatsList = document.getElementById('existing-chats-list');
    const startPrivateVideoCallBtn = document.getElementById('start-private-video-call-btn');

    // Always show the main chat area when chat tab is active
    chatMainArea?.classList.remove('hidden');

    // By default, show existing chats and general chat
    chatNewMessageSection?.classList.add('hidden');
    activeChatWindow?.classList.remove('hidden');
    selectedChatRecipient = null; // Ensure no recipient is selected initially
    document.getElementById('chat-recipient-name').textContent = 'General Chat';
    document.getElementById('chat-recipient-details').innerHTML = '';
    document.getElementById('chat-messages').innerHTML = '';
    loadGeneralChatHistory('general-chat');
    startPrivateVideoCallBtn?.classList.add('hidden'); // Hide video call button for general chat

    // Update existing chats list
    fetchAndDisplayExistingChats();

    // Preload usernames for suggestions
    ensureAllUsernamesLoaded();

    // Attach event listeners if not already attached
    const startNewChatBtn = document.getElementById('start-new-chat-btn');
    if (startNewChatBtn && !startNewChatBtn.dataset.listenersAttached) {
        startNewChatBtn.addEventListener('click', () => {
            // Show new message section, hide active chat window
            chatNewMessageSection?.classList.remove('hidden');
            activeChatWindow?.classList.add('hidden');
            document.getElementById('chat-user-search-input').value = ''; // Clear search input
            document.getElementById('chat-user-suggestions').innerHTML = ''; // Clear suggestions
            selectedChatRecipient = null;

            // Remove active state from all existing chat items
            document.querySelectorAll('.existing-chat-item').forEach(item => item.classList.remove('active'));
            document.getElementById('chat-recipient-name').textContent = 'Select a user to chat';
            document.getElementById('chat-recipient-details').innerHTML = '';
            document.getElementById('chat-messages').innerHTML = '';
            startPrivateVideoCallBtn?.classList.add('hidden'); // Hide video call button
        });
        startNewChatBtn.dataset.listenersAttached = 'true';
    }

    const backToExistingChatsBtn = document.getElementById('back-to-existing-chats-btn');
    if (backToExistingChatsBtn && !backToExistingChatsBtn.dataset.listenersAttached) {
        backToExistingChatsBtn.addEventListener('click', () => {
            // Hide new message section, show active chat window (revert to general chat)
            chatNewMessageSection?.classList.add('hidden');
            activeChatWindow?.classList.remove('hidden');
            selectedChatRecipient = null;
            document.getElementById('chat-recipient-name').textContent = 'General Chat';
            document.getElementById('chat-recipient-details').innerHTML = '';
            document.getElementById('chat-messages').innerHTML = '';
            loadGeneralChatHistory('general-chat');

            // Set general chat as active
            document.querySelector('.existing-chat-item[data-chat-type="general"]')?.classList.add('active');
            startPrivateVideoCallBtn?.classList.add('hidden'); // Hide video call button
        });
        backToExistingChatsBtn.dataset.listenersAttached = 'true';
    }

    // Attach event listeners for chat user search input if not already attached
    const chatUserSearchInput = document.getElementById('chat-user-search-input');
    if (chatUserSearchInput && !chatUserSearchInput.dataset.listenersAttached) {
        chatUserSearchInput.addEventListener('input', (e) => {
            clearTimeout(chatUserSearchTimeout);
            chatUserSearchTimeout = setTimeout(() => searchUsersForSuggestions(e.target.value), 300);
        });
        chatUserSearchInput.dataset.listenersAttached = 'true';
    }
}

async function fetchAndDisplayExistingChats() {
    const existingChatsListContainer = document.getElementById('existing-chats-list');
    if (!existingChatsListContainer) return;

    // Clear previous private chats, but keep General Chat
    existingChatsListContainer.querySelectorAll('.existing-chat-item[data-chat-type="private"]').forEach(item => item.remove());

    try {
        const data = await apiRequest('/chat/recent');
        const recentChats = data.recentChats || [];

        if (recentChats.length === 0) {
            // No private chats yet, just keep General Chat
            return;
        }

        recentChats.forEach(user => {
            const chatItem = document.createElement('li');
            chatItem.classList.add('existing-chat-item');
            chatItem.dataset.chatType = 'private';
            chatItem.dataset.userId = user._id;
            chatItem.innerHTML = `
                <h4>${user.name}</h4>
                <p>${user.schoolGrade || 'N/A'}</p>
            `;
            chatItem.addEventListener('click', () => selectExistingChat(user._id, user.name, user.schoolGrade, user.subjectInterests));
            existingChatsListContainer.appendChild(chatItem);
        });
    } catch (error) {
        console.error('Failed to fetch existing chats:', error);
        showAlert('Failed to load existing chats: ' + (error.message || 'Unknown error'), 'error');
    }
}

function selectExistingChat(userId, userName, schoolGrade, subjectInterests) {
    const chatMainArea = document.getElementById('chat-main-area');
    const chatNewMessageSection = document.getElementById('chat-new-message-section');
    const activeChatWindow = document.getElementById('active-chat-window');

    chatNewMessageSection?.classList.add('hidden');
    activeChatWindow?.classList.remove('hidden');

    if (userId === 'general-chat') {
        selectedChatRecipient = null;
        document.getElementById('chat-recipient-name').textContent = 'General Chat';
        document.getElementById('chat-recipient-details').innerHTML = '';
        loadGeneralChatHistory('general-chat');
    } else {
        selectedChatRecipient = { _id: userId, name: userName, schoolGrade, subjectInterests };
        document.getElementById('chat-recipient-name').textContent = `Chat with ${userName}`;
        document.getElementById('chat-recipient-details').innerHTML = `
            <p>Grade: ${schoolGrade || 'N/A'}</p>
            <p>Interests: ${subjectInterests?.join(', ') || 'No interests'}</p>
        `;
        loadPrivateChatHistory(userId);
    }

    // Update active styling in sidebar
    document.querySelectorAll('.existing-chat-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.existing-chat-item[data-user-id="${userId}"]`)?.classList.add('active');

    // Show video call button for private chats
    const startPrivateVideoCallBtn = document.getElementById('start-private-video-call-btn');
    if (userId !== 'general-chat') {
        startPrivateVideoCallBtn?.classList.remove('hidden');
        document.getElementById('start-private-voice-call-btn')?.classList.remove('hidden');
    } else {
        startPrivateVideoCallBtn?.classList.add('hidden');
        document.getElementById('start-private-voice-call-btn')?.classList.add('hidden');
    }

    // Hide suggestions after selection
    document.getElementById('chat-user-suggestions').innerHTML = '';
    document.getElementById('chat-user-search-input').value = '';
}

function resetChatUI() {
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-recipient-name').textContent = 'Select a user to chat';
    document.getElementById('chat-recipient-details').innerHTML = '';
    selectedChatRecipient = null;
    // Clear active state from all chat items
    document.querySelectorAll('.existing-chat-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.user-suggestion-item').forEach(item => item.classList.remove('active'));
}

async function searchUsersForSuggestions(query) {
    const userSuggestionsContainer = document.getElementById('chat-user-suggestions');
    if (!userSuggestionsContainer) return;
    userSuggestionsContainer.innerHTML = '';

    if (query.trim() === '') {
        return;
    }
    try {
        const list = await ensureAllUsernamesLoaded();
        // list already sorted by backend, but ensure sort just in case
        const sorted = list
            .slice()
            .sort((a, b) => (a.username || '').localeCompare(b.username || ''));
        const results = findPrefixRange(sorted, query.toLowerCase());

        if (results.length === 0) {
            userSuggestionsContainer.innerHTML = '<li class="empty-state">No users found.</li>';
            return;
        }

        results.forEach(user => {
            const userElement = document.createElement('li');
            userElement.classList.add('user-suggestion-item');
            userElement.dataset.userId = user._id;
            userElement.innerHTML = `
                <h4>@${user.username}</h4>
                <p>${user.name}</p>
            `;
            userElement.addEventListener('click', () => selectSuggestedUser(user));
            userSuggestionsContainer.appendChild(userElement);
        });
    } catch (error) {
        console.error('Failed to suggest usernames:', error);
        showAlert('Failed to suggest usernames: ' + (error.message || 'Unknown error'), 'error');
    }
}

function selectSuggestedUser(user) {
    // This function is called when a user is selected from the search suggestions
    selectedChatRecipient = user;

    // Activate the main chat window and hide the new message section
    document.getElementById('chat-new-message-section')?.classList.add('hidden');
    document.getElementById('active-chat-window')?.classList.remove('hidden');

    document.getElementById('chat-recipient-name').textContent = `Chat with ${user.name || '@'+user.username}`;
    document.getElementById('chat-recipient-details').innerHTML = `
        <p>Username: @${user.username || ''}</p>
    `;
    document.getElementById('chat-messages').innerHTML = '';
    loadPrivateChatHistory(user._id); // Load private chat history with this user

    // Update active styling in existing chats sidebar (if this user is in existing chats)
    document.querySelectorAll('.existing-chat-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.existing-chat-item[data-user-id="${user._id}"]`)?.classList.add('active');

    // Show call buttons
    document.getElementById('start-private-video-call-btn')?.classList.remove('hidden');
    document.getElementById('start-private-voice-call-btn')?.classList.remove('hidden');

    // Clear search input and suggestions
    document.getElementById('chat-user-search-input').value = '';
    document.getElementById('chat-user-suggestions').innerHTML = '';
}

async function loadGeneralChatHistory(sessionId) {
    const chatMessagesContainer = document.getElementById('chat-messages');
    if (!chatMessagesContainer) return;
    chatMessagesContainer.innerHTML = '';

    try {
        const data = await apiRequest(`/chat/session/${sessionId}`);
        const messages = data.messages || [];
        messages.forEach(message => displayChatMessage(message, false)); // Pass false for isPrivate

        // Set general chat as active in sidebar
        document.querySelectorAll('.existing-chat-item').forEach(item => item.classList.remove('active'));
        document.querySelector('.existing-chat-item[data-chat-type="general"]')?.classList.add('active');

    } catch (error) {
        console.error('Error loading general chat history:', error);
        showAlert('Failed to load general chat history: ' + (error.message || 'Unknown error'), 'error');
    }
    // Hide call buttons for general chat
    document.getElementById('start-private-video-call-btn')?.classList.add('hidden');
    document.getElementById('start-private-voice-call-btn')?.classList.add('hidden');
}

// Load private chat history
async function loadPrivateChatHistory(recipientId) {
    const chatMessagesContainer = document.getElementById('chat-messages');
    if (!chatMessagesContainer) return;
    chatMessagesContainer.innerHTML = '';

    try {
        const data = await apiRequest(`/chat/private/${recipientId}`);
        const messages = data.messages || [];
        messages.forEach(message => displayChatMessage(message, true)); // Pass true for isPrivate
    } catch (error) {
        console.error('Error loading private chat history:', error);
        showAlert('Failed to load private chat history: ' + (error.message || 'Unknown error'), 'error');
    }
}

function displayChatMessage(message, isPrivateHint = undefined) {
    const chatMessagesContainer = document.getElementById('chat-messages');
    if (!chatMessagesContainer) return;

    // Normalize fields to support both realtime payloads and DB-fetch payloads
    const senderId = message.senderId || message.sender?.toString?.() || message.sender;
    const recipientId = message.recipientId || message.recipient?.toString?.() || message.recipient;
    const sessionId = message.sessionId || null;

    // Determine if this is a private message
    const isPrivateMsg = typeof isPrivateHint === 'boolean' ? isPrivateHint : Boolean(recipientId);

    // Determine current chat context
    const isGeneralChatActive = !selectedChatRecipient;
    const isPrivateChatActive = Boolean(selectedChatRecipient && selectedChatRecipient._id);

    let shouldDisplay = false;
    if (isPrivateMsg) {
        // Show only if this private message is between me and the selected recipient
        if (isPrivateChatActive) {
            const otherId = selectedChatRecipient._id?.toString();
            const me = currentUser?.id?.toString();
            const betweenUs = (
                (senderId?.toString() === me && recipientId?.toString() === otherId) ||
                (senderId?.toString() === otherId && recipientId?.toString() === me)
            );
            shouldDisplay = betweenUs;
        }
    } else {
        // General chat: show only in general chat context
        shouldDisplay = isGeneralChatActive && (sessionId === 'general-chat' || sessionId === null || typeof sessionId === 'undefined');
    }

    if (!shouldDisplay) return;

    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    if (senderId && senderId.toString() === currentUser?.id?.toString()) {
        messageElement.classList.add('chat-message--own');
    }
    messageElement.innerHTML = `<strong>${message.senderName}:</strong> ${message.text}`;
    chatMessagesContainer.appendChild(messageElement);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; // Auto-scroll to bottom
}

function sendChatMessage(messageText) {
    if (messageText.trim() === '') return;
    if (!currentUser) {
        showAlert('Please log in to send messages.', 'error');
        return;
    }

    const message = {
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderUsername: currentUser.username,
        text: messageText,
        timestamp: new Date().toISOString(),
    };

    if (selectedChatRecipient) {
        message.recipientId = selectedChatRecipient._id;
        message.recipientUsername = selectedChatRecipient.username;
        // Use global socket reference
        window.appSocket?.emit('chat-message', message);
        // Optimistically display in the current private chat view
        displayChatMessage({ ...message }, true);
    } else {
        // Send to general chat
        const outgoing = { ...message, sessionId: 'general-chat' };
        window.appSocket?.emit('chat-message', outgoing);
        // Optimistically display in general chat view
        displayChatMessage(outgoing, false);
    }
}

function updateNotesUI() {
    console.log('Updating notes UI...');
    fetchAndDisplayAllNotes(); // Changed to fetch all notes

    // Event listeners for notes
    document.getElementById('create-note-btn')?.addEventListener('click', () => {
        showNoteEditor();
    });
    document.getElementById('cancel-note-btn')?.addEventListener('click', () => {
        hideNoteEditor();
    });
    document.getElementById('save-note-btn')?.addEventListener('click', handleSaveNote);
    document.getElementById('export-notes-pdf-btn')?.addEventListener('click', exportNotesToPdf);

    document.getElementById('import-pdf-btn')?.addEventListener('click', () => {
        document.getElementById('import-pdf-input').click();
    });
    document.getElementById('import-pdf-input')?.addEventListener('change', handlePdfImport);
}

async function fetchAndDisplayNotes() {
    const notesListContainer = document.getElementById('notes-list');
    if (!notesListContainer) return;
    notesListContainer.innerHTML = ''; // Clear previous notes

    try {
        const data = await apiRequest('/notes'); // This endpoint now fetches all notes (private and public)
        const notes = data.notes || [];

        if (notes.length === 0) {
            notesListContainer.innerHTML = '<p class="empty-state">No notes found. Create one!</p>';
            return;
        }

        notes.forEach(note => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('note-card');
            if (note.isPublic) {
                noteElement.classList.add('note-card--public');
            }
            noteElement.innerHTML = `
                <h3>${note.title} ${note.isPublic ? '<span class="note-public-badge">Public</span>' : ''}</h3>
                <p>${note.content}</p>
                <div class="note-actions">
                    ${note.owner === currentUser?.id ? `<button class="btn btn--sm btn--secondary" onclick="editNote('${note._id}')">Edit</button>` : ''}
                    ${note.owner === currentUser?.id ? `<button class="btn btn--sm btn--danger" onclick="deleteNote('${note._id}')">Delete</button>` : ''}
                    <button class="btn btn--sm btn--primary" onclick="downloadNote('${note._id}', '${note.title}')">Download</button>
                </div>
            `;
            notesListContainer.appendChild(noteElement);
        });
    } catch (error) {
        console.error('Failed to fetch notes:', error);
        showAlert('Failed to load notes: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Renamed from fetchAndDisplayNotes to fetchAndDisplayAllNotes
async function fetchAndDisplayAllNotes() {
    const notesListContainer = document.getElementById('notes-list');
    if (!notesListContainer) return;
    notesListContainer.innerHTML = ''; // Clear previous notes

    try {
        const privateNotesData = await apiRequest('/notes'); // Assuming this fetches private notes
        const publicNotesData = await apiRequest('/notes/public'); // Assuming this fetches public notes

        const allNotes = [...(privateNotesData.notes || []), ...(publicNotesData.notes || [])];

        if (allNotes.length === 0) {
            notesListContainer.innerHTML = '<p class="empty-state">No notes found. Create one!</p>';
            return;
        }

        allNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        allNotes.forEach(note => {
            const noteElement = document.createElement('div');
            noteElement.classList.add('note-card');
            if (note.isPublic) {
                noteElement.classList.add('note-card--public');
            }
            noteElement.innerHTML = `
                <h3>${note.title} ${note.isPublic ? '<span class="note-public-badge">Public</span>' : ''}</h3>
                <p>${note.content}</p>
                <div class="note-actions">
                    ${note.owner === currentUser?.id ? `<button class="btn btn--sm btn--secondary" onclick="editNote('${note._id}')">Edit</button>` : ''}
                    ${note.owner === currentUser?.id ? `<button class="btn btn--sm btn--danger" onclick="deleteNote('${note._id}')">Delete</button>` : ''}
                    <button class="btn btn--sm btn--primary" onclick="downloadNote('${note._id}', '${note.title}')">Download</button>
                </div>
            `;
            notesListContainer.appendChild(noteElement);
        });
    } catch (error) {
        console.error('Failed to fetch all notes:', error);
        showAlert('Failed to load notes: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Old updateGlobalNotesUI function (will be removed)
// async function updateGlobalNotesUI() {
//     const globalNotesListContainer = document.getElementById('global-notes-list');
//     if (!globalNotesListContainer) return;
//     globalNotesListContainer.innerHTML = ''; // Clear previous notes

//     try {
//         const data = await apiRequest('/notes/public');
//         const notes = data.notes || [];

//         if (notes.length === 0) {
//             globalNotesListContainer.innerHTML = '<p class="empty-state">No public notes found.</p>';
//             return;
//         }

//         notes.forEach(note => {
//             const noteElement = document.createElement('div');
//             noteElement.classList.add('note-card');
//             noteElement.innerHTML = `
//                 <h3>${note.title}</h3>
//                 <p>${note.content.substring(0, 100)}...</p>
//                 <div class="note-actions">
//                     <button class="btn btn--sm btn--primary" onclick="downloadNote('${note._id}', '${note.title}')">Download</button>
//                 </div>
//             `;
//             globalNotesListContainer.appendChild(noteElement);
//         });
//     } catch (error) {
//         console.error('Failed to fetch public notes:', error);
//         showAlert('Failed to load public notes: ' + (error.message || 'Unknown error'), 'error');
//     }
// }

let currentEditingNoteId = null;

function showNoteEditor(note = null) {
    document.getElementById('notes-list')?.classList.add('hidden');
    document.getElementById('note-editor')?.classList.remove('hidden');
    document.getElementById('create-note-btn')?.classList.add('hidden');
    document.getElementById('export-notes-pdf-btn')?.classList.add('hidden');
    document.getElementById('import-pdf-btn')?.classList.add('hidden');

    const noteTitleInput = document.getElementById('note-title-input');
    const noteContentInput = document.getElementById('note-content-input');

    if (note) {
        currentEditingNoteId = note._id;
        noteTitleInput.value = note.title;
        noteContentInput.value = note.content;
    } else {
        currentEditingNoteId = null;
        noteTitleInput.value = '';
        noteContentInput.value = '';
    }
}

function hideNoteEditor() {
    document.getElementById('notes-list')?.classList.remove('hidden');
    document.getElementById('note-editor')?.classList.add('hidden');
    document.getElementById('create-note-btn')?.classList.remove('hidden');
    document.getElementById('export-notes-pdf-btn')?.classList.remove('hidden');
    document.getElementById('import-pdf-btn')?.classList.remove('hidden');
    currentEditingNoteId = null;
}

async function handleSaveNote() {
    const title = document.getElementById('note-title-input').value;
    const content = document.getElementById('note-content-input').value;

    if (!title.trim() || !content.trim()) {
        showAlert('Note title and content cannot be empty.', 'error');
        return;
    }

    try {
        showAlert('Saving note...', 'info');
        if (currentEditingNoteId) {
            // Update existing note
            await apiRequest(`/notes/${currentEditingNoteId}`, {
                method: 'PUT',
                body: JSON.stringify({ title, content })
            });
            showAlert('Note updated successfully!', 'success');
        } else {
            // Create new note (default to not public)
            await apiRequest('/notes', {
                method: 'POST',
                body: JSON.stringify({ title, content, isPublic: false })
            });
            showAlert('Note created successfully!', 'success');
        }
        hideNoteEditor();
        fetchAndDisplayAllNotes(); // Changed to fetchAndDisplayAllNotes
    } catch (error) {
        console.error('Failed to save note:', error);
        showAlert('Failed to save note: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function editNote(noteId) {
    try {
        const data = await apiRequest(`/notes/${noteId}`);
        showNoteEditor(data.note);
    } catch (error) {
        console.error('Failed to fetch note for editing:', error);
        showAlert('Failed to load note for editing: ' + (error.message || 'Unknown error'), 'error');
    }
}

async function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) {
        return;
    }
    try {
        showAlert('Deleting note...', 'info');
        await apiRequest(`/notes/${noteId}`, { method: 'DELETE' });
        showAlert('Note deleted successfully!', 'success');
        fetchAndDisplayAllNotes(); // Changed to fetchAndDisplayAllNotes
    } catch (error) {
        console.error('Failed to delete note:', error);
        showAlert('Failed to delete note: ' + (error.message || 'Unknown error'), 'error');
    }
}

function exportNotesToPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const notesListContainer = document.getElementById('notes-list');
    if (!notesListContainer) {
        showAlert('No notes to export.', 'error');
        return;
    }

    const notes = Array.from(notesListContainer.querySelectorAll('.note-card'));
    if (notes.length === 0) {
        showAlert('No notes found to export.', 'info');
        return;
    }

    let yPos = 10;
    doc.setFontSize(18);
    doc.text("My Notes", 10, yPos);
    yPos += 10;

    doc.setFontSize(12);
    notes.forEach((note, index) => {
        const title = note.querySelector('h3')?.textContent || `Note ${index + 1}`;
        const content = note.querySelector('p')?.textContent || '';

        yPos += 10; // Spacing before each note
        if (yPos > 280) { // Check if new page is needed
            doc.addPage();
            yPos = 10;
        }

        doc.setFontSize(14);
        doc.text(title, 10, yPos);
        yPos += 7;

        doc.setFontSize(10);
        const splitContent = doc.splitTextToSize(content, 180); // Wrap text
        doc.text(splitContent, 10, yPos);
        yPos += (splitContent.length * 7) + 5; // Adjust yPos based on content height
    });

    doc.save('my-feynman-notes.pdf');
    showAlert('Notes exported to PDF successfully!', 'success');
}

async function handlePdfImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        // Initialize PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            console.log('PDF loaded successfully, number of pages:', pdf.numPages);
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
            }
            console.log('Extracted full text:', fullText.substring(0, 500)); // Log first 500 chars

            // Automatically create a new note with the PDF content and make it public
            const pdfFileName = file.name.replace('.pdf', '');
            const noteTitle = `Imported from ${pdfFileName}`;
            const noteContent = fullText.substring(0, 5000); // Limit to 5000 characters for example

            await apiRequest('/notes', {
                method: 'POST',
                body: JSON.stringify({ title: noteTitle, content: noteContent, isPublic: true })
            });
            showAlert('PDF imported and saved as a new public note!', 'success');
            fetchAndDisplayAllNotes(); // Changed to fetchAndDisplayAllNotes
        } catch (error) {
            console.error('Error processing PDF:', error);
            showAlert('Failed to import PDF: ' + (error.message || 'Unknown error'), 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

async function downloadNote(noteId, noteTitle) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/download/${noteId}`, { credentials: 'include' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to download note');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${noteTitle}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showAlert('Note downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error downloading note:', error);
        showAlert('Failed to download note: ' + (error.message || 'Unknown error'), 'error');
    }
}