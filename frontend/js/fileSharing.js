/**
 * File sharing functionality for chat
 * Supports PDF, images, and voice notes
 */

class FileSharing {
    constructor() {
        this.allowedTypes = {
            image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            pdf: ['application/pdf'],
            audio: ['audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm']
        };
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
    }

    /**
     * Initialize file sharing UI
     */
    init() {
        this.createFileUploadButton();
        this.setupEventListeners();
    }

    /**
     * Create file upload button in chat input
     */
    createFileUploadButton() {
        const chatInputContainer = document.getElementById('chat-input-container');
        if (!chatInputContainer) return;

        // Check if button already exists
        if (document.getElementById('file-upload-btn')) return;

        const fileButton = document.createElement('button');
        fileButton.id = 'file-upload-btn';
        fileButton.type = 'button';
        fileButton.className = 'btn btn--secondary btn--sm';
        fileButton.innerHTML = '📎';
        fileButton.title = 'Attach file (PDF, Image, Voice Note)';

        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'file-input';
        fileInput.style.display = 'none';
        fileInput.accept = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.wav,.mp3,.ogg,.webm';

        // Insert before send button
        const sendButton = document.getElementById('send-chat-button');
        if (sendButton) {
            chatInputContainer.insertBefore(fileButton, sendButton);
            chatInputContainer.appendChild(fileInput);
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const fileButton = document.getElementById('file-upload-btn');
        const fileInput = document.getElementById('file-input');

        if (fileButton && fileInput) {
            fileButton.addEventListener('click', () => {
                fileInput.click();
            });

            fileInput.addEventListener('change', (e) => {
                this.handleFileSelection(e.target.files[0]);
            });
        }

        // Drag and drop support
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.addEventListener('dragover', (e) => {
                e.preventDefault();
                chatMessages.classList.add('drag-over');
            });

            chatMessages.addEventListener('dragleave', (e) => {
                e.preventDefault();
                chatMessages.classList.remove('drag-over');
            });

            chatMessages.addEventListener('drop', (e) => {
                e.preventDefault();
                chatMessages.classList.remove('drag-over');
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileSelection(files[0]);
                }
            });
        }
    }

    /**
     * Handle file selection
     */
    async handleFileSelection(file) {
        if (!file) return;

        // Validate file
        const validation = this.validateFile(file);
        if (!validation.valid) {
            showAlert(validation.error, 'error');
            return;
        }

        try {
            showAlert('Uploading file...', 'info');
            
            // Upload file
            const fileUrl = await this.uploadFile(file);
            
            // Send file message
            await this.sendFileMessage(file, fileUrl);
            
            showAlert('File shared successfully!', 'success');
            
        } catch (error) {
            console.error('File upload error:', error);
            showAlert('Failed to upload file: ' + error.message, 'error');
        }
    }

    /**
     * Validate file type and size
     */
    validateFile(file) {
        // Check file size
        if (file.size > this.maxFileSize) {
            return {
                valid: false,
                error: 'File size must be less than 10MB'
            };
        }

        // Check file type
        const isValidType = Object.values(this.allowedTypes)
            .flat()
            .includes(file.type);

        if (!isValidType) {
            return {
                valid: false,
                error: 'File type not supported. Please use PDF, images, or audio files.'
            };
        }

        return { valid: true };
    }

    /**
     * Upload file to server
     */
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/chat/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();
        return result.fileUrl;
    }

    /**
     * Send file message
     */
    async sendFileMessage(file, fileUrl) {
        if (!currentChatRecipient || !currentUser) {
            throw new Error('No chat recipient selected');
        }

        const fileType = this.getFileType(file.type);
        const message = {
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderUsername: currentUser.username,
            recipientId: currentChatRecipient._id,
            recipientUsername: currentChatRecipient.username,
            messageType: 'file',
            fileType: fileType,
            fileName: file.name,
            fileUrl: fileUrl,
            fileSize: file.size,
            text: `📎 ${file.name}`,
            timestamp: new Date().toISOString(),
            messageId: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // Send via Ably if available
        if (window.ablyChat && isAblyInitialized) {
            await window.ablyChat.sendPrivateMessage(
                currentChatRecipient._id,
                message.text,
                'file'
            );
        } else {
            // Fallback to Socket.IO
            if (window.appSocket && window.appSocket.connected) {
                window.appSocket.emit('chat-message', message);
            }
        }

        // Display file message immediately
        this.displayFileMessage(message);
    }

    /**
     * Get file type category
     */
    getFileType(mimeType) {
        if (this.allowedTypes.image.includes(mimeType)) return 'image';
        if (this.allowedTypes.pdf.includes(mimeType)) return 'pdf';
        if (this.allowedTypes.audio.includes(mimeType)) return 'audio';
        return 'file';
    }

    /**
     * Display file message in chat
     */
    displayFileMessage(message) {
        const chatMessagesContainer = document.getElementById('chat-messages');
        if (!chatMessagesContainer) return;

        const isOwn = message.senderId === currentUser?.id;
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');
        messageElement.classList.add(isOwn ? 'chat-message--own' : 'chat-message--other');

        let fileContent = '';
        switch (message.fileType) {
            case 'image':
                fileContent = `
                    <div class="file-message">
                        <img src="${message.fileUrl}" alt="${message.fileName}" class="shared-image" onclick="openImageModal('${message.fileUrl}')">
                        <p class="file-name">${message.fileName}</p>
                    </div>
                `;
                break;
            case 'pdf':
                fileContent = `
                    <div class="file-message">
                        <div class="file-icon">📄</div>
                        <div class="file-info">
                            <p class="file-name">${message.fileName}</p>
                            <p class="file-size">${this.formatFileSize(message.fileSize)}</p>
                        </div>
                        <a href="${message.fileUrl}" target="_blank" class="btn btn--sm btn--primary">Open</a>
                    </div>
                `;
                break;
            case 'audio':
                fileContent = `
                    <div class="file-message">
                        <div class="file-icon">🎵</div>
                        <div class="file-info">
                            <p class="file-name">${message.fileName}</p>
                            <audio controls>
                                <source src="${message.fileUrl}" type="${message.fileType}">
                                Your browser does not support the audio element.
                            </audio>
                        </div>
                    </div>
                `;
                break;
            default:
                fileContent = `
                    <div class="file-message">
                        <div class="file-icon">📎</div>
                        <div class="file-info">
                            <p class="file-name">${message.fileName}</p>
                            <p class="file-size">${this.formatFileSize(message.fileSize)}</p>
                        </div>
                        <a href="${message.fileUrl}" target="_blank" class="btn btn--sm btn--primary">Download</a>
                    </div>
                `;
        }

        messageElement.innerHTML = fileContent;
        chatMessagesContainer.appendChild(messageElement);
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Open image in modal
     */
    openImageModal(imageUrl) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="image-modal-content">
                <span class="image-modal-close">&times;</span>
                <img src="${imageUrl}" alt="Shared image">
            </div>
        `;

        // Add to body
        document.body.appendChild(modal);

        // Close modal on click
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('image-modal-close')) {
                document.body.removeChild(modal);
            }
        });
    }
}

// Create global instance
window.fileSharing = new FileSharing();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileSharing;
}
