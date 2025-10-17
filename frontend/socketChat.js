// Socket.IO Chat Implementation for Feynman Learn
class SocketChat {
    constructor() {
        this.socket = null;
        this.currentChatUser = null;
        this.currentUser = null;
        this.messages = [];
        this.isConnected = false;
        this.isTyping = false;
        this.typingTimer = null;

        this.initializeSocket();
        this.attachEventListeners();
    }

    initializeSocket() {
        // Initialize Socket.IO connection to backend server on port 5002
        this.socket = io('http://localhost:5002');

        this.socket.on('connect', () => {
            console.log('Connected to Socket.IO server');
            this.isConnected = true;
            this.authenticateUser();
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from Socket.IO server');
            this.isConnected = false;
        });

        // Handle incoming messages
        this.socket.on('chat-message', (message) => {
            this.displayMessage(message);
            this.updateChatList(message);
        });

        // Handle typing indicators
        this.socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.userId, true);
        });

        this.socket.on('user_stopped_typing', (data) => {
            this.showTypingIndicator(data.userId, false);
        });

        // Handle authentication response
        this.socket.on('authenticated', (data) => {
            console.log('Socket.IO authentication successful:', data);
            this.currentUser = data.userId;
        });

        // Handle authentication errors
        this.socket.on('auth_error', (error) => {
            console.error('Socket.IO authentication failed:', error);
        });
    }

    authenticateUser() {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        if (token) {
            this.socket.emit('authenticate', { token });
            this.currentUser = user.id || user._id;
        }
    }

    getCurrentUserName() {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user.name || 'Unknown User';
    }

    getCurrentUsername() {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user.username || 'unknown';
    }

    attachEventListeners() {
        // Chat list item clicks
        document.addEventListener('click', (e) => {
            if (e.target.closest('.chat-list-item')) {
                const chatItem = e.target.closest('.chat-list-item');
                const userId = chatItem.dataset.userId;
                this.openChat(userId);
            }
        });

        // Send message on button click
        const sendButton = document.getElementById('send-chat-button');
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        // Send message on Enter key
        const messageInput = document.getElementById('chat-message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Typing indicators
            messageInput.addEventListener('input', () => {
                this.handleTyping();
            });
        }

        // New chat button
        const newChatBtn = document.getElementById('start-new-chat-btn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => {
                this.showNewChatSelection();
            });
        }

        // Back to chat list button
        const backBtn = document.getElementById('back-to-chat-list');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showChatList();
            });
        }

        // Call buttons
        const voiceCallBtn = document.getElementById('start-voice-call-btn');
        const videoCallBtn = document.getElementById('start-video-call-btn');

        if (voiceCallBtn) {
            voiceCallBtn.addEventListener('click', () => {
                this.startVoiceCall();
            });
        }

        if (videoCallBtn) {
            videoCallBtn.addEventListener('click', () => {
                this.startVideoCall();
            });
        }
    }

    async loadChatHistory(recipientId) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/chat/history/${recipientId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.messages = data.messages || [];
                this.displayMessages();
                console.log(`Loaded ${this.messages.length} messages`);
            } else if (response.status === 401) {
                // User not authenticated, redirect to login
                console.log('Chat history authentication failed, redirecting to login');
                if (window.showLogin) {
                    window.showLogin();
                }
                this.messages = [];
                this.displayMessages();
            } else {
                console.error('Failed to load chat history');
                this.messages = [];
                this.displayMessages();
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.messages = [];
            this.displayMessages();
        }
    }

    async loadRecentChats() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/chat/recent', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayRecentChats(data.recentChats || []);
            } else if (response.status === 401) {
                // User not authenticated, redirect to login
                console.log('Chat authentication failed, redirecting to login');
                if (window.showLogin) {
                    window.showLogin();
                }
                this.displayRecentChats([]);
            } else {
                console.error('Failed to load recent chats');
                this.displayRecentChats([]);
            }
        } catch (error) {
            console.error('Error loading recent chats:', error);
            this.displayRecentChats([]);
        }
    }

    displayRecentChats(chats) {
        const chatList = document.getElementById('chat-list');
        if (!chatList) return;

        chatList.innerHTML = '';

        if (chats.length === 0) {
            chatList.innerHTML = '<div class="empty-state">No chats yet. Start a new conversation!</div>';
            return;
        }

        chats.forEach(chat => {
            const chatItem = this.createChatListItem(chat);
            chatList.appendChild(chatItem);
        });
    }

    createChatListItem(user) {
        const item = document.createElement('div');
        item.className = 'chat-list-item';
        item.dataset.userId = user._id;

        const avatar = user.name.charAt(0).toUpperCase();
        const displayName = user.name || user.username || 'Unknown User';

        item.innerHTML = `
            <div class="chat-list-item-avatar">${avatar}</div>
            <div class="chat-list-item-content">
                <h4 class="chat-list-item-name">${displayName}</h4>
                <p class="chat-list-item-preview">Click to start chatting</p>
            </div>
        `;

        return item;
    }

    async openChat(recipientId) {
        if (!recipientId || recipientId === this.currentChatUser) return;

        this.currentChatUser = recipientId;

        // Hide new chat selection and show active chat
        this.showActiveChat();

        // Load and display chat history
        await this.loadChatHistory(recipientId);

        // Update chat header
        this.updateChatHeader(recipientId);

        // Scroll to bottom
        this.scrollToBottom();
    }

    showActiveChat() {
        const newChatSelection = document.getElementById('new-chat-selection');
        const activeChatWindow = document.getElementById('active-chat-window');
        const emptyState = document.getElementById('chat-empty-state');

        if (newChatSelection) newChatSelection.classList.add('hidden');
        if (activeChatWindow) activeChatWindow.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');
    }

    showChatList() {
        const newChatSelection = document.getElementById('new-chat-selection');
        const activeChatWindow = document.getElementById('active-chat-window');
        const emptyState = document.getElementById('chat-empty-state');

        if (newChatSelection) newChatSelection.classList.add('hidden');
        if (activeChatWindow) activeChatWindow.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
    }

    showNewChatSelection() {
        const newChatSelection = document.getElementById('new-chat-selection');
        const activeChatWindow = document.getElementById('active-chat-window');
        const emptyState = document.getElementById('chat-empty-state');

        if (newChatSelection) newChatSelection.classList.remove('hidden');
        if (activeChatWindow) activeChatWindow.classList.add('hidden');
        if (emptyState) emptyState.classList.add('hidden');
    }

    updateChatHeader(recipientId) {
        // This would typically fetch user details and update the header
        // For now, we'll use a placeholder
        const recipientName = document.getElementById('chat-recipient-name');
        if (recipientName) {
            recipientName.textContent = `Chat with User ${recipientId.substring(0, 8)}`;
        }
    }

    displayMessages() {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        if (this.messages.length === 0) {
            messagesContainer.innerHTML = '<div class="empty-state">No messages yet. Start the conversation!</div>';
            return;
        }

        this.messages.forEach(message => {
            this.displayMessage(message);
        });
    }

    displayMessage(message) {
        // Skip if message is from current user (already displayed optimistically)
        if (message.localId && message.localId.startsWith('temp-')) {
            const existingMessage = document.querySelector(`[data-temp-id="${message.localId}"]`);
            if (existingMessage) {
                existingMessage.removeAttribute('data-temp-id');
                existingMessage.setAttribute('data-message-id', message._id);
                return;
            }
        }

        // Skip if message already exists
        if (document.querySelector(`[data-message-id="${message._id}"]`)) {
            return;
        }

        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        const messageElement = this.createMessageElement(message);
        messagesContainer.appendChild(messageElement);

        // Scroll to bottom after displaying message
        this.scrollToBottom();
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        const isOwn = message.senderId === this.currentUser || message.sender === this.currentUser;
        div.className = `chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'}`;

        if (message.localId && message.localId.startsWith('temp-')) {
            div.setAttribute('data-temp-id', message.localId);
        } else if (message._id) {
            div.setAttribute('data-message-id', message._id);
        }

        const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        div.innerHTML = `
            <div class="message-content">
                ${!isOwn ? `<div class="message-sender">${this.escapeHtml(message.senderName || 'Unknown')}</div>` : ''}
                <div class="message-text">${this.escapeHtml(message.text)}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;

        return div;
    }

    async sendMessage() {
        const messageInput = document.getElementById('chat-message-input');
        if (!messageInput || !this.currentChatUser) return;

        const text = messageInput.value.trim();
        if (!text) return;

        // Create optimistic message for immediate display
        const optimisticMessage = {
            _id: 'temp-' + Date.now(),
            sender: this.currentUser,
            recipient: this.currentChatUser,
            text: text,
            timestamp: new Date(),
            isOptimistic: true
        };

        // Display message immediately
        this.displayMessage(optimisticMessage);

        // Clear input
        messageInput.value = '';

        // Stop typing indicator
        this.stopTyping();

        try {
            // Send message via Socket.IO
            this.socket.emit('chat-message', {
                recipientId: this.currentChatUser,
                senderId: this.currentUser,
                senderName: this.getCurrentUserName(),
                senderUsername: this.getCurrentUsername(),
                text: text,
                timestamp: new Date(),
                localId: optimisticMessage._id
            });

            console.log('Message sent via Socket.IO');
        } catch (error) {
            console.error('Error sending message:', error);
            // Remove optimistic message on error
            const tempMessage = document.querySelector('.chat-message[data-temp-id="' + optimisticMessage._id + '"]');
            if (tempMessage) {
                tempMessage.remove();
            }

            // Restore input text
            messageInput.value = text;

            this.showError('Failed to send message. Please try again.');
        }
    }

    handleTyping() {
        if (!this.isConnected || !this.currentChatUser) return;

        // Send typing indicator
        this.socket.emit('typing', { recipientId: this.currentChatUser });

        // Clear previous timer
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
        }

        // Set timer to stop typing indicator after 3 seconds of inactivity
        this.typingTimer = setTimeout(() => {
            this.stopTyping();
        }, 3000);
    }

    stopTyping() {
        if (!this.isConnected || !this.currentChatUser) return;

        this.socket.emit('stop_typing', { recipientId: this.currentChatUser });

        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
    }

    showTypingIndicator(userId, show) {
        if (userId !== this.currentChatUser) return;

        let typingIndicator = document.querySelector('.typing-indicator');
        if (show) {
            if (!typingIndicator) {
                typingIndicator = document.createElement('div');
                typingIndicator.className = 'typing-indicator chat-message chat-message--other';
                typingIndicator.innerHTML = '<div class="message-content"><div class="typing-dots">Typing...</div></div>';
                document.getElementById('chat-messages').appendChild(typingIndicator);
            }
        } else if (typingIndicator) {
            typingIndicator.remove();
        }

        this.scrollToBottom();
    }

    updateChatList(message) {
        // Update the chat list with the latest message preview
        const chatList = document.getElementById('chat-list');
        if (!chatList) return;

        // Find existing chat item or create new one
        let chatItem = chatList.querySelector(`[data-user-id="${message.sender}"]`);
        if (!chatItem && message.recipient === this.currentUser) {
            // Create new chat item for incoming message
            const userItem = { _id: message.sender, name: message.senderName };
            chatItem = this.createChatListItem(userItem);
            chatList.insertBefore(chatItem, chatList.firstChild);
        }

        if (chatItem) {
            const preview = chatItem.querySelector('.chat-list-item-preview');
            if (preview) {
                preview.textContent = message.text.length > 50 ?
                    message.text.substring(0, 50) + '...' : message.text;
            }
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
    }

    startVoiceCall() {
        if (!this.currentChatUser) {
            this.showError('Please select a chat first');
            return;
        }

        // Implement voice call functionality
        console.log('Starting voice call with:', this.currentChatUser);
        // For now, just show a placeholder
        this.showNotification('Voice calling feature coming soon!');
    }

    startVideoCall() {
        if (!this.currentChatUser) {
            this.showError('Please select a chat first');
            return;
        }

        // Implement video call functionality
        console.log('Starting video call with:', this.currentChatUser);
        // For now, just show a placeholder
        this.showNotification('Video calling feature coming soon!');
    }

    showError(message) {
        // Use existing alert system
        if (window.showAlert) {
            window.showAlert(message, 'error');
        } else {
            alert(message);
        }
    }

    showNotification(message) {
        // Use existing notification system
        if (window.showNotification) {
            window.showNotification(message);
        } else {
            console.log('Notification:', message);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize chat when DOM is loaded
    init() {
        // Set current user from window or localStorage
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        this.currentUser = user.id || user._id || window.currentUserId;

        if (!this.currentUser) {
            console.warn('No current user found. Chat functionality may be limited.');
        }

        // Load recent chats
        this.loadRecentChats();

        console.log('SocketChat initialized for user:', this.currentUser);
    }
}

// Initialize chat when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.socketChat = new SocketChat();
    window.socketChat.init();
});

module.exports = SocketChat;
