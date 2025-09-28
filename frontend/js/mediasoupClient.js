/**
 * Mediasoup client for video/voice conferencing
 * Handles WebRTC connections through Mediasoup SFU
 */

class MediasoupClient {
    constructor() {
        this.device = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.producers = new Map();
        this.consumers = new Map();
        this.currentSessionId = null;
        this.localStream = null;
        this.isVideoEnabled = true;
        this.isAudioEnabled = true;
        this.isScreenSharing = false;
        this.onPeerJoined = null;
        this.onPeerLeft = null;
        this.onStreamReceived = null;
    }

    /**
     * Initialize Mediasoup device
     */
    async init() {
        try {
            // Import mediasoup-client
            const mediasoupClient = await import('https://unpkg.com/mediasoup-client@3/lib/index.js');
            this.device = new mediasoupClient.Device();
            
            console.log('✅ Mediasoup client initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Mediasoup client:', error);
            return false;
        }
    }

    /**
     * Join a session room
     */
    async joinSession(sessionId) {
        try {
            this.currentSessionId = sessionId;

            // Get router RTP capabilities
            const response = await fetch(`/api/mediasoup/sessions/${sessionId}/rtp-capabilities`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to get RTP capabilities');
            }
            
            const { rtpCapabilities } = await response.json();
            
            // Load device with router capabilities
            await this.device.load({ routerRtpCapabilities: rtpCapabilities });
            
            // Join the room
            await fetch(`/api/mediasoup/sessions/${sessionId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ socketId: 'web_client' })
            });

            // Create transports
            await this.createSendTransport(sessionId);
            await this.createRecvTransport(sessionId);
            
            console.log(`🏠 Joined session: ${sessionId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to join session:', error);
            return false;
        }
    }

    /**
     * Create send transport for publishing media
     */
    async createSendTransport(sessionId) {
        const response = await fetch(`/api/mediasoup/sessions/${sessionId}/create-transport`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to create send transport');
        }
        
        const transportOptions = await response.json();
        
        this.sendTransport = this.device.createSendTransport(transportOptions);
        
        // Handle transport events
        this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await fetch(`/api/mediasoup/transports/${transportOptions.id}/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ dtlsParameters })
                });
                callback();
            } catch (error) {
                errback(error);
            }
        });
        
        this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
                const response = await fetch(`/api/mediasoup/sessions/${sessionId}/produce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        transportId: transportOptions.id,
                        kind,
                        rtpParameters,
                        appData
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to produce');
                }
                
                const { producerId } = await response.json();
                callback({ id: producerId });
            } catch (error) {
                errback(error);
            }
        });
    }

    /**
     * Create receive transport for consuming media
     */
    async createRecvTransport(sessionId) {
        const response = await fetch(`/api/mediasoup/sessions/${sessionId}/create-transport`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to create receive transport');
        }
        
        const transportOptions = await response.json();
        
        this.recvTransport = this.device.createRecvTransport(transportOptions);
        
        // Handle transport events
        this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
                await fetch(`/api/mediasoup/transports/${transportOptions.id}/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ dtlsParameters })
                });
                callback();
            } catch (error) {
                errback(error);
            }
        });
    }

    /**
     * Start camera and microphone
     */
    async startLocalMedia(videoEnabled = true, audioEnabled = true) {
        try {
            const constraints = {
                video: videoEnabled ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false,
                audio: audioEnabled ? {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.isVideoEnabled = videoEnabled;
            this.isAudioEnabled = audioEnabled;

            // Display local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo && this.localStream) {
                localVideo.srcObject = this.localStream;
                localVideo.muted = true; // Prevent feedback
            }

            console.log('📹 Local media started');
            return this.localStream;
        } catch (error) {
            console.error('❌ Failed to start local media:', error);
            throw error;
        }
    }

    /**
     * Publish local media to the session
     */
    async publishMedia() {
        if (!this.localStream || !this.sendTransport) {
            throw new Error('Local stream or send transport not available');
        }

        const tracks = this.localStream.getTracks();
        
        for (const track of tracks) {
            if (track.kind === 'video' && this.isVideoEnabled) {
                const videoProducer = await this.sendTransport.produce({
                    track,
                    codecOptions: {
                        videoGoogleStartBitrate: 1000
                    }
                });
                this.producers.set('video', videoProducer);
                console.log('📹 Video producer created');
            }
            
            if (track.kind === 'audio' && this.isAudioEnabled) {
                const audioProducer = await this.sendTransport.produce({ track });
                this.producers.set('audio', audioProducer);
                console.log('🎤 Audio producer created');
            }
        }
    }

    /**
     * Consume media from other peers
     */
    async consumeMedia(producerId, kind) {
        try {
            const response = await fetch(`/api/mediasoup/sessions/${this.currentSessionId}/consume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    transportId: this.recvTransport.id,
                    producerId,
                    rtpCapabilities: this.device.rtpCapabilities
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to consume media');
            }
            
            const consumerOptions = await response.json();
            const consumer = await this.recvTransport.consume(consumerOptions);
            
            this.consumers.set(consumer.id, consumer);
            
            // Resume consumer
            await fetch(`/api/mediasoup/consumers/${consumer.id}/resume`, {
                method: 'POST',
                credentials: 'include'
            });
            
            // Handle the received stream
            if (this.onStreamReceived) {
                this.onStreamReceived(consumer.track, consumer.appData);
            }
            
            console.log(`📺 Consuming ${kind} from producer ${producerId}`);
            return consumer;
        } catch (error) {
            console.error('❌ Failed to consume media:', error);
            throw error;
        }
    }

    /**
     * Start screen sharing
     */
    async startScreenShare() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 15 }
                },
                audio: true
            });

            // Replace video track
            const videoTrack = screenStream.getVideoTracks()[0];
            if (videoTrack && this.producers.has('video')) {
                await this.producers.get('video').replaceTrack({ track: videoTrack });
                this.isScreenSharing = true;
                
                // Update local video display
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = screenStream;
                }
                
                // Handle screen share end
                videoTrack.onended = () => {
                    this.stopScreenShare();
                };
                
                console.log('🖥️ Screen sharing started');
            }
        } catch (error) {
            console.error('❌ Failed to start screen sharing:', error);
            throw error;
        }
    }

    /**
     * Stop screen sharing
     */
    async stopScreenShare() {
        if (!this.isScreenSharing) return;

        try {
            // Get camera stream again
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            });

            const videoTrack = cameraStream.getVideoTracks()[0];
            if (videoTrack && this.producers.has('video')) {
                await this.producers.get('video').replaceTrack({ track: videoTrack });
                this.isScreenSharing = false;
                
                // Update local video display
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = cameraStream;
                }
                
                console.log('📹 Switched back to camera');
            }
        } catch (error) {
            console.error('❌ Failed to stop screen sharing:', error);
        }
    }

    /**
     * Toggle video on/off
     */
    async toggleVideo() {
        if (this.producers.has('video')) {
            const producer = this.producers.get('video');
            if (this.isVideoEnabled) {
                producer.pause();
                this.isVideoEnabled = false;
                console.log('📹 Video paused');
            } else {
                producer.resume();
                this.isVideoEnabled = true;
                console.log('📹 Video resumed');
            }
        }
        return this.isVideoEnabled;
    }

    /**
     * Toggle audio on/off
     */
    async toggleAudio() {
        if (this.producers.has('audio')) {
            const producer = this.producers.get('audio');
            if (this.isAudioEnabled) {
                producer.pause();
                this.isAudioEnabled = false;
                console.log('🎤 Audio muted');
            } else {
                producer.resume();
                this.isAudioEnabled = true;
                console.log('🎤 Audio unmuted');
            }
        }
        return this.isAudioEnabled;
    }

    /**
     * Leave the session
     */
    async leaveSession() {
        try {
            // Close producers
            this.producers.forEach(producer => producer.close());
            this.producers.clear();
            
            // Close consumers
            this.consumers.forEach(consumer => consumer.close());
            this.consumers.clear();
            
            // Close transports
            if (this.sendTransport) {
                this.sendTransport.close();
                this.sendTransport = null;
            }
            
            if (this.recvTransport) {
                this.recvTransport.close();
                this.recvTransport = null;
            }
            
            // Stop local stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
            
            // Notify backend
            if (this.currentSessionId) {
                await fetch(`/api/mediasoup/sessions/${this.currentSessionId}/leave`, {
                    method: 'POST',
                    credentials: 'include'
                });
            }
            
            this.currentSessionId = null;
            this.isVideoEnabled = true;
            this.isAudioEnabled = true;
            this.isScreenSharing = false;
            
            console.log('👋 Left session');
        } catch (error) {
            console.error('❌ Error leaving session:', error);
        }
    }

    /**
     * Check if user can join call (15 minutes before session)
     */
    canJoinCall(sessionDate, sessionTime) {
        const sessionDateTime = new Date(`${sessionDate}T${sessionTime}`);
        const now = new Date();
        const timeDiff = sessionDateTime.getTime() - now.getTime();
        const minutesDiff = Math.floor(timeDiff / (1000 * 60));
        
        // Allow joining 15 minutes before session
        return minutesDiff <= 15;
    }

    /**
     * Get time until call is available
     */
    getTimeUntilCallAvailable(sessionDate, sessionTime) {
        const sessionDateTime = new Date(`${sessionDate}T${sessionTime}`);
        const callAvailableTime = new Date(sessionDateTime.getTime() - (15 * 60 * 1000)); // 15 minutes before
        const now = new Date();
        const timeDiff = callAvailableTime.getTime() - now.getTime();
        
        if (timeDiff <= 0) return null;
        
        const minutes = Math.floor(timeDiff / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        
        return { minutes, seconds };
    }
}

// Create global instance
window.mediasoupClient = new MediasoupClient();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MediasoupClient;
}
