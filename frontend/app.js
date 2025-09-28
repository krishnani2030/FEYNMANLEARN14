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
        if (data.user) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Join user room for notifications
            if (window.appSocket) {
                if (window.appSocket.connected) {
                    console.log('Joining user room after login:', currentUser.id);
                    window.appSocket.emit('join-user', currentUser.id);
                    
                    // Verify connection after a delay
                    setTimeout(() => {
                        checkConnectedUsers();
                    }, 1000);
                } else {
                    console.log('Socket not connected yet, will join room on connect');
                    // Will join when socket connects (handled in connect event)
                }
            }
            
            showDashboard();
            showAlert('Login successful!', 'success');
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
    
    // Add event delegation as backup for login form
    document.addEventListener('submit', function(event) {
        if (event.target.id === 'login-form') {
            console.log('Login form submitted via event delegation');
            handleLogin(event);
        }
    });

    // Initialize Socket.IO (same-origin)
    const socket = io(window.location.origin, {
        withCredentials: true
    });
    window.appSocket = socket;

    socket.on('connect', () => {
        console.log('Connected to Socket.IO');
        console.log('Socket ID:', socket.id);
        if (currentUser) {
            console.log('Joining user room:', currentUser.id);
            socket.emit('join-user', currentUser.id);
            
            // Verify we joined the room after a short delay
            setTimeout(() => {
                checkConnectedUsers();
            }, 1000);
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO');
    });

    // Test response handler
    socket.on('test-response', (data) => {
        console.log('Received test response:', data);
    });

    // Connected users response handler
    socket.on('connected-users-response', (users) => {
        console.log('Connected users:', users);
    });

    socket.on('chat-message', (message) => {
        console.log('Received chat message:', message);
        
        // Validate message
        if (!message || !message.text || !message.senderName) {
            console.error('Invalid message received:', message);
            return;
        }
        
        // Handle bot messages specially
        if (message.isBot || message.senderId === 'bot' || message.senderName === 'Feynman Bot') {
            console.log('Received bot message:', message);
            
            // Add Feynman Bot to chat list if not already there
            addFeynmanBotToChat();
            
            // If currently viewing bot chat, display the message
            if (currentChatRecipient && currentChatRecipient._id === 'feynman-bot') {
                displayChatMessage(message);
            }
            
            // Update bot chat preview
            updateBotChatPreview(message.text);
            
            // Show notification for bot messages
            showAlert('New message from Feynman Bot', 'info');
        } else {
            console.log('Processing regular message for display');
            displayChatMessage(message);
            
            // Update chat list if this is for current chat
            if (currentChatRecipient && (message.senderId === currentChatRecipient._id || message.recipientId === currentChatRecipient._id)) {
                const chatListItem = document.querySelector(`[data-user-id="${currentChatRecipient._id}"]`);
                if (chatListItem) {
                    const preview = chatListItem.querySelector('.chat-list-item-preview');
                    if (preview) {
                        const previewText = message.text.length > 40 ? message.text.substring(0, 40) + '...' : message.text;
                        preview.textContent = previewText;
                    }
                }
            }
        }
    });

    // WebRTC signaling listeners
    socket.on('joined-call', (roomId) => {
        console.log('Joined call room', roomId);
    });
    socket.on('offer', async (offer) => {
        console.log('Received offer');
        await ensurePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        window.appSocket.emit('answer', answer, currentRoomId);
    });
    socket.on('answer', async (answer) => {
        console.log('Received answer');
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });
    socket.on('ice-candidate', async (candidate) => {
        try {
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (e) {
            console.error('Error adding remote ICE candidate', e);
        }
    });

    // Incoming private call notification
    socket.on('incoming-call', (payload) => {
        console.log('Incoming call received:', payload);
        showIncomingCallPrompt(payload);
    });

    // Caller gets notified if callee accepted/declined
    socket.on('call-accepted', ({ roomId }) => {
        console.log('Call accepted for room', roomId);
        // Nothing extra needed; caller already navigated to call view
    });
    socket.on('call-declined', ({ reason }) => {
        console.log('Call declined', reason);
        showAlert('Call declined by recipient.', 'error');
    });

    // Session reminders/notifications
    socket.on('session-notification', (payload) => {
        try {
            console.log('Received session notification:', payload);
            if (payload?.type === 'session-reminder') {
                showAlert(`Reminder: "${payload.topic}" starts in ${payload.minutes} minutes.`, 'info');
                showSessionReminderPopup(payload);
            } else if (payload?.type === 'session-start') {
                showAlert(`Session starting now: "${payload.topic}"`, 'success');
            }
        } catch (e) { console.error('Error handling session-notification', e); }
    });

    // Meeting link notifications (5 minutes before)
    socket.on('session-meeting-link', (payload) => {
        try {
            console.log('Received meeting link notification:', payload);
            showAlert(`Meeting ready: "${payload.topic}" starts in ${payload.minutes} minutes. Click to join!`, 'success');
            showMeetingLinkPopup(payload);
        } catch (e) { console.error('Error handling session-meeting-link', e); }
    });

    // Handle sending chat messages
    const chatMessageInput = document.getElementById('chat-message-input');
    const sendChatButton = document.getElementById('send-chat-button');

    if (sendChatButton) {
        sendChatButton.addEventListener('click', () => {
            sendChatMessage(chatMessageInput.value);
        });
    }

    if (chatMessageInput) {
        chatMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage(chatMessageInput.value);
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
    console.log('Setting up form event listeners...');
    
    // Use a slight delay to ensure DOM is ready
    setTimeout(() => {
        // Login form
        const loginForm = document.getElementById('login-form');
        console.log('Login form found:', !!loginForm);
        if (loginForm) {
            // Remove any existing listeners first
            loginForm.removeEventListener('submit', handleLogin);
            loginForm.addEventListener('submit', handleLogin);
            console.log('Login form event listener attached');
        } else {
            console.error('Login form not found!');
        }
        
        // Also set up other forms
        setupOtherFormListeners();
    }, 100);
}

function setupOtherFormListeners() {

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
// WebRTC state
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentRoomId = null;
let usingScreenShare = false;
let originalVideoTrack = null;

// Navigation functions
function showLandingPage() {
    hideAllPages();
    document.getElementById('landing-page').classList.remove('hidden');
    currentView = 'landing';
}

function showChat() {
    hideAllPages();
    document.getElementById('chat-page').classList.remove('hidden');
    currentView = 'chat';
    
    // Reset chat state
    currentChatRecipient = null;
    document.getElementById('new-chat-selection').classList.remove('hidden');
    document.getElementById('chat-empty-state').classList.remove('hidden');
    document.getElementById('active-chat-window').classList.add('hidden');
    
    // Load chat list and setup event listeners
    loadChatList();
    setupChatEventListeners();
}

function showLogin() {
    hideAllPages();
    document.getElementById('login-page').classList.remove('hidden');
    currentView = 'login';
    
    // Ensure form listeners are set up when login page is shown
    setTimeout(() => {
        setupLoginForm();
    }, 100);
}

function setupLoginForm() {
    console.log('Setting up login form specifically...');
    
    const loginForm = document.getElementById('login-form');
    const submitButton = document.querySelector('#login-form button[type="submit"]');
    
    console.log('Login form found:', !!loginForm);
    console.log('Submit button found:', !!submitButton);
    
    if (loginForm) {
        // Remove existing listeners
        loginForm.removeEventListener('submit', handleLogin);
        // Add new listener
        loginForm.addEventListener('submit', handleLogin);
        console.log('Form submit listener added');
    }
    
    if (submitButton) {
        // Ensure button is clickable
        submitButton.style.pointerEvents = 'auto';
        submitButton.style.cursor = 'pointer';
        
        // Add click listener as backup
        submitButton.removeEventListener('click', handleLoginButtonClick);
        submitButton.addEventListener('click', handleLoginButtonClick);
        console.log('Button click listener added');
        
        // Also add mousedown listener as another backup
        submitButton.addEventListener('mousedown', function(e) {
            console.log('Login button mousedown detected');
        });
    }
}

function handleLoginButtonClick(event) {
    console.log('Login button clicked directly');
    event.preventDefault();
    
    const form = document.getElementById('login-form');
    if (form) {
        // Trigger form submission
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
    } else {
        // Handle login directly
        handleLoginDirect();
    }
}

function handleLoginDirect() {
    console.log('Handling login directly');
    
    const identifier = document.getElementById('login-identifier').value;
    const password = document.getElementById('login-password').value;

    console.log('Login attempt with identifier:', identifier);

    if (!identifier || !password) {
        showAlert('Please enter both email/username and password', 'error');
        return;
    }

    login(identifier, password).catch(error => {
        console.error('Login error:', error);
        showAlert('Login failed: ' + (error.message || 'Unknown error'), 'error');
    });
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
    document.getElementById('conference-topic').textContent = topic || 'Session Meeting';
    currentView = 'video-conference';
    const roomId = `feynman-learn-session-${sessionId}`;
    startWebRTCCall(roomId, { audio: true, video: true });
}

function startPrivateVideoCall(recipientId, recipientName) {
    if (!currentUser || !recipientId) {
        showAlert('Unable to start call', 'error');
        return;
    }
    
    const sortedIds = [currentUser.id, recipientId].sort();
    const roomId = `feynman-learn-private-${sortedIds.join('-')}`;
    
    console.log('Starting video call to:', recipientName, 'Room:', roomId);
    console.log('Current user:', currentUser);
    console.log('Socket connected:', window.appSocket?.connected);
    
    // Notify callee first
    const callPayload = {
        toUserId: recipientId,
        fromUserId: currentUser.id,
        fromName: currentUser.name,
        mediaType: 'video',
        roomId: roomId,
    };
    
    console.log('Sending call payload:', callPayload);
    window.appSocket?.emit('initiate-private-call', callPayload);
    
    // Show calling state
    showAlert(`Calling ${recipientName}...`, 'info');
    
    // Start the call interface
    hideAllPages();
    document.getElementById('video-conference-page').classList.remove('hidden');
    document.getElementById('conference-topic').textContent = `Video Call with ${recipientName}`;
    currentView = 'video-conference';
    
    startWebRTCCall(roomId, { audio: true, video: true });
}

function startPrivateVoiceCall(recipientId, recipientName) {
    if (!currentUser || !recipientId) {
        showAlert('Unable to start call', 'error');
        return;
    }
    
    const sortedIds = [currentUser.id, recipientId].sort();
    const roomId = `feynman-learn-private-${sortedIds.join('-')}`;
    
    console.log('Starting voice call to:', recipientName, 'Room:', roomId);
    
    // Notify callee first
    window.appSocket?.emit('initiate-private-call', {
        toUserId: recipientId,
        fromUserId: currentUser.id,
        fromName: currentUser.name,
        mediaType: 'audio',
        roomId: roomId,
    });
    
    // Show calling state
    showAlert(`Calling ${recipientName}...`, 'info');
    
    // Start the call interface
    hideAllPages();
    document.getElementById('video-conference-page').classList.remove('hidden');
    document.getElementById('conference-topic').textContent = `Voice Call with ${recipientName}`;
    currentView = 'video-conference';
    
    startWebRTCCall(roomId, { audio: true, video: false });
}

// UI prompt for incoming private calls
function showIncomingCallPrompt(payload) {
    try {
        console.log('Showing incoming call prompt:', payload);
        
        // Remove existing prompt if any
        const old = document.getElementById('incoming-call-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'incoming-call-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const box = document.createElement('div');
        box.style.background = '#fff';
        box.style.padding = '20px';
        box.style.borderRadius = '8px';
        box.style.maxWidth = '400px';
        box.style.textAlign = 'center';
        box.innerHTML = `
            <h3>Incoming ${payload.mediaType === 'audio' ? 'Voice' : 'Video'} Call</h3>
            <p>${payload.fromName || 'Someone'} is calling you.</p>
            <div style="display:flex; gap:12px; justify-content:center; margin-top:16px;">
                <button id="btn-accept-call" class="btn btn--primary">Accept</button>
                <button id="btn-decline-call" class="btn btn--secondary">Decline</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('btn-accept-call').onclick = async () => {
            try {
                window.appSocket?.emit('call-accepted', { toUserId: payload.fromUserId, roomId: payload.roomId });
                // Navigate to call UI and start call
                hideAllPages();
                document.getElementById('video-conference-page').classList.remove('hidden');
                document.getElementById('conference-topic').textContent = `Call with ${payload.fromName || 'User'}`;
                currentView = 'video-conference';
                await startWebRTCCall(payload.roomId, { audio: true, video: payload.mediaType !== 'audio' });
            } finally {
                overlay.remove();
            }
        };
        document.getElementById('btn-decline-call').onclick = () => {
            window.appSocket?.emit('call-declined', { toUserId: payload.fromUserId, reason: 'busy' });
            overlay.remove();
        };
    } catch (e) {
        console.error('Error showing incoming call prompt', e);
        const accept = confirm(`${payload.fromName || 'Someone'} is calling you. Accept?`);
        if (accept) {
            window.appSocket?.emit('call-accepted', { toUserId: payload.fromUserId, roomId: payload.roomId });
            hideAllPages();
            document.getElementById('video-conference-page').classList.remove('hidden');
            document.getElementById('conference-topic').textContent = `Call with ${payload.fromName || 'User'}`;
            currentView = 'video-conference';
            startWebRTCCall(payload.roomId, { audio: true, video: payload.mediaType !== 'audio' });
        } else {
            window.appSocket?.emit('call-declined', { toUserId: payload.fromUserId, reason: 'declined' });
        }
    }
}

async function startWebRTCCall(roomId, mediaConstraints) {
    currentRoomId = roomId;
    // Bind control handlers
    bindCallControls();
    await ensureLocalMedia(mediaConstraints);
    await ensurePeerConnection();
    window.appSocket.emit('join-call', roomId);
    // If someone is already in the room, creating an offer will start negotiation on our side
    await createAndSendOffer();
}

async function ensureLocalMedia(constraints) {
    if (localStream) {
        // Update tracks according to constraints
        const wantVideo = !!constraints.video;
        const hasVideo = localStream.getVideoTracks().length > 0;
        if (wantVideo && !hasVideo) {
            const cam = await navigator.mediaDevices.getUserMedia({ video: true });
            cam.getVideoTracks().forEach(t => localStream.addTrack(t));
        }
        return localStream;
    }
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;
    return localStream;
}

async function ensurePeerConnection() {
    if (peerConnection) return peerConnection;
    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
        ]
    });
    // Local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }
    // Remote stream
    remoteStream = new MediaStream();
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = remoteStream;
    peerConnection.addEventListener('track', (event) => {
        event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    });
    // ICE
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentRoomId) {
            window.appSocket.emit('ice-candidate', event.candidate, currentRoomId);
        }
    };
    // Negotiationneeded
    peerConnection.onnegotiationneeded = async () => {
        await createAndSendOffer();
    };
    return peerConnection;
}

async function createAndSendOffer() {
    if (!peerConnection || !currentRoomId) return;
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        window.appSocket.emit('offer', offer, currentRoomId);
    } catch (e) {
        console.error('Error creating offer', e);
    }
}

function bindCallControls() {
    const audioBtn = document.getElementById('btn-toggle-audio');
    const videoBtn = document.getElementById('btn-toggle-video');
    const screenBtn = document.getElementById('btn-screenshare');
    const endBtn = document.getElementById('btn-end-call');
    const exitBtn = document.getElementById('btn-exit-call');
    
    if (audioBtn && !audioBtn.dataset.bound) {
        audioBtn.addEventListener('click', toggleAudio);
        audioBtn.dataset.bound = 'true';
    }
    if (videoBtn && !videoBtn.dataset.bound) {
        videoBtn.addEventListener('click', toggleVideo);
        videoBtn.dataset.bound = 'true';
    }
    if (screenBtn && !screenBtn.dataset.bound) {
        screenBtn.addEventListener('click', toggleScreenShare);
        screenBtn.dataset.bound = 'true';
    }
    if (endBtn && !endBtn.dataset.bound) {
        endBtn.addEventListener('click', endCallAndBack);
        endBtn.dataset.bound = 'true';
    }
    if (exitBtn && !exitBtn.dataset.bound) {
        exitBtn.addEventListener('click', endCallAndBack);
        exitBtn.dataset.bound = 'true';
    }
}

function toggleAudio() {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(t => t.enabled = !t.enabled);
    const anyEnabled = audioTracks.some(t => t.enabled);
    const btn = document.getElementById('btn-toggle-audio');
    btn.textContent = anyEnabled ? '🎤' : '🔇';
    btn.classList.toggle('muted', !anyEnabled);
}

function toggleVideo() {
    if (!localStream) return;
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(t => t.enabled = !t.enabled);
    const anyEnabled = videoTracks.some(t => t.enabled);
    const btn = document.getElementById('btn-toggle-video');
    btn.textContent = anyEnabled ? '📹' : '📷';
    btn.classList.toggle('disabled', !anyEnabled);
}

async function toggleScreenShare() {
    if (!peerConnection) return;
    if (!usingScreenShare) {
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = displayStream.getVideoTracks()[0];
            // Replace sender track
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                originalVideoTrack = sender.track;
                await sender.replaceTrack(screenTrack);
                usingScreenShare = true;
                screenTrack.onended = () => {
                    // Revert when screenshare ends
                    stopScreenShare();
                };
                document.getElementById('btn-screenshare').textContent = 'Stop Sharing';
            }
        } catch (e) {
            console.error('Error starting screen share', e);
        }
    } else {
        stopScreenShare();
    }
}

async function stopScreenShare() {
    if (!peerConnection || !usingScreenShare) return;
    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && originalVideoTrack) {
        await sender.replaceTrack(originalVideoTrack);
    }
    usingScreenShare = false;
    originalVideoTrack = null;
    document.getElementById('btn-screenshare').textContent = 'Share Screen';
}

function copyInviteLink() {
    if (!currentRoomId) return;
    const url = new URL(window.location.href);
    url.hash = `#call=${encodeURIComponent(currentRoomId)}`;
    navigator.clipboard.writeText(url.toString());
    showAlert('Invite link copied to clipboard', 'success');
}

function endCallAndBack() {
    console.log('Ending call and going back to dashboard');
    
    try {
        // Leave room
        if (currentRoomId) {
            window.appSocket?.emit('leave-call', currentRoomId);
            console.log('Left room:', currentRoomId);
        }

        // Stop local stream
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped track:', track.kind);
            });
            localStream = null;
        }

        // Close peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log('Closed peer connection');
        }

        // Clear video elements
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        if (localVideo) {
            localVideo.srcObject = null;
            localVideo.pause();
        }
        if (remoteVideo) {
            remoteVideo.srcObject = null;
            remoteVideo.pause();
        }

        // Reset state
        currentRoomId = null;
        usingScreenShare = false;

        // Go back to dashboard
        showDashboard();
        showAlert('Call ended', 'info');
        
    } catch (error) {
        console.error('Error ending call:', error);
        showDashboard(); // Still try to go back
    }
}

function hideAllPages() {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.add('hidden'));
}

// Authentication handlers
async function handleLogin(event) {
    console.log('Login form submitted');
    event.preventDefault();
    
    const form = event.target;
    const identifier = document.getElementById('login-identifier').value;
    const password = document.getElementById('login-password').value;

    console.log('Login attempt with identifier:', identifier);

    if (!identifier || !password) {
        showAlert('Please enter both email/username and password', 'error');
        return;
    }

    try {
        showAlert('Logging in...', 'info');
        await login(identifier, password);
        // Note: login function already shows success message and navigates
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
        const result = await enrollInSession(sessionId);
        
        // Get session details for the bot message
        const sessionData = await apiRequest(`/sessions/${sessionId}`);
        const session = sessionData.session;
        
        // Send Feynman bot message about enrollment
        const botMessage = `🎓 Great! You've enrolled in "${session.topic}" scheduled for ${formatDate(session.date)} at ${formatTime(session.date)}. I'll notify you when it's time to join!`;
        
        // Create bot message in database
        const message = {
            senderId: 'bot',
            senderName: 'Feynman Bot',
            senderUsername: 'feynman_bot',
            text: botMessage,
            recipientId: currentUser.id,
            recipientUsername: currentUser.username,
            timestamp: new Date().toISOString(),
            isBot: true
        };
        
        // Send via socket to save in database and display
        window.appSocket?.emit('chat-message', message);
        
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
            actionButton = '<span class="enrollment-status">Already Enrolled</span>';
        } else if (isFull) {
            actionButton = '<span class="enrollment-status">Full</span>';
        } else if (session.status === 'ongoing') {
            actionButton = `<button class="btn btn--primary btn--sm" onclick="showVideoConference('${session.id || session._id}', '${session.topic.replace(/'/g, "\\'")}')">Join Now</button>`;
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
    }
    return results;
}

// Global variables for new chat system
let currentChatRecipient = null;
let chatList = [];

function updateChatUI() {
    console.log('Updating new WhatsApp-style chat UI...');
    
    // Load and display chat list
    loadChatList();
    
    // Show empty state initially
    showChatEmptyState();
    
    // Attach event listeners
    setupChatEventListeners();
}

function setupChatEventListeners() {
    // New chat button
    const startNewChatBtn = document.getElementById('start-new-chat-btn');
    if (startNewChatBtn && !startNewChatBtn.dataset.listenersAttached) {
        startNewChatBtn.addEventListener('click', showNewChatSelection);
        startNewChatBtn.dataset.listenersAttached = 'true';
    }
    
    // Back to chat list button
    const backToChatListBtn = document.getElementById('back-to-chat-list');
    if (backToChatListBtn && !backToChatListBtn.dataset.listenersAttached) {
        backToChatListBtn.addEventListener('click', showChatEmptyState);
        backToChatListBtn.dataset.listenersAttached = 'true';
    }
    
    // User search input
    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput && !userSearchInput.dataset.listenersAttached) {
        userSearchInput.addEventListener('input', (e) => {
            clearTimeout(chatUserSearchTimeout);
            chatUserSearchTimeout = setTimeout(() => searchUsersForNewChat(e.target.value), 300);
        });
        userSearchInput.dataset.listenersAttached = 'true';
    }
    
    // Chat search input
    const chatSearchInput = document.getElementById('chat-search-input');
    if (chatSearchInput && !chatSearchInput.dataset.listenersAttached) {
        chatSearchInput.addEventListener('input', (e) => {
            filterChatList(e.target.value);
        });
        chatSearchInput.dataset.listenersAttached = 'true';
    }
    
    // Send message button and input
    const sendChatButton = document.getElementById('send-chat-button');
    const chatMessageInput = document.getElementById('chat-message-input');
    
    if (sendChatButton && !sendChatButton.dataset.listenersAttached) {
        sendChatButton.addEventListener('click', sendMessage);
        sendChatButton.dataset.listenersAttached = 'true';
    }
    
    if (chatMessageInput && !chatMessageInput.dataset.listenersAttached) {
        chatMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        chatMessageInput.dataset.listenersAttached = 'true';
    }
    
    // Call buttons
    const startVideoCallBtn = document.getElementById('start-video-call-btn');
    const startVoiceCallBtn = document.getElementById('start-voice-call-btn');
    
    if (startVideoCallBtn && !startVideoCallBtn.dataset.listenersAttached) {
        startVideoCallBtn.addEventListener('click', () => {
            console.log('Video call button clicked');
            if (currentChatRecipient) {
                console.log('Starting video call with:', currentChatRecipient.name);
                startPrivateVideoCall(currentChatRecipient._id, currentChatRecipient.name);
            } else {
                console.log('No current chat recipient');
                showAlert('Please select a chat first', 'error');
            }
        });
        startVideoCallBtn.dataset.listenersAttached = 'true';
    }
    
    if (startVoiceCallBtn && !startVoiceCallBtn.dataset.listenersAttached) {
        startVoiceCallBtn.addEventListener('click', () => {
            console.log('Voice call button clicked');
            if (currentChatRecipient) {
                console.log('Starting voice call with:', currentChatRecipient.name);
                startPrivateVoiceCall(currentChatRecipient._id, currentChatRecipient.name);
            } else {
                console.log('No current chat recipient');
                showAlert('Please select a chat first', 'error');
            }
        });
        startVoiceCallBtn.dataset.listenersAttached = 'true';
    }
}

async function loadChatList() {
    try {
        const data = await apiRequest('/chat/recent');
        chatList = data.recentChats || [];
        displayChatList(chatList);
    } catch (error) {
        console.error('Failed to load chat list:', error);
        chatList = [];
        displayChatList([]);
    }
}

function displayChatList(chats) {
    const chatListContainer = document.getElementById('chat-list');
    if (!chatListContainer) return;
    
    if (chats.length === 0) {
        chatListContainer.innerHTML = '<div class="empty-chat-list">No chats yet. Start a new conversation!</div>';
        return;
    }
    
    chatListContainer.innerHTML = chats.map(chat => {
        const avatar = chat.name.charAt(0).toUpperCase();
        const lastMessage = chat.lastMessage || 'No messages yet';
        const preview = lastMessage.length > 40 ? lastMessage.substring(0, 40) + '...' : lastMessage;
        
        return `
            <div class="chat-list-item" data-user-id="${chat._id}" onclick="selectChat('${chat._id}')">
                <div class="chat-list-item-avatar">${avatar}</div>
                <div class="chat-list-item-content">
                    <div class="chat-list-item-name">${chat.name}</div>
                    <div class="chat-list-item-preview">${preview}</div>
                </div>
            </div>
        `;
    }).join('');
}

function filterChatList(query) {
    if (!query.trim()) {
        displayChatList(chatList);
        return;
    }
    
    const filtered = chatList.filter(chat => 
        chat.name.toLowerCase().includes(query.toLowerCase())
    );
    displayChatList(filtered);
}

function showNewChatSelection() {
    document.getElementById('new-chat-selection').classList.remove('hidden');
    document.getElementById('active-chat-window').classList.add('hidden');
    document.getElementById('chat-empty-state').classList.add('hidden');
    
    // Clear and focus search
    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput) {
        userSearchInput.value = '';
        userSearchInput.focus();
    }
    
    // Clear suggestions
    document.getElementById('user-suggestions').innerHTML = '';
}

function showChatEmptyState() {
    document.getElementById('new-chat-selection').classList.add('hidden');
    document.getElementById('active-chat-window').classList.add('hidden');
    document.getElementById('chat-empty-state').classList.remove('hidden');
    
    // Clear active chat selection
    document.querySelectorAll('.chat-list-item').forEach(item => {
        item.classList.remove('active');
    });
    
    currentChatRecipient = null;
}

async function searchUsersForNewChat(query) {
    const userSuggestionsContainer = document.getElementById('user-suggestions');
    if (!userSuggestionsContainer) return;
    
    if (query.trim() === '') {
        userSuggestionsContainer.innerHTML = '';
        return;
    }
    
    try {
        const data = await apiRequest(`/users/search?q=${encodeURIComponent(query)}`);
        const users = data.users || [];
        
        userSuggestionsContainer.innerHTML = users.map(user => {
            const avatar = user.name.charAt(0).toUpperCase();
            return `
                <div class="user-suggestion-item" onclick="startChatWithUser('${user._id}')">
                    <div class="user-suggestion-avatar">${avatar}</div>
                    <div class="user-suggestion-content">
                        <h4>${user.name}</h4>
                        <p>@${user.username || user.email}</p>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to search users:', error);
        userSuggestionsContainer.innerHTML = '<div class="error-message">Failed to search users</div>';
    }
}

async function startChatWithUser(userId) {
    try {
        // Get user details
        const userData = await apiRequest(`/users/${userId}`);
        const user = userData.user;
        
        // Add to chat list if not already there
        const existingChat = chatList.find(chat => chat._id === userId);
        if (!existingChat) {
            chatList.unshift({
                _id: user._id,
                name: user.name,
                username: user.username,
                lastMessage: ''
            });
            displayChatList(chatList);
        }
        
        // Select this chat
        selectChat(userId);
        
    } catch (error) {
        console.error('Failed to start chat:', error);
        showAlert('Failed to start chat', 'error');
    }
}

async function selectChat(userId, userName, userUsername) {
    try {
        console.log('Selecting chat with user:', userName, 'ID:', userId);
        
        // Get user details
        const userData = await apiRequest(`/users/${userId}`);
        currentChatRecipient = userData.user;
        
        console.log('Current chat recipient set to:', currentChatRecipient);
        
        // Update UI
        document.getElementById('new-chat-selection').classList.add('hidden');
        document.getElementById('chat-empty-state').classList.add('hidden');
        document.getElementById('active-chat-window').classList.remove('hidden');
        
        // Update chat header
        document.getElementById('chat-recipient-name').textContent = currentChatRecipient.name;
        document.getElementById('chat-recipient-details').innerHTML = `
            <p>@${currentChatRecipient.username}</p>
            <p>${currentChatRecipient.schoolGrade} • ${currentChatRecipient.subjectInterests?.join(', ') || 'No subjects listed'}</p>
        `;
        
        // Update active state in chat list
        document.querySelectorAll('.chat-list-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-user-id="${userId}"]`)?.classList.add('active');
        
        // Load chat history
        await loadChatHistory(userId);
        
        // Focus on message input
        const messageInput = document.getElementById('chat-message-input');
        if (messageInput) {
            messageInput.focus();
        }
        
    } catch (error) {
        console.error('Failed to select chat:', error);
        showAlert('Failed to load chat', 'error');
    }
}

async function loadChatHistory(recipientId) {
    const chatMessagesContainer = document.getElementById('chat-messages');
    if (!chatMessagesContainer) return;
    
    console.log('Loading chat history for recipient:', recipientId);
    chatMessagesContainer.innerHTML = '<div class="loading-message">Loading messages...</div>';
    
    try {
        const data = await apiRequest(`/chat/history/${recipientId}`);
        const messages = data.messages || [];
        
        console.log('Loaded chat history:', messages.length, 'messages');
        chatMessagesContainer.innerHTML = '';
        
        messages.forEach(message => {
            // Transform message format for display
            const displayMessage = {
                _id: message._id,
                senderId: message.sender ? message.sender.toString() : message.senderId,
                senderName: message.senderName,
                senderUsername: message.senderUsername,
                text: message.text,
                timestamp: message.timestamp,
                recipientId: message.recipient ? message.recipient.toString() : message.recipientId,
                recipientUsername: message.recipientUsername,
                isBot: message.senderName === 'Feynman Bot' || message.senderId === 'bot'
            };
            displayChatMessage(displayMessage);
        });
        
        // Scroll to bottom
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        
    } catch (error) {
        console.error('Failed to load chat history:', error);
        chatMessagesContainer.innerHTML = '<div class="error-message">Failed to load messages. Please try again.</div>';
    }
}

function displayChatMessage(message) {
    const chatMessagesContainer = document.getElementById('chat-messages');
    if (!chatMessagesContainer) return;
    
    const isOwn = message.senderId === currentUser?.id || message.sender === currentUser?.id;
    const isBot = message.senderId === 'bot' || message.isBot || message.senderName === 'Feynman Bot';
    
    // Only display if this is the current chat
    if (currentChatRecipient) {
        if (isBot && currentChatRecipient._id === 'feynman-bot') {
            // Show bot message in bot chat
        } else if (!isBot) {
            const isForCurrentChat = (message.senderId === currentChatRecipient._id || message.recipientId === currentChatRecipient._id);
            if (!isForCurrentChat) return;
        } else {
            return; // Don't show bot messages in regular chats
        }
    }
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    
    if (isBot) {
        messageElement.classList.add('chat-message--bot');
        messageElement.innerHTML = `${message.text}`;
    } else if (isOwn) {
        messageElement.classList.add('chat-message--own');
        messageElement.textContent = message.text;
    } else {
        messageElement.classList.add('chat-message--other');
        messageElement.innerHTML = `<strong>${message.senderName}:</strong> ${message.text}`;
    }
    
    chatMessagesContainer.appendChild(messageElement);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const messageText = input.value.trim();
    
    if (!messageText || !currentChatRecipient) {
        console.log('Cannot send message - missing text or recipient');
        return;
    }
    
    console.log('Sending chat message to:', currentChatRecipient.name);
    
    const message = {
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderUsername: currentUser.username,
        text: messageText,
        recipientId: currentChatRecipient._id,
        recipientUsername: currentChatRecipient.username,
        timestamp: new Date().toISOString(),
        localId: Date.now() // For optimistic UI updates
    };
    
    console.log('Message payload:', message);
    
    // Send via socket to save in database
    window.appSocket?.emit('chat-message', message);
    
    // Clear input
    input.value = '';
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
        // Refresh private chat history shortly after sending to reflect DB save
        setTimeout(() => {
            loadPrivateChatHistory(selectedChatRecipient._id);
        }, 150);
    } else {
        // Send to general chat
        const outgoing = { ...message, sessionId: 'general-chat' };
        window.appSocket?.emit('chat-message', outgoing);
        // Refresh general chat history shortly after sending
        setTimeout(() => {
            loadGeneralChatHistory('general-chat');
        }, 150);
    }

    // Clear the input box after sending; message will appear when server echoes it back
    const chatMessageInput = document.getElementById('chat-message-input');
    if (chatMessageInput) chatMessageInput.value = '';
}

function updateNotesUI() {
    console.log('Updating notes UI...');
    fetchAndDisplayAllNotes(); // Fetch combined notes from backend

    // Event listeners for notes
    document.getElementById('create-note-btn')?.addEventListener('click', () => {
        showNoteEditor();
    });
    document.getElementById('cancel-note-btn')?.addEventListener('click', () => {
        hideNoteEditor();
    });
    document.getElementById('save-note-btn')?.addEventListener('click', handleSaveNote);
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
        // Backend /notes already returns combined private + public notes for this user
        const data = await apiRequest('/notes');
        const allNotes = data.notes || [];

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
            const publicBadge = note.isPublic ? '<span class="note-public-badge">Public</span>' : '';
            const editButtons = note.owner === currentUser?.id ? `
                <button class="btn btn--sm btn--secondary" onclick="editNote('${note._id}')">Edit</button>
                <button class="btn btn--sm btn--danger" onclick="deleteNote('${note._id}')">Delete</button>
            ` : '';
            const pdfButton = (note.pdf && note.pdf.path) ? `
                <button class="btn btn--sm" onclick="downloadNotePdf('${note._id}', '${(note.pdf.originalName || (note.title + '.pdf')).replace(/[^a-z0-9_.-]/gi, '_')}')">Download PDF</button>
            ` : '';
            noteElement.innerHTML = `
                <h3>${note.title} ${publicBadge}</h3>
                <p>${note.content}</p>
                <div class="note-actions">
                    ${editButtons}
                    <button class="btn btn--sm btn--primary" onclick="downloadNote('${note._id}', '${note.title}')">Download</button>
                    ${pdfButton}
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
    currentEditingNoteId = null;
    // Clear file input if present
    const attachInput = document.getElementById('attach-pdf-input');
    if (attachInput) attachInput.value = '';
}

async function handleSaveNote() {
    const title = document.getElementById('note-title-input').value;
    const content = document.getElementById('note-content-input').value;
    const attachInput = document.getElementById('attach-pdf-input');
    const attachFile = attachInput && attachInput.files && attachInput.files[0] ? attachInput.files[0] : null;

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
            // If a file is selected, attach/replace the PDF on this note
            if (attachFile) {
                await attachPdfToNote(currentEditingNoteId, attachFile);
            }
            showAlert('Note updated successfully!', 'success');
        } else {
            // Create new note (default to not public)
            const createRes = await apiRequest('/notes', {
                method: 'POST',
                body: JSON.stringify({ title, content, isPublic: false })
            });
            const newNoteId = createRes?.note?._id;
            // If a file is selected, attach it to the newly created note
            if (attachFile && newNoteId) {
                await attachPdfToNote(newNoteId, attachFile);
            }
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

// Upload a new note directly from a PDF file (creates a new Note)
async function handlePdfUploadNewNote(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        showAlert('Uploading PDF as a new note...', 'info');
        const fd = new FormData();
        fd.append('pdf', file);
        // Optional: let backend infer title from file name; can also add custom title
        const response = await fetch(`${API_BASE_URL}/notes/upload`, {
            method: 'POST',
            body: fd,
            credentials: 'include'
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to upload PDF');
        showAlert('PDF uploaded and saved as a note!', 'success');
        fetchAndDisplayAllNotes();
    } catch (error) {
        console.error('Error uploading PDF:', error);
        showAlert('Failed to upload PDF: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        // reset input
        event.target.value = '';
    }
}

async function attachPdfToNote(noteId, file) {
    const fd = new FormData();
    fd.append('pdf', file);
    const response = await fetch(`${API_BASE_URL}/notes/${noteId}/attach-pdf`, {
        method: 'POST',
        body: fd,
        credentials: 'include'
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to attach PDF');
    }
    return data.note;
}

async function downloadNotePdf(noteId, filename) {
    try {
        const response = await fetch(`${API_BASE_URL}/notes/download-pdf/${noteId}`, { credentials: 'include' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to download PDF');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'note.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showAlert('PDF downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error downloading PDF:', error);
        showAlert('Failed to download PDF: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Session reminder popup (15 minutes before)
function showSessionReminderPopup(payload) {
    try {
        // Remove existing popup if any
        const old = document.getElementById('session-reminder-popup');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'session-reminder-popup';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const box = document.createElement('div');
        box.style.background = '#fff';
        box.style.padding = '24px';
        box.style.borderRadius = '12px';
        box.style.maxWidth = '400px';
        box.style.textAlign = 'center';
        box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        box.innerHTML = `
            <h3 style="margin: 0 0 16px 0; color: #333;">📚 Session Reminder</h3>
            <p style="margin: 0 0 16px 0; color: #666;">Your session "<strong>${payload.topic}</strong>" starts in ${payload.minutes} minutes!</p>
            <p style="margin: 0 0 20px 0; color: #888; font-size: 14px;">Get ready to join the session.</p>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button id="btn-dismiss-reminder" class="btn btn--secondary">Got it</button>
                <button id="btn-view-session" class="btn btn--primary">View Session</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('btn-dismiss-reminder').onclick = () => {
            overlay.remove();
        };
        
        document.getElementById('btn-view-session').onclick = () => {
            overlay.remove();
            // Switch to sessions tab
            showSessionsTab('my-sessions');
        };

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (document.getElementById('session-reminder-popup')) {
                overlay.remove();
            }
        }, 10000);

    } catch (e) {
        console.error('Error showing session reminder popup', e);
    }
}

// Meeting link popup (5 minutes before)
function showMeetingLinkPopup(payload) {
    try {
        // Remove existing popup if any
        const old = document.getElementById('meeting-link-popup');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'meeting-link-popup';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const box = document.createElement('div');
        box.style.background = '#fff';
        box.style.padding = '24px';
        box.style.borderRadius = '12px';
        box.style.maxWidth = '400px';
        box.style.textAlign = 'center';
        box.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
        box.innerHTML = `
            <h3 style="margin: 0 0 16px 0; color: #333;">🎥 Session Ready</h3>
            <p style="margin: 0 0 16px 0; color: #666;">Your session "<strong>${payload.topic}</strong>" starts in ${payload.minutes} minutes!</p>
            <p style="margin: 0 0 20px 0; color: #888; font-size: 14px;">Join the video conference now.</p>
            <div style="display:flex; gap:12px; justify-content:center;">
                <button id="btn-dismiss-meeting" class="btn btn--secondary">Later</button>
                <button id="btn-join-meeting" class="btn btn--primary">Join Now</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('btn-dismiss-meeting').onclick = () => {
            overlay.remove();
        };
        
        document.getElementById('btn-join-meeting').onclick = () => {
            overlay.remove();
            // Join the session video conference
            showVideoConference(payload.sessionId, payload.topic);
        };

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (document.getElementById('meeting-link-popup')) {
                overlay.remove();
            }
        }, 15000);

    } catch (e) {
        console.error('Error showing meeting link popup', e);
    }
}

// Test function to verify Socket.IO is working
function testSocketConnection() {
    if (!window.appSocket) {
        console.error('Socket not initialized');
        return false;
    }
    
    if (!window.appSocket.connected) {
        console.error('Socket not connected');
        return false;
    }
    
    if (!currentUser) {
        console.error('No current user');
        return false;
    }
    
    console.log('Socket connection test passed');
    console.log('Socket ID:', window.appSocket.id);
    console.log('Current user:', currentUser.id);
    
    // Test emit
    window.appSocket.emit('test-message', { userId: currentUser.id, message: 'Test from frontend' });
    
    return true;
}

// Make test function available globally for debugging
window.testSocketConnection = testSocketConnection;

// Test function for session notifications
function testSessionNotification() {
    if (!window.appSocket || !window.appSocket.connected) {
        console.error('Socket not connected');
        return;
    }
    
    // Simulate a session reminder
    const testPayload = {
        type: 'session-reminder',
        sessionId: 'test-session-id',
        topic: 'Test Session',
        date: new Date(),
        minutes: 15
    };
    
    console.log('Triggering test session notification');
    window.appSocket.emit('test-session-notification', testPayload);
}

// Test function for bot message
function testBotMessage() {
    if (!window.appSocket || !window.appSocket.connected) {
        console.error('Socket not connected');
        return;
    }
    
    const testMessage = {
        senderId: 'bot',
        senderName: 'Feynman Bot',
        senderUsername: 'feynman_bot',
        text: '🤖 This is a test bot message!',
        recipientId: currentUser?.id,
        recipientUsername: currentUser?.username,
        timestamp: new Date().toISOString(),
        isBot: true
    };
    
    console.log('Triggering test bot message');
    window.appSocket.emit('chat-message', testMessage);
}

// Function to check connected users
function checkConnectedUsers() {
    if (!window.appSocket || !window.appSocket.connected) {
        console.error('Socket not connected');
        return;
    }
    
    console.log('Checking connected users...');
    window.appSocket.emit('check-connected-users');
}

// Test call function
function testCall(recipientUserId) {
    if (!window.appSocket || !window.appSocket.connected) {
        console.error('Socket not connected');
        return;
    }
    
    if (!currentUser) {
        console.error('No current user');
        return;
    }
    
    const callPayload = {
        toUserId: recipientUserId,
        fromUserId: currentUser.id,
        fromName: currentUser.name,
        mediaType: 'video',
        roomId: `test-room-${Date.now()}`,
    };
    
    console.log('Sending test call:', callPayload);
    window.appSocket.emit('initiate-private-call', callPayload);
}

// Test login function
function testLogin() {
    console.log('Testing login functionality...');
    const loginForm = document.getElementById('login-form');
    console.log('Login form exists:', !!loginForm);
    
    if (loginForm) {
        console.log('Form action:', loginForm.action);
        console.log('Form method:', loginForm.method);
        console.log('Form event listeners:', loginForm.cloneNode().outerHTML);
    }
    
    const identifierInput = document.getElementById('login-identifier');
    const passwordInput = document.getElementById('login-password');
    const submitButton = document.querySelector('#login-form button[type="submit"]');
    
    console.log('Identifier input exists:', !!identifierInput);
    console.log('Password input exists:', !!passwordInput);
    console.log('Submit button exists:', !!submitButton);
    
    if (identifierInput) console.log('Identifier value:', identifierInput.value);
    if (passwordInput) console.log('Password value:', passwordInput.value);
    
    // Test button click
    if (submitButton) {
        console.log('Testing button click...');
        submitButton.click();
    }
}

// Force login with test credentials
function forceTestLogin() {
    console.log('Force testing login...');
    
    // Fill in test values
    const identifierInput = document.getElementById('login-identifier');
    const passwordInput = document.getElementById('login-password');
    
    if (identifierInput && passwordInput) {
        identifierInput.value = 'test@example.com';
        passwordInput.value = 'testpassword';
        
        console.log('Test values filled, attempting login...');
        handleLoginDirect();
    } else {
        console.error('Could not find login inputs');
    }
}

// Test message saving
function testMessageSaving() {
    if (!currentUser || !currentChatRecipient) {
        console.error('Need to be logged in and have a chat selected');
        return;
    }
    
    const testMessage = {
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderUsername: currentUser.username,
        text: `Test message at ${new Date().toLocaleTimeString()}`,
        recipientId: currentChatRecipient._id,
        recipientUsername: currentChatRecipient.username,
        timestamp: new Date().toISOString(),
        localId: Date.now()
    };
    
    console.log('Sending test message:', testMessage);
    window.appSocket?.emit('chat-message', testMessage);
}

// Test chat history loading
async function testChatHistory() {
    if (!currentChatRecipient) {
        console.error('Need to have a chat selected');
        return;
    }
    
    console.log('Testing chat history loading for:', currentChatRecipient._id);
    
    try {
        const data = await apiRequest(`/chat/history/${currentChatRecipient._id}`);
        console.log('Chat history loaded:', data);
        return data;
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}

// Make test functions available globally
window.testSessionNotification = testSessionNotification;
window.testBotMessage = testBotMessage;
window.checkConnectedUsers = checkConnectedUsers;
window.testCall = testCall;
window.testLogin = testLogin;
window.forceTestLogin = forceTestLogin;
window.setupLoginForm = setupLoginForm;
window.testMessageSaving = testMessageSaving;
window.testChatHistory = testChatHistory;

// Add Feynman Bot to chat list
function addFeynmanBotToChat() {
    const chatListContainer = document.getElementById('chat-list');
    if (!chatListContainer) return;
    
    // Check if bot is already in the list
    if (document.querySelector('[data-user-id="feynman-bot"]')) return;
    
    const botChatItem = document.createElement('div');
    botChatItem.className = 'chat-list-item';
    botChatItem.setAttribute('data-user-id', 'feynman-bot');
    botChatItem.onclick = () => selectBotChat();
    botChatItem.innerHTML = `
        <div class="chat-list-item-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">🤖</div>
        <div class="chat-list-item-content">
            <div class="chat-list-item-name">Feynman Bot</div>
            <div class="chat-list-item-preview">Welcome! I'll help you with session updates.</div>
        </div>
    `;
    
    // Add at the top of the list
    chatListContainer.insertBefore(botChatItem, chatListContainer.firstChild);
}

// Update bot chat preview
function updateBotChatPreview(text) {
    const botChatItem = document.querySelector('[data-user-id="feynman-bot"]');
    if (botChatItem) {
        const preview = botChatItem.querySelector('.chat-list-item-preview');
        if (preview) {
            const previewText = text.length > 40 ? text.substring(0, 40) + '...' : text;
            preview.textContent = previewText;
        }
    }
}

// Select bot chat
function selectBotChat() {
    currentChatRecipient = {
        _id: 'feynman-bot',
        name: 'Feynman Bot',
        username: 'feynman_bot'
    };
    
    // Update UI
    document.getElementById('new-chat-selection').classList.add('hidden');
    document.getElementById('chat-empty-state').classList.add('hidden');
    document.getElementById('active-chat-window').classList.remove('hidden');
    
    // Update chat header
    document.getElementById('chat-recipient-name').textContent = 'Feynman Bot';
    document.getElementById('chat-recipient-details').innerHTML = `
        <p>Your AI assistant for session updates</p>
    `;
    
    // Update active state in chat list
    document.querySelectorAll('.chat-list-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector('[data-user-id="feynman-bot"]')?.classList.add('active');
    
    // Load bot chat history
    loadBotChatHistory();
}

// Load bot chat history
async function loadBotChatHistory() {
    const chatMessagesContainer = document.getElementById('chat-messages');
    if (!chatMessagesContainer) return;
    
    chatMessagesContainer.innerHTML = '';
    
    try {
        // Get bot messages for current user
        const data = await apiRequest(`/chat/bot-messages`);
        const messages = data.messages || [];
        
        messages.forEach(message => {
            displayChatMessage(message);
        });
        
        // Scroll to bottom
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        
    } catch (error) {
        console.error('Failed to load bot chat history:', error);
        // Show welcome message if no history
        const welcomeMessage = {
            senderId: 'bot',
            senderName: 'Feynman Bot',
            text: '🤖 Hello! I\'m Feynman Bot. I\'ll keep you updated about your sessions and help you stay organized.',
            isBot: true
        };
        displayChatMessage(welcomeMessage);
    }
}