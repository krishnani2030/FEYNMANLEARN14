/**
 * Socket.IO Service - Real-time messaging replacement for Ably
 * Provides all the functionality previously handled by Ably
 */

class SocketService {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socketId
        this.userSockets = new Map(); // socketId -> userId
        this.channels = new Map(); // channelName -> Set of socketIds
    }

    init(io) {
        this.io = io;
        console.log('✅ Socket.IO service initialized');
    }

    setupSocketHandlers() {
        this.io.on('connect', (socket) => {
            console.log(`🔌 Socket connected: ${socket.id}`);
            
            // Debug: Log all incoming events
            const originalEmit = socket.emit;
            socket.onAny((eventName, ...args) => {
                console.log(`🔥 BACKEND: Received event '${eventName}':`, args);
            });
            
            // Handle user authentication and room joining
            socket.on('authenticate', (userId) => {
                this.authenticateUser(socket, userId);
            });

            // Handle joining private chat rooms
            socket.on('join-private-chat', (data) => {
                this.joinPrivateChat(socket, data);
            });

            // Handle joining session chat rooms
            socket.on('join-session-chat', (sessionId) => {
                this.joinSessionChat(socket, sessionId);
            });

            // Handle sending private messages
            socket.on('send-private-message', (data) => {
                console.log('🔥 BACKEND: Received send-private-message event:', data);
                this.handlePrivateMessage(socket, data);
            });

            // Handle sending session messages
            socket.on('send-session-message', (data) => {
                this.handleSessionMessage(socket, data);
            });

            // Handle typing indicators
            socket.on('typing-start', (data) => {
                this.handleTypingStart(socket, data);
            });

            socket.on('typing-stop', (data) => {
                this.handleTypingStop(socket, data);
            });

            // Handle presence updates
            socket.on('update-presence', (data) => {
                this.handlePresenceUpdate(socket, data);
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }

    authenticateUser(socket, userId) {
        if (!userId) return;

        // Remove user from previous socket if exists
        const previousSocketId = this.connectedUsers.get(userId);
        if (previousSocketId && previousSocketId !== socket.id) {
            this.userSockets.delete(previousSocketId);
        }

        // Map user to current socket
        this.connectedUsers.set(userId, socket.id);
        this.userSockets.set(socket.id, userId);

        // Join user-specific notification room
        socket.join(`notifications:${userId}`);
        
        console.log(`👤 User ${userId} authenticated on socket ${socket.id}`);
        
        // Emit authentication success
        socket.emit('authenticated', { userId, socketId: socket.id });
    }

    joinPrivateChat(socket, { otherUserId }) {
        const userId = this.userSockets.get(socket.id);
        if (!userId) return;

        const channelName = this.getPrivateChannelName(userId, otherUserId);
        socket.join(channelName);

        // Add to channel tracking
        if (!this.channels.has(channelName)) {
            this.channels.set(channelName, new Set());
        }
        this.channels.get(channelName).add(socket.id);

        console.log(`💬 User ${userId} joined private chat: ${channelName}`);
        
        // Notify about online presence
        socket.to(channelName).emit('user-online', { userId });
        socket.emit('joined-private-chat', { channelName, otherUserId });
    }

    joinSessionChat(socket, sessionId) {
        const userId = this.userSockets.get(socket.id);
        if (!userId) return;

        const channelName = `chat:session:${sessionId}`;
        socket.join(channelName);

        // Add to channel tracking
        if (!this.channels.has(channelName)) {
            this.channels.set(channelName, new Set());
        }
        this.channels.get(channelName).add(socket.id);

        console.log(`🏫 User ${userId} joined session chat: ${channelName}`);
        
        // Notify others about user joining
        socket.to(channelName).emit('user-joined-session', { userId, sessionId });
        socket.emit('joined-session-chat', { channelName, sessionId });
    }

    async handlePrivateMessage(socket, messageData, callback) {
        console.log('🔥 BACKEND: handlePrivateMessage called');
        console.log('🔥 Socket ID:', socket.id);
        console.log('🔥 Message data:', messageData);
        
        const userId = this.userSockets.get(socket.id);
        console.log('🔥 User ID from socket:', userId);
        console.log('🔥 All user sockets:', Array.from(this.userSockets.entries()));
        
        if (!userId || !messageData.recipientId) {
            const errorMsg = `Missing required data. User ID: ${userId}, Recipient ID: ${messageData.recipientId}`;
            console.error('❌ BACKEND:', errorMsg);
            if (typeof callback === 'function') {
                return callback({ success: false, error: errorMsg });
            }
            return;
        }

        try {
            const channelName = this.getPrivateChannelName(userId, messageData.recipientId);
            
            // Add metadata
            const enrichedMessage = {
                ...messageData,
                senderId: userId,
                timestamp: new Date().toISOString(),
                messageId: messageData.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                channelName,
                status: 'delivered'
            };

            // Save to database
            try {
                const Message = require('../models/Message');
                const messageDoc = new Message({
                    sender: userId,
                    senderName: messageData.senderName,
                    senderUsername: messageData.senderUsername,
                    text: messageData.text,
                    recipient: messageData.recipientId,
                    recipientUsername: messageData.recipientUsername,
                    messageId: enrichedMessage.messageId,
                    status: 'delivered',
                    timestamp: new Date()
                });
                await messageDoc.save();
                console.log(`💾 Message saved to database: ${messageDoc._id}`);
            } catch (error) {
                console.error('❌ Error saving message to database:', error);
                // Don't fail the whole operation if DB save fails
            }

            // Emit to both sender and recipient directly
            const senderSocketId = this.connectedUsers.get(userId);
            const recipientSocketId = this.connectedUsers.get(messageData.recipientId);
            
            if (senderSocketId) {
                this.io.to(senderSocketId).emit('private-message', enrichedMessage);
            }
            if (recipientSocketId) {
                this.io.to(recipientSocketId).emit('private-message', enrichedMessage);
            }
            
            console.log(`💬 Private message sent from ${userId} to ${messageData.recipientId}`);
            console.log(`📡 Emitted to sender: ${senderSocketId}, recipient: ${recipientSocketId}`);
            
            // Send acknowledgment back to sender
            if (typeof callback === 'function') {
                callback({ 
                    success: true, 
                    messageId: enrichedMessage.messageId,
                    timestamp: enrichedMessage.timestamp
                });
            }
        } catch (error) {
            console.error('❌ Error in handlePrivateMessage:', error);
            if (typeof callback === 'function') {
                callback({ 
                    success: false, 
                    error: error.message || 'Failed to send message'
                });
            }
        }
    }

    handleSessionMessage(socket, messageData) {
        const userId = this.userSockets.get(socket.id);
        if (!userId || !messageData.sessionId) return;

        const channelName = `chat:session:${messageData.sessionId}`;
        
        // Add metadata
        const enrichedMessage = {
            ...messageData,
            senderId: userId,
            timestamp: new Date().toISOString(),
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            channelName
        };

        // Emit to all users in the session chat
        this.io.to(channelName).emit('session-message', enrichedMessage);
        
        console.log(`🏫 Session message sent in ${messageData.sessionId} by ${userId}`);
    }

    handleTypingStart(socket, { channelName }) {
        const userId = this.userSockets.get(socket.id);
        if (!userId) return;

        socket.to(channelName).emit('user-typing', { userId, isTyping: true });
    }

    handleTypingStop(socket, { channelName }) {
        const userId = this.userSockets.get(socket.id);
        if (!userId) return;

        socket.to(channelName).emit('user-typing', { userId, isTyping: false });
    }

    handlePresenceUpdate(socket, { channelName, data }) {
        const userId = this.userSockets.get(socket.id);
        if (!userId) return;

        socket.to(channelName).emit('presence-update', { userId, data });
    }

    handleDisconnect(socket) {
        const userId = this.userSockets.get(socket.id);
        
        if (userId) {
            console.log(`👋 User ${userId} disconnected from socket ${socket.id}`);
            
            // Remove from tracking
            this.connectedUsers.delete(userId);
            this.userSockets.delete(socket.id);
            
            // Remove from all channels
            this.channels.forEach((socketIds, channelName) => {
                if (socketIds.has(socket.id)) {
                    socketIds.delete(socket.id);
                    // Notify others about user going offline
                    socket.to(channelName).emit('user-offline', { userId });
                    
                    // Clean up empty channels
                    if (socketIds.size === 0) {
                        this.channels.delete(channelName);
                    }
                }
            });
        }
    }

    // Public methods for external services to use

    /**
     * Send a private message from server
     */
    async sendPrivateMessage(senderId, recipientId, messageData) {
        const channelName = this.getPrivateChannelName(senderId, recipientId);
        
        const enrichedMessage = {
            ...messageData,
            senderId,
            recipientId,
            timestamp: new Date().toISOString(),
            messageId: messageData.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            channelName
        };

        this.io.to(channelName).emit('private-message', enrichedMessage);
        console.log(`📤 Server sent private message from ${senderId} to ${recipientId}`);
        
        return enrichedMessage;
    }

    /**
     * Send a session message from server
     */
    async sendSessionMessage(sessionId, messageData) {
        const channelName = `chat:session:${sessionId}`;
        
        const enrichedMessage = {
            ...messageData,
            sessionId,
            timestamp: new Date().toISOString(),
            messageId: messageData.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            channelName
        };

        this.io.to(channelName).emit('session-message', enrichedMessage);
        console.log(`📤 Server sent session message to ${sessionId}`);
        
        return enrichedMessage;
    }

    /**
     * Send notification to a user
     */
    async sendNotification(userId, notificationData) {
        const channelName = `notifications:${userId}`;
        
        const enrichedNotification = {
            ...notificationData,
            timestamp: new Date().toISOString(),
            notificationId: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        this.io.to(channelName).emit('notification', enrichedNotification);
        console.log(`🔔 Notification sent to user ${userId}`);
        
        return enrichedNotification;
    }

    /**
     * Send Feynman Bot message
     */
    async sendFeynmanBotMessage(userId, message) {
        const botMessage = {
            senderId: 'feynman-bot',
            senderName: 'Feynman Bot',
            senderUsername: 'feynman_bot',
            text: message,
            recipientId: userId,
            timestamp: new Date().toISOString(),
            isBot: true,
            messageId: `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Send to private chat channel
        await this.sendPrivateMessage('feynman-bot', userId, botMessage);

        // Also send as notification
        await this.sendNotification(userId, {
            type: 'bot_message',
            message: message,
            timestamp: botMessage.timestamp
        });

        return botMessage;
    }

    /**
     * Broadcast enrollment update
     */
    async broadcastEnrollmentUpdate(sessionId, enrollmentData) {
        const channelName = `session:${sessionId}:updates`;
        
        this.io.to(channelName).emit('enrollment-update', {
            ...enrollmentData,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📊 Enrollment update broadcasted for session ${sessionId}`);
    }

    /**
     * Broadcast session status update
     */
    async broadcastSessionStatusUpdate(sessionId, statusData) {
        const channelName = `session:${sessionId}:updates`;
        
        this.io.to(channelName).emit('status-update', {
            ...statusData,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📊 Status update broadcasted for session ${sessionId}`);
    }

    /**
     * Get online users in a channel
     */
    async getOnlineUsers(channelName) {
        const socketIds = this.channels.get(channelName) || new Set();
        const users = [];
        
        socketIds.forEach(socketId => {
            const userId = this.userSockets.get(socketId);
            if (userId) {
                users.push({ userId, socketId });
            }
        });
        
        return users;
    }

    /**
     * Generate private channel name for two users
     */
    getPrivateChannelName(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort();
        return `chat:private:${sortedIds[0]}_${sortedIds[1]}`;
    }

    /**
     * Check if user is online
     */
    isUserOnline(userId) {
        return this.connectedUsers.has(userId);
    }

    /**
     * Get user's socket ID
     */
    getUserSocket(userId) {
        return this.connectedUsers.get(userId);
    }

    /**
     * Close service and cleanup
     */
    close() {
        if (this.io) {
            this.io.close();
            this.connectedUsers.clear();
            this.userSockets.clear();
            this.channels.clear();
        }
    }
}

module.exports = new SocketService();
