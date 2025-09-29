/**
 * Socket.IO-powered chat system with encryption
 * Replaces Ably with Socket.IO for real-time messaging
 */

class SocketChat {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.messageCallbacks = new Map();
        this.presenceCallbacks = new Map();
        this.typingTimeouts = new Map();
        this.messageStatus = new Map(); // Track message delivery status
        this.onlineUsers = new Set();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.pendingMessages = []; // Store messages to retry when connection is established
        this.onConnectionEstablished = null; // Callback for when connection is established
    }

    /**
     * Initialize Socket.IO client with authentication
     */
    async init(currentUser) {
        this.currentUser = currentUser;
        
        try {
            if (this.socket) {
                console.log('🔌 Socket.IO already initialized, disconnecting first...');
                this.socket.disconnect();
            }

            // Initialize Socket.IO client with proper configuration
            const socketUrl = window.location.origin.replace('http', 'ws'); // Use WebSocket protocol
            console.log('🔌 Connecting to Socket.IO server at:', socketUrl);
            
            this.socket = io({
                path: '/socket.io/',
                transports: ['websocket', 'polling'],
                upgrade: true,
                rememberUpgrade: true,
                withCredentials: true,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                auth: currentUser ? { 
                    token: localStorage.getItem('token'),
                    userId: currentUser.id
                } : null
            });
            
            // Log connection events
            this.socket.on('connect', () => {
                console.log('✅ Socket.IO connected with ID:', this.socket.id);
                this.isConnected = true;
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                
                // Re-authenticate after reconnection
                if (currentUser) {
                    this.socket.emit('authenticate', {
                        token: localStorage.getItem('token'),
                        userId: currentUser.id
                    });
                }

                // Trigger connection callback for pending messages
                if (this.onConnectionEstablished) {
                    this.onConnectionEstablished();
                }
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('❌ Socket.IO connection error:', error.message);
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log('❌ Socket.IO disconnected:', reason);
                this.isConnected = false;
                this.handleReconnection();
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('❌ Socket.IO connection error:', error);
                this.isConnected = false;
                this.handleReconnection();
            });
            
            // Set up connection event handlers
            this.setupConnectionHandlers();
            
            // Set up message handlers
            this.setupMessageHandlers();
            
            // Set up periodic connection check
            setInterval(() => {
                if (!this.isConnected && this.socket) {
                    console.log('🔌 Attempting to reconnect to Socket.IO...');
                    this.socket.connect();
                }
            }, 5000); // Try to reconnect every 5 seconds
            
            console.log('✅ Socket.IO chat initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Socket.IO chat:', error);
            return false;
        }
    }

    /**
     * Handle reconnection logic with exponential backoff
     */
    handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff with max 30s
            console.log(`🔌 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
            
            setTimeout(() => {
                if (this.socket && !this.isConnected) {
                    this.socket.connect();
                }
            }, delay);
        } else {
            console.error('❌ Max reconnection attempts reached. Please refresh the page to try again.');
            this.updateConnectionStatus(false);
        }
    }
    
    /**
     * Set connection established callback to retry pending messages
     */
    setConnectionEstablishedCallback(callback) {
        this.onConnectionEstablished = () => {
            console.log('🔄 Connection established, retrying pending messages...');
            this.retryPendingMessages();
            callback();
        };
    }

    /**
     * Add a message to pending queue for retry when connection is established
     */
    addPendingMessage(messageData) {
        this.pendingMessages.push({
            ...messageData,
            timestamp: Date.now()
        });
        console.log('📝 Added message to pending queue:', this.pendingMessages.length);
    }

    /**
     * Retry all pending messages
     */
    async retryPendingMessages() {
        if (this.pendingMessages.length === 0) return;

        console.log(`🔄 Retrying ${this.pendingMessages.length} pending messages...`);

        const messagesToRetry = [...this.pendingMessages];
        this.pendingMessages = []; // Clear the queue

        for (const messageData of messagesToRetry) {
            try {
                if (messageData.recipientId) {
                    // Private message
                    await this.sendPrivateMessage(messageData.recipientId, messageData.text);
                } else if (messageData.sessionId) {
                    // Session message
                    await this.sendSessionMessage(messageData.sessionId, messageData.text);
                }
                console.log('✅ Pending message sent successfully');
            } catch (error) {
                console.error('❌ Failed to retry pending message:', error);
                // Put the message back in the queue if it fails
                this.pendingMessages.push(messageData);
            }
        }
    }

    /**
     * Set up connection event handlers
     */
    setupConnectionHandlers() {
        this.socket.on('connect', () => {
            console.log('🔗 Connected to Socket.IO server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            
            // Authenticate user
            if (this.currentUser) {
                this.socket.emit('authenticate', this.currentUser.id);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Disconnected from Socket.IO server:', reason);
            this.isConnected = false;
            this.updateConnectionStatus(false);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket.IO connection error:', error);
            this.updateConnectionStatus(false);
            this.handleReconnection();
        });

        this.socket.on('authenticated', (data) => {
            console.log('✅ User authenticated:', data);
        });
    }

    /**
     * Set up message event handlers
     */
    setupMessageHandlers() {
        // Handle private messages
        this.socket.on('private-message', (message) => {
            this.handleIncomingMessage(message, 'private');
        });

        // Handle session messages
        this.socket.on('session-message', (message) => {
            this.handleIncomingMessage(message, 'session');
        });

        // Handle general chat messages
        this.socket.on('chat-message', (message) => {
            this.handleIncomingMessage(message, 'general');
        });

        // Handle typing indicators
        this.socket.on('user-typing', (data) => {
            this.handleTypingIndicator(data);
        });

        // Handle presence updates
        this.socket.on('user-online', (data) => {
            this.onlineUsers.add(data.userId);
            this.handlePresenceUpdate({ type: 'online', ...data });
        });

        this.socket.on('user-offline', (data) => {
            this.onlineUsers.delete(data.userId);
            this.handlePresenceUpdate({ type: 'offline', ...data });
        });

        this.socket.on('presence-update', (data) => {
            this.handlePresenceUpdate({ type: 'update', ...data });
        });

        // Handle notifications
        this.socket.on('notification', (notification) => {
            this.handleNotification(notification);
        });

        // Handle enrollment updates
        this.socket.on('enrollment-update', (data) => {
            this.handleEnrollmentUpdate(data);
        });

        // Handle status updates
        this.socket.on('status-update', (data) => {
            this.handleStatusUpdate(data);
        });
    }

    /**
     * Handle incoming messages
     */
    async handleIncomingMessage(messageData, type) {
        try {
            console.log('📨 Received message via Socket.IO:', messageData);
            console.log('📨 Message encrypted flag:', messageData.encrypted);
            console.log('📨 Message text:', messageData.text);
            
            // Temporarily disable decryption for debugging
            let decryptedMessage = messageData;
            // if (messageData.encrypted && window.messageEncryption) {
            //     const channelName = this.getChannelNameFromMessage(messageData, type);
            //     decryptedMessage = await this.decryptMessage(messageData, channelName);
            // }

            // Call appropriate callback
            const callbackKey = this.getCallbackKey(messageData, type);
            const callback = this.messageCallbacks.get(callbackKey);
            if (callback) {
                callback(decryptedMessage);
            }

            // Update message status
            if (decryptedMessage.messageId) {
                this.messageStatus.set(decryptedMessage.messageId, 'delivered');
            }

            console.log(`📨 Received ${type} message:`, decryptedMessage);
        } catch (error) {
            console.error('Error handling incoming message:', error);
        }
    }

    /**
     * Handle typing indicators
     */
    handleTypingIndicator(data) {
        const callbackKey = `typing_${data.channelName || 'general'}`;
        const callback = this.presenceCallbacks.get(callbackKey);
        if (callback) {
            callback({ type: 'typing', ...data });
        }
    }

    /**
     * Handle presence updates
     */
    handlePresenceUpdate(data) {
        const callback = this.presenceCallbacks.get('presence');
        if (callback) {
            callback(data);
        }
    }

    /**
     * Handle notifications
     */
    handleNotification(notification) {
        const callback = this.messageCallbacks.get('notifications');
        if (callback) {
            callback(notification);
        }
        console.log('🔔 Received notification:', notification);
    }

    /**
     * Handle enrollment updates
     */
    handleEnrollmentUpdate(data) {
        const callback = this.messageCallbacks.get('enrollment_updates');
        if (callback) {
            callback(data);
        }
    }

    /**
     * Handle status updates
     */
    handleStatusUpdate(data) {
        const callback = this.messageCallbacks.get('status_updates');
        if (callback) {
            callback(data);
        }
    }

    /**
     * Subscribe to private messages with a user
     */
    async subscribeToPrivateChat(otherUserId, onMessage, onPresence) {
        const channelName = this.getPrivateChannelName(this.currentUser.id, otherUserId);
        
        // Join the private chat room
        this.socket.emit('join-private-chat', { otherUserId });

        // Store message callback
        const callbackKey = `private_${otherUserId}`;
        this.messageCallbacks.set(callbackKey, onMessage);

        // Store presence callback if provided
        if (onPresence) {
            this.presenceCallbacks.set(`presence_${channelName}`, onPresence);
        }

        console.log(`📱 Subscribed to private chat with user: ${otherUserId}`);
        return { channelName };
    }

    /**
     * Subscribe to session chat
     */
    async subscribeToSessionChat(sessionId, onMessage, onPresence) {
        const channelName = `chat:session:${sessionId}`;
        
        // Join the session chat room
        this.socket.emit('join-session-chat', sessionId);

        // Store message callback
        const callbackKey = `session_${sessionId}`;
        this.messageCallbacks.set(callbackKey, onMessage);

        // Store presence callback if provided
        if (onPresence) {
            this.presenceCallbacks.set(`presence_${channelName}`, onPresence);
        }

        console.log(`🏫 Subscribed to session chat: ${sessionId}`);
        return { channelName };
    }

    /**
     * Subscribe to notifications
     */
    async subscribeToNotifications(onNotification) {
        this.messageCallbacks.set('notifications', onNotification);
        console.log(`🔔 Subscribed to notifications`);
        return {};
    }

    /**
     * Subscribe to session updates (enrollment, status changes)
     */
    async subscribeToSessionUpdates(sessionId, onUpdate) {
        this.messageCallbacks.set('enrollment_updates', (data) => {
            if (data.sessionId === sessionId) {
                onUpdate({ type: 'enrollment_update', data });
            }
        });

        this.messageCallbacks.set('status_updates', (data) => {
            if (data.sessionId === sessionId) {
                onUpdate({ type: 'status_update', data });
            }
        });

        console.log(`📊 Subscribed to session updates: ${sessionId}`);
        return {};
    }

    /**
     * Send private message
     */
    async sendPrivateMessage(recipientId, text, messageType = 'text') {
        try {
            if (!this.socket || !this.socket.connected) {
                console.error('❌ Socket not connected, adding to pending messages');
                this.addPendingMessage({
                    recipientId,
                    text,
                    messageType,
                    timestamp: new Date().toISOString()
                });
                throw new Error('Socket not connected');
            }

            if (!this.currentUser || !this.currentUser.id) {
                console.error('❌ No current user, cannot send message');
                throw new Error('User not authenticated');
            }

            const messageData = {
                senderId: this.currentUser.id,
                senderName: this.currentUser.name,
                senderUsername: this.currentUser.username,
                recipientId: recipientId,
                text: text,
                messageType: messageType,
                timestamp: new Date().toISOString(),
                messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                encrypted: false
            };

            console.log('📤 Sending message:', {
                socketId: this.socket.id,
                isConnected: this.socket.connected,
                messageData: {
                    ...messageData,
                    text: text.length > 50 ? text.substring(0, 50) + '...' : text
                }
            });
            
            // Send via Socket.IO with acknowledgment
            this.socket.emit('send-private-message', messageData, (response) => {
                console.log('📩 Server acknowledged message:', response);
                if (response && response.success) {
                    this.messageStatus.set(messageData.messageId, 'delivered');
                } else {
                    console.error('❌ Error sending message:', response?.error || 'Unknown error');
                    this.messageStatus.set(messageData.messageId, 'error');
                }
            });

            // Track message status optimistically
            this.messageStatus.set(messageData.messageId, 'sending');
            console.log(`💬 Message queued for sending to ${recipientId}`);
            
            return messageData;
        } catch (error) {
            console.error('❌ Error in sendPrivateMessage:', error);
            throw error; // Re-throw to allow UI to handle the error
        }
    }

    /**
     * Send session message
     */
    async sendSessionMessage(sessionId, text, messageType = 'text') {
        const messageData = {
            senderId: this.currentUser.id,
            senderName: this.currentUser.name,
            senderUsername: this.currentUser.username,
            sessionId: sessionId,
            text: text,
            messageType: messageType,
            timestamp: new Date().toISOString(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            encrypted: false
        };

        // Encrypt the message if encryption is available
        const channelName = `chat:session:${sessionId}`;
        const encryptedMessage = await this.encryptMessage(messageData, channelName);
        
        // Send via Socket.IO
        this.socket.emit('send-session-message', encryptedMessage);

        console.log(`🏫 Sent session message to ${sessionId}`);
        return messageData;
    }

    /**
     * Send typing indicator
     */
    async sendTypingIndicator(channelName, isTyping) {
        if (isTyping) {
            this.socket.emit('typing-start', { channelName });
            
            // Auto-stop typing after 3 seconds
            const timeoutKey = `${channelName}_typing`;
            if (this.typingTimeouts.has(timeoutKey)) {
                clearTimeout(this.typingTimeouts.get(timeoutKey));
            }
            
            const timeout = setTimeout(() => {
                this.sendTypingIndicator(channelName, false);
                this.typingTimeouts.delete(timeoutKey);
            }, 3000);
            
            this.typingTimeouts.set(timeoutKey, timeout);
        } else {
            this.socket.emit('typing-stop', { channelName });
        }
    }

    /**
     * Get channel history (fallback to API call)
     */
    async getChannelHistory(channelName, limit = 50) {
        try {
            // For Socket.IO, we'll use the existing API endpoint
            const response = await fetch(`/api/chat/history?sessionId=${channelName}&limit=${limit}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.messages || [];
            }
            
            return [];
        } catch (error) {
            console.error('Error getting channel history:', error);
            return [];
        }
    }

    /**
     * Encrypt message for channel
     */
    async encryptMessage(messageData, channelName) {
        try {
            if (!window.messageEncryption) {
                return { ...messageData, encrypted: false };
            }

            const key = await window.messageEncryption.getConversationKey(channelName);
            const encryptedText = await window.messageEncryption.encrypt(messageData.text, key);
            
            return {
                ...messageData,
                text: encryptedText,
                encrypted: true
            };
        } catch (error) {
            console.error('Encryption failed:', error);
            // Fallback to unencrypted
            return {
                ...messageData,
                encrypted: false
            };
        }
    }

    /**
     * Decrypt message from channel
     */
    async decryptMessage(messageData, channelName) {
        try {
            if (!messageData.encrypted || !window.messageEncryption) {
                return messageData;
            }
            
            const key = await window.messageEncryption.getConversationKey(channelName);
            const decryptedText = await window.messageEncryption.decrypt(messageData.text, key);
            
            return {
                ...messageData,
                text: decryptedText,
                encrypted: false
            };
        } catch (error) {
            console.error('Decryption failed:', error);
            return {
                ...messageData,
                text: '[Encrypted message - decryption failed]',
                encrypted: false
            };
        }
    }

    /**
     * Generate private channel name for two users
     */
    getPrivateChannelName(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort();
        return `chat:private:${sortedIds[0]}_${sortedIds[1]}`;
    }

    /**
     * Get channel name from message data
     */
    getChannelNameFromMessage(messageData, type) {
        if (type === 'private') {
            return this.getPrivateChannelName(messageData.senderId, messageData.recipientId);
        } else if (type === 'session') {
            return `chat:session:${messageData.sessionId}`;
        }
        return 'general-chat';
    }

    /**
     * Get callback key for message routing
     */
    getCallbackKey(messageData, type) {
        if (type === 'private') {
            const otherUserId = messageData.senderId === this.currentUser.id ? 
                messageData.recipientId : messageData.senderId;
            return `private_${otherUserId}`;
        } else if (type === 'session') {
            return `session_${messageData.sessionId}`;
        }
        return 'general';
    }

    /**
     * Handle reconnection logic
     */
    handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
            
            setTimeout(() => {
                if (!this.isConnected) {
                    this.socket.connect();
                }
            }, delay);
        }
    }

    /**
     * Get online users in a channel
     */
    async getOnlineUsers(channelName) {
        try {
            const response = await fetch(`/api/socket/channels/${encodeURIComponent(channelName)}/users`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.users || [];
            }
            
            return [];
        } catch (error) {
            console.error('Error getting online users:', error);
            return [];
        }
    }

    /**
     * Update connection status in UI
     */
    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = isConnected ? 'status-connected' : 'status-disconnected';
        }
    }

    /**
     * Leave a channel
     */
    async leaveChannel(channelName) {
        // Remove callbacks
        this.messageCallbacks.forEach((callback, key) => {
            if (key.includes(channelName)) {
                this.messageCallbacks.delete(key);
            }
        });
        
        this.presenceCallbacks.forEach((callback, key) => {
            if (key.includes(channelName)) {
                this.presenceCallbacks.delete(key);
            }
        });
        
        console.log(`👋 Left channel: ${channelName}`);
    }

    /**
     * Close connection and cleanup
     */
    close() {
        if (this.socket) {
            this.socket.disconnect();
            this.messageCallbacks.clear();
            this.presenceCallbacks.clear();
            this.typingTimeouts.forEach(timeout => clearTimeout(timeout));
            this.typingTimeouts.clear();
            this.messageStatus.clear();
            this.onlineUsers.clear();
        }
    }
}

// Create global instance
window.socketChat = new SocketChat();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocketChat;
}
