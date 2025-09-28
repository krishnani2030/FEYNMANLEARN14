/**
 * Client-side AES-256-CBC encryption for messages
 * Uses Web Crypto API for secure encryption/decryption
 */

class MessageEncryption {
    constructor() {
        this.algorithm = 'AES-CBC';
        this.keyLength = 256;
        this.ivLength = 16; // 128 bits
    }

    /**
     * Generate a new encryption key
     */
    async generateKey() {
        return await window.crypto.subtle.generateKey(
            {
                name: this.algorithm,
                length: this.keyLength,
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Derive key from password using PBKDF2
     */
    async deriveKeyFromPassword(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        return await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: this.algorithm, length: this.keyLength },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Generate random salt
     */
    generateSalt() {
        return window.crypto.getRandomValues(new Uint8Array(16));
    }

    /**
     * Generate random IV
     */
    generateIV() {
        return window.crypto.getRandomValues(new Uint8Array(this.ivLength));
    }

    /**
     * Encrypt a message
     */
    async encrypt(message, key) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const iv = this.generateIV();

        const encrypted = await window.crypto.subtle.encrypt(
            {
                name: this.algorithm,
                iv: iv,
            },
            key,
            data
        );

        // Combine IV and encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        // Return base64 encoded string
        return this.arrayBufferToBase64(combined);
    }

    /**
     * Decrypt a message
     */
    async decrypt(encryptedMessage, key) {
        try {
            const combined = this.base64ToArrayBuffer(encryptedMessage);
            const iv = combined.slice(0, this.ivLength);
            const data = combined.slice(this.ivLength);

            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: this.algorithm,
                    iv: iv,
                },
                key,
                data
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            return '[Encrypted message - decryption failed]';
        }
    }

    /**
     * Export key to base64 string for storage
     */
    async exportKey(key) {
        const exported = await window.crypto.subtle.exportKey('raw', key);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import key from base64 string
     */
    async importKey(keyString) {
        const keyData = this.base64ToArrayBuffer(keyString);
        return await window.crypto.subtle.importKey(
            'raw',
            keyData,
            { name: this.algorithm },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Convert ArrayBuffer to base64 string
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Convert base64 string to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Generate a conversation key for two users
     */
    async generateConversationKey(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort();
        const conversationId = `${sortedIds[0]}_${sortedIds[1]}`;
        
        // Use a deterministic approach based on user IDs
        const encoder = new TextEncoder();
        const data = encoder.encode(conversationId + 'feynman_learn_secret');
        const hash = await window.crypto.subtle.digest('SHA-256', data);
        
        return await window.crypto.subtle.importKey(
            'raw',
            hash,
            { name: this.algorithm },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Get or create encryption key for a conversation
     */
    async getConversationKey(conversationId) {
        // Try to get from localStorage first
        const storedKey = localStorage.getItem(`chat_key_${conversationId}`);
        if (storedKey) {
            try {
                return await this.importKey(storedKey);
            } catch (error) {
                console.warn('Failed to import stored key, generating new one');
            }
        }

        // Generate new key
        const key = await this.generateKey();
        const exportedKey = await this.exportKey(key);
        localStorage.setItem(`chat_key_${conversationId}`, exportedKey);
        
        return key;
    }

    /**
     * Clear all stored encryption keys (for logout)
     */
    clearStoredKeys() {
        const keys = Object.keys(localStorage).filter(key => key.startsWith('chat_key_'));
        keys.forEach(key => localStorage.removeItem(key));
    }
}

// Create global instance
window.messageEncryption = new MessageEncryption();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageEncryption;
}
