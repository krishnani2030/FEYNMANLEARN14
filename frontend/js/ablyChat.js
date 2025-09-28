/**
 * Ably-powered chat system with encryption
 * Replaces Socket.IO with Ably for real-time messaging
 */

class AblyChat {
    constructor() {
        this.client = null;
        this.channels = new Map();
        this.currentUser = null;
        this.messageCallbacks = new Map();
        this.presenceCallbacks = new Map();
        this.typingTimeouts = new Map();
        this.messageStatus = new Map(); // Track message delivery status
        this.onlineUsers = new Set();
    }

    /**
     * Initialize Ably client with authentication
     */
    async init(currentUser) {
        this.currentUser = currentUser;
        
        try {
            // Get Ably token from backend
            const response = await fetch('/api/ably/token', {
                method: 'POST',
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to get Ably token');
            }
            
            const { tokenRequest, clientId } = await response.json();
            
            // Initialize Ably client
            this.client = new Ably.Realtime({
                authCallback: (tokenParams, callback) => {
                    callback(null, tokenRequest);
                },
                clientId: clientId
            });

            // Set up connection event handlers
            this.setupConnectionHandlers();
            
            console.log('✅ Ably chat initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Ably chat:', error);
            return false;
        }
    }

    /**
     * Set up connection event handlers
     */
    setupConnectionHandlers() {
        this.client.connection.on('connected', () => {
            console.log('🔗 Connected to Ably');
            this.updateConnectionStatus(true);
        });

        this.client.connection.on('disconnected', () => {
            console.log('🔌 Disconnected from Ably');
            this.updateConnectionStatus(false);
        });

        this.client.connection.on('failed', (error) => {
            console.error('❌ Ably connection failed:', error);
            this.updateConnectionStatus(false);
        });
    }

    /**
     * Get or create a channel
     */
    getChannel(channelName) {
        if (!this.channels.has(channelName)) {
            const channel = this.client.channels.get(channelName);
            this.channels.set(channelName, channel);
        }
        return this.channels.get(channelName);
    }

    /**
     * Subscribe to private messages with a user
     */
    async subscribeToPrivateChat(otherUserId, onMessage, onPresence) {
        const channelName = this.getPrivateChannelName(this.currentUser.id, otherUserId);
        const channel = this.getChannel(channelName);

        // Subscribe to messages
        await channel.subscribe('message', async (message) => {
            const decryptedMessage = await this.decryptMessage(message.data, channelName);
            if (decryptedMessage && onMessage) {
                onMessage(decryptedMessage);
            }
        });

        // Subscribe to presence (typing indicators, online status)
        if (onPresence) {
            await channel.presence.subscribe('enter', (member) => {
                this.onlineUsers.add(member.clientId);
                onPresence({ type: 'online', userId: member.clientId, data: member.data });
            });

            await channel.presence.subscribe('leave', (member) => {
                this.onlineUsers.delete(member.clientId);
                onPresence({ type: 'offline', userId: member.clientId });
            });

            await channel.presence.subscribe('update', (member) => {
                onPresence({ type: 'update', userId: member.clientId, data: member.data });
            });
        }

        // Enter presence to show we're online
        await channel.presence.enter({ status: 'online', timestamp: Date.now() });

        console.log(`📱 Subscribed to private chat: ${channelName}`);
        return channel;
    }

    /**
     * Subscribe to session chat
     */
    async subscribeToSessionChat(sessionId, onMessage, onPresence) {
        const channelName = `chat:session:${sessionId}`;
        const channel = this.getChannel(channelName);

        // Subscribe to messages
        await channel.subscribe('message', async (message) => {
            const decryptedMessage = await this.decryptMessage(message.data, channelName);
            if (decryptedMessage && onMessage) {
                onMessage(decryptedMessage);
            }
        });

        // Subscribe to presence
        if (onPresence) {
            await channel.presence.subscribe(['enter', 'leave', 'update'], (member) => {
                onPresence({
                    type: member.action,
                    userId: member.clientId,
                    data: member.data
                });
            });
        }

        // Enter presence
        await channel.presence.enter({ 
            status: 'online', 
            sessionId: sessionId,
            timestamp: Date.now() 
        });

        console.log(`🏫 Subscribed to session chat: ${channelName}`);
        return channel;
    }

    /**
     * Subscribe to notifications
     */
    async subscribeToNotifications(onNotification) {
        const channelName = `notifications:${this.currentUser.id}`;
        const channel = this.getChannel(channelName);

        await channel.subscribe('notification', (message) => {
            if (onNotification) {
                onNotification(message.data);
            }
        });

        console.log(`🔔 Subscribed to notifications: ${channelName}`);
        return channel;
    }

    /**
     * Subscribe to session updates (enrollment, status changes)
     */
    async subscribeToSessionUpdates(sessionId, onUpdate) {
        const channelName = `session:${sessionId}:updates`;
        const channel = this.getChannel(channelName);

        await channel.subscribe(['enrollment_update', 'status_update'], (message) => {
            if (onUpdate) {
                onUpdate({
                    type: message.name,
                    data: message.data
                });
            }
        });

        console.log(`📊 Subscribed to session updates: ${channelName}`);
        return channel;
    }

    /**
     * Send private message
     */
    async sendPrivateMessage(recipientId, text, messageType = 'text') {
        const channelName = this.getPrivateChannelName(this.currentUser.id, recipientId);
        const channel = this.getChannel(channelName);

        const messageData = {
            senderId: this.currentUser.id,
            senderName: this.currentUser.name,
            senderUsername: this.currentUser.username,
            recipientId: recipientId,
            text: text,
            messageType: messageType,
            timestamp: new Date().toISOString(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            encrypted: true
        };

        // Encrypt the message
        const encryptedMessage = await this.encryptMessage(messageData, channelName);
        
        // Publish to Ably
        await channel.publish('message', encryptedMessage);

        // Track message status
        this.messageStatus.set(messageData.messageId, 'sent');

        console.log(`💬 Sent private message to ${recipientId}`);
        return messageData;
    }

    /**
     * Send session message
     */
    async sendSessionMessage(sessionId, text, messageType = 'text') {
        const channelName = `chat:session:${sessionId}`;
        const channel = this.getChannel(channelName);

        const messageData = {
            senderId: this.currentUser.id,
            senderName: this.currentUser.name,
            senderUsername: this.currentUser.username,
            sessionId: sessionId,
            text: text,
            messageType: messageType,
            timestamp: new Date().toISOString(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            encrypted: true
        };

        // Encrypt the message
        const encryptedMessage = await this.encryptMessage(messageData, channelName);
        
        // Publish to Ably
        await channel.publish('message', encryptedMessage);

        console.log(`🏫 Sent session message to ${sessionId}`);
        return messageData;
    }

    /**
     * Send typing indicator
     */
    async sendTypingIndicator(channelName, isTyping) {
        const channel = this.getChannel(channelName);
        
        if (isTyping) {
            await channel.presence.update({ 
                typing: true, 
                timestamp: Date.now() 
            });
            
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
            await channel.presence.update({ 
                typing: false, 
                timestamp: Date.now() 
            });
        }
    }

    /**
     * Get channel history
     */
    async getChannelHistory(channelName, limit = 50) {
        try {
            const channel = this.getChannel(channelName);
            const history = await channel.history({ limit });
            
            const messages = [];
            for (const message of history.items) {
                if (message.name === 'message') {
                    const decryptedMessage = await this.decryptMessage(message.data, channelName);
                    if (decryptedMessage) {
                        messages.push({
                            ...decryptedMessage,
                            timestamp: message.timestamp
                        });
                    }
                }
            }
            
            return messages.reverse(); // Return in chronological order
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
            if (!messageData.encrypted) {
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
     * Leave a channel
     */
    async leaveChannel(channelName) {
        const channel = this.channels.get(channelName);
        if (channel) {
            await channel.presence.leave();
            await channel.unsubscribe();
            this.channels.delete(channelName);
            console.log(`👋 Left channel: ${channelName}`);
        }
    }

    /**
     * Get online users in a channel
     */
    async getOnlineUsers(channelName) {
        const channel = this.getChannel(channelName);
        const presence = await channel.presence.get();
        return presence.map(member => ({
            userId: member.clientId,
            data: member.data
        }));
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
     * Close connection and cleanup
     */
    close() {
        if (this.client) {
            this.client.close();
            this.channels.clear();
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
window.ablyChat = new AblyChat();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AblyChat;
}
