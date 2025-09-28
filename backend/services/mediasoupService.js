const mediasoup = require('mediasoup');
const config = require('../config/mediasoup.config');

class MediasoupService {
    constructor() {
        this.workers = [];
        this.routers = new Map();
        this.transports = new Map();
        this.producers = new Map();
        this.consumers = new Map();
        this.rooms = new Map();
    }

    async init() {
        console.log('🎥 Initializing Mediasoup workers...');
        
        // Create workers based on CPU cores
        const numWorkers = Object.keys(require('os').cpus()).length;
        
        for (let i = 0; i < numWorkers; i++) {
            const worker = await mediasoup.createWorker({
                logLevel: config.mediasoup.worker.logLevel,
                logTags: config.mediasoup.worker.logTags,
                rtcMinPort: config.mediasoup.worker.rtcMinPort,
                rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
            });

            worker.on('died', () => {
                console.error('❌ Mediasoup worker died, exiting in 2 seconds...');
                setTimeout(() => process.exit(1), 2000);
            });

            this.workers.push(worker);
        }

        console.log(`✅ Created ${numWorkers} Mediasoup workers`);
    }

    getWorker() {
        // Round-robin worker selection
        const worker = this.workers[Math.floor(Math.random() * this.workers.length)];
        return worker;
    }

    async createRoom(sessionId) {
        if (this.rooms.has(sessionId)) {
            return this.rooms.get(sessionId);
        }

        const worker = this.getWorker();
        const router = await worker.createRouter({
            mediaCodecs: config.mediasoup.router.mediaCodecs
        });

        const room = {
            id: sessionId,
            router,
            peers: new Map(),
            createdAt: new Date()
        };

        this.rooms.set(sessionId, room);
        this.routers.set(sessionId, router);

        console.log(`🏠 Created room: ${sessionId}`);
        return room;
    }

    async joinRoom(sessionId, peerId, socketId) {
        let room = this.rooms.get(sessionId);
        if (!room) {
            room = await this.createRoom(sessionId);
        }

        const peer = {
            id: peerId,
            socketId,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map(),
            joinedAt: new Date()
        };

        room.peers.set(peerId, peer);
        console.log(`👤 Peer ${peerId} joined room ${sessionId}`);

        return { room, peer };
    }

    async createWebRtcTransport(sessionId, peerId) {
        const room = this.rooms.get(sessionId);
        if (!room) {
            throw new Error('Room not found');
        }

        const transport = await room.router.createWebRtcTransport({
            listenIps: config.mediasoup.webRtcTransport.listenIps,
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: config.mediasoup.webRtcTransport.initialAvailableOutgoingBitrate,
        });

        const peer = room.peers.get(peerId);
        if (peer) {
            peer.transports.set(transport.id, transport);
        }

        this.transports.set(transport.id, transport);

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        };
    }

    async connectTransport(transportId, dtlsParameters) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }

        await transport.connect({ dtlsParameters });
    }

    async produce(sessionId, peerId, transportId, kind, rtpParameters, appData = {}) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error('Transport not found');
        }

        const producer = await transport.produce({
            kind,
            rtpParameters,
            appData: { ...appData, peerId, sessionId }
        });

        const room = this.rooms.get(sessionId);
        const peer = room?.peers.get(peerId);
        
        if (peer) {
            peer.producers.set(producer.id, producer);
        }

        this.producers.set(producer.id, producer);

        // Notify other peers about new producer
        this.notifyPeersAboutNewProducer(sessionId, peerId, producer);

        return { id: producer.id };
    }

    async consume(sessionId, peerId, transportId, producerId, rtpCapabilities) {
        const room = this.rooms.get(sessionId);
        const transport = this.transports.get(transportId);
        const producer = this.producers.get(producerId);

        if (!room || !transport || !producer) {
            throw new Error('Room, transport, or producer not found');
        }

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error('Cannot consume');
        }

        const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // Start paused
        });

        const peer = room.peers.get(peerId);
        if (peer) {
            peer.consumers.set(consumer.id, consumer);
        }

        this.consumers.set(consumer.id, consumer);

        return {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused
        };
    }

    async resumeConsumer(consumerId) {
        const consumer = this.consumers.get(consumerId);
        if (!consumer) {
            throw new Error('Consumer not found');
        }

        await consumer.resume();
    }

    async pauseConsumer(consumerId) {
        const consumer = this.consumers.get(consumerId);
        if (!consumer) {
            throw new Error('Consumer not found');
        }

        await consumer.pause();
    }

    notifyPeersAboutNewProducer(sessionId, producerPeerId, producer) {
        const room = this.rooms.get(sessionId);
        if (!room) return;

        // This will be handled by Socket.IO in the routes
        // We'll emit events to notify other peers
        return {
            sessionId,
            producerPeerId,
            producerId: producer.id,
            kind: producer.kind
        };
    }

    leaveRoom(sessionId, peerId) {
        const room = this.rooms.get(sessionId);
        if (!room) return;

        const peer = room.peers.get(peerId);
        if (!peer) return;

        // Close all transports, producers, and consumers for this peer
        peer.transports.forEach(transport => {
            this.transports.delete(transport.id);
            transport.close();
        });

        peer.producers.forEach(producer => {
            this.producers.delete(producer.id);
            producer.close();
        });

        peer.consumers.forEach(consumer => {
            this.consumers.delete(consumer.id);
            consumer.close();
        });

        room.peers.delete(peerId);

        // If room is empty, clean it up
        if (room.peers.size === 0) {
            room.router.close();
            this.rooms.delete(sessionId);
            this.routers.delete(sessionId);
            console.log(`🗑️ Cleaned up empty room: ${sessionId}`);
        }

        console.log(`👋 Peer ${peerId} left room ${sessionId}`);
    }

    getRoomInfo(sessionId) {
        const room = this.rooms.get(sessionId);
        if (!room) return null;

        return {
            id: sessionId,
            peerCount: room.peers.size,
            peers: Array.from(room.peers.keys()),
            createdAt: room.createdAt
        };
    }

    getRouterRtpCapabilities(sessionId) {
        const router = this.routers.get(sessionId);
        if (!router) {
            throw new Error('Router not found');
        }

        return router.rtpCapabilities;
    }
}

module.exports = new MediasoupService();
