const Ably = require('ably');

class AblyService {
    constructor() {
        this.client = null;
        this.channels = new Map();
    }

    init() {
        if (!process.env.ABLY_API_KEY) {
            console.warn('⚠️ ABLY_API_KEY not found in environment variables');
            return;
        }

        this.client = new Ably.Realtime({
            key: process.env.ABLY_API_KEY,
            clientId: 'feynman-learn-server'
        });

        this.client.connection.on('connected', () => {
            console.log('✅ Connected to Ably');
        });

        this.client.connection.on('failed', (error) => {
            console.error('❌ Failed to connect to Ably:', error);
        });

        this.client.connection.on('disconnected', () => {
            console.log('🔌 Disconnected from Ably');
        });
    }

    getChannel(channelName) {
        if (!this.client) {
            throw new Error('Ably client not initialized');
        }

        if (!this.channels.has(channelName)) {
            const channel = this.client.channels.get(channelName);
            this.channels.set(channelName, channel);
        }

        return this.channels.get(channelName);
    }

    // Generate token for client authentication
    async generateToken(userId, capabilities = {}) {
        if (!this.client) {
            throw new Error('Ably client not initialized');
        }

        const tokenRequest = await this.client.auth.createTokenRequest({
            clientId: userId,
            capability: capabilities
        });

        return tokenRequest;
    }

    // Send message to a channel
    async publishMessage(channelName, eventName, data) {
        try {
            const channel = this.getChannel(channelName);
            await channel.publish(eventName, data);
            console.log(`📤 Published to ${channelName}:${eventName}`);
        } catch (error) {
            console.error('Error publishing message:', error);
            throw error;
        }
    }

    // Send private message
    async sendPrivateMessage(senderId, recipientId, messageData) {
        const channelName = this.getPrivateChannelName(senderId, recipientId);
        await this.publishMessage(channelName, 'message', messageData);
    }

    // Send session message
    async sendSessionMessage(sessionId, messageData) {
        const channelName = `chat:session:${sessionId}`;
        await this.publishMessage(channelName, 'message', messageData);
    }

    // Send notification
    async sendNotification(userId, notificationData) {
        const channelName = `notifications:${userId}`;
        await this.publishMessage(channelName, 'notification', notificationData);
    }

    // Send Feynman Bot message
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
        const privateChannelName = this.getPrivateChannelName('feynman-bot', userId);
        await this.publishMessage(privateChannelName, 'message', botMessage);

        // Also send as notification
        await this.sendNotification(userId, {
            type: 'bot_message',
            message: message,
            timestamp: botMessage.timestamp
        });

        return botMessage;
    }

    // Broadcast enrollment update
    async broadcastEnrollmentUpdate(sessionId, enrollmentData) {
        const channelName = `session:${sessionId}:updates`;
        await this.publishMessage(channelName, 'enrollment_update', enrollmentData);
    }

    // Broadcast session status update
    async broadcastSessionStatusUpdate(sessionId, statusData) {
        const channelName = `session:${sessionId}:updates`;
        await this.publishMessage(channelName, 'status_update', statusData);
    }

    // Broadcast typing indicator
    async broadcastTyping(channelName, userId, isTyping) {
        const channel = this.getChannel(channelName);
        
        if (isTyping) {
            await channel.presence.enter({ typing: true, userId });
        } else {
            await channel.presence.leave();
        }
    }

    // Helper method to generate private channel name
    getPrivateChannelName(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort();
        return `chat:private:${sortedIds[0]}_${sortedIds[1]}`;
    }

    // Get channel history
    async getChannelHistory(channelName, limit = 50) {
        try {
            const channel = this.getChannel(channelName);
            const history = await channel.history({ limit });
            return history.items.map(message => ({
                ...message.data,
                timestamp: message.timestamp,
                messageId: message.id
            }));
        } catch (error) {
            console.error('Error getting channel history:', error);
            return [];
        }
    }

    // Close connection
    close() {
        if (this.client) {
            this.client.close();
            this.channels.clear();
        }
    }
}

module.exports = new AblyService();
