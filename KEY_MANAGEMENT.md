# 🔐 Encryption Key Management

This document explains how to properly manage encryption keys for Feynman Learn's chat message encryption system.

## Overview

Feynman Learn uses AES-256-CBC encryption to secure private chat messages. The encryption system requires a 256-bit (32-byte) key for proper operation.

## Quick Start

### 1. Generate a New Key
```bash
# Generate a cryptographically secure random key (recommended)
node scripts/generate-key.js

# Or generate from a password (development only)
node scripts/generate-key.js password mypassword
```

### 2. Set Up Environment
The key will be automatically added to your `.env` file:
```env
ENCRYPTION_KEY=389134dcfe3c4ac6f62f7908f9cb01d7c9d050673add340ebcb671a6abb0ff59
```

### 3. Test the Setup
Start your application and test that messages encrypt/decrypt properly.

## Key Management Scripts

### `scripts/generate-key.js`
Generates new encryption keys with professional-grade security.

**Options:**
- **Default**: Generates cryptographically secure random key
- **`password <password>`**: Generates deterministic key from password (development only)

**Example:**
```bash
# Secure random key (recommended)
node scripts/generate-key.js

# Password-based key (development only)
node scripts/generate-key.js password mypassword123
```

### `scripts/backup-keys.js`
Creates encrypted backups of your encryption keys.

**Commands:**
```bash
# Create backup
node scripts/backup-keys.js

# Restore from backup
node scripts/backup-keys.js restore key-backup-2025-01-01T12-00-00-000Z.json.enc password123
```

## Security Best Practices

### ✅ Do
- Use cryptographically secure random keys (32 bytes = 256 bits)
- Keep encryption keys in environment variables, not code
- Back up your keys securely
- Rotate keys periodically (every 3-6 months)
- Use different keys for different environments

### ❌ Don't
- Hardcode keys in source code
- Use simple passwords as keys
- Commit `.env` files to version control
- Share keys via insecure channels
- Use the same key for multiple applications

## Environment Setup

### Development
```env
ENCRYPTION_KEY=your-dev-key-here
NODE_ENV=development
```

### Production
```env
ENCRYPTION_KEY=your-production-key-here
NODE_ENV=production
```

## Key Backup Strategy

1. **Regular Backups**: Create encrypted key backups weekly
2. **Secure Storage**: Store backups in encrypted drives or secure cloud storage
3. **Access Control**: Limit access to key backups
4. **Testing**: Regularly test key restoration procedures

### Example Backup Workflow
```bash
# 1. Create backup
node scripts/backup-keys.js

# 2. Copy backup to secure location
cp key-backup-*.json.enc /secure/backup/location/

# 3. Test restoration
node scripts/backup-keys.js restore key-backup-*.json.enc <password>
```

## Troubleshooting

### "Messages not decrypting"
- Check that `ENCRYPTION_KEY` is set in `.env`
- Verify the key hasn't changed since messages were encrypted
- Ensure MongoDB connection is working

### "Key backup failed"
- Check file permissions
- Ensure sufficient disk space
- Verify password strength

### "Cannot decrypt old messages"
- Old messages may have been encrypted with a different key
- Check if you have the correct key backup
- Consider re-encryption with new key (data migration required)

## Advanced Configuration

### Custom Key Length
The system uses 256-bit keys by default. For custom lengths:
```javascript
// In Message.js model
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // Always 16 for AES-CBC
```

### Key Rotation
To rotate encryption keys:
1. Generate new key: `node scripts/generate-key.js`
2. Update `.env` with new key
3. Restart application
4. Create backup of old key for historical message access

## Security Audit

Regularly audit your key management:
- [ ] Keys are stored securely
- [ ] Backups are tested
- [ ] Keys are rotated periodically
- [ ] Access is properly controlled
- [ ] No keys in version control

## Emergency Procedures

### Lost Encryption Key
1. Check key backups
2. Look for keys in secure password managers
3. Check deployment scripts and configuration files
4. If all else fails, messages encrypted with the lost key cannot be recovered

### Compromised Key
1. Immediately generate new key
2. Update all environments
3. Invalidate old key backups
4. Monitor for unauthorized access

---

**Remember**: Your encryption key is as important as your database password. Treat it with the same level of security!
