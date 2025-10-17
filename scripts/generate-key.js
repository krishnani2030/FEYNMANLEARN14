#!/usr/bin/env node

/**
 * Encryption Key Generator for Feynman Learn
 * Generates cryptographically secure AES-256 keys
 *
 * Usage: node scripts/generate-key.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSecureKey() {
    // Generate 32 bytes (256 bits) of cryptographically secure random data
    return crypto.randomBytes(32).toString('hex');
}

function generateKeyFromPassword(password, salt = null) {
    // Generate a deterministic key from a password (for development only)
    const actualSalt = salt || crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, actualSalt, 100000, 32, 'sha256');
    return {
        key: key.toString('hex'),
        salt: actualSalt.toString('hex')
    };
}

function saveEnvFile(key, filename = '.env') {
    const envPath = path.join(__dirname, '..', filename);
    const envContent = `ENCRYPTION_KEY=${key}
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/feynman_learn
`;

    try {
        fs.writeFileSync(envPath, envContent);
        console.log(`✅ ${filename} created/updated with new encryption key`);
        console.log(`📁 Location: ${envPath}`);
    } catch (error) {
        console.error('❌ Failed to save .env file:', error.message);
        process.exit(1);
    }
}

function main() {
    console.log('🔐 Feynman Learn - Encryption Key Generator');
    console.log('=' .repeat(50));

    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'password') {
        const password = args[1];
        if (!password) {
            console.error('❌ Please provide a password: node scripts/generate-key.js password mypassword');
            process.exit(1);
        }

        const { key, salt } = generateKeyFromPassword(password);
        console.log('\n🔑 Generated key from password:');
        console.log(`Key:  ${key}`);
        console.log(`Salt: ${salt}`);
        console.log('\n⚠️  WARNING: Password-based keys are less secure than random keys!');
        console.log('   Use this only for development. For production, use random keys.\n');

        saveEnvFile(key);

    } else {
        // Generate random key (recommended)
        const key = generateSecureKey();
        console.log('\n🎲 Generated cryptographically secure random key:');
        console.log(`Key: ${key}`);
        console.log('\n✅ This is the recommended approach for production!\n');

        saveEnvFile(key);
    }

    console.log('📋 Next steps:');
    console.log('1. Copy .env to your production environment');
    console.log('2. Keep this key safe and backed up');
    console.log('3. Never commit .env files to version control');
    console.log('4. Rotate keys periodically for maximum security');
    console.log('\n🔒 Your chat messages are now secure!');
}

if (require.main === module) {
    main();
}

module.exports = { generateSecureKey, generateKeyFromPassword };
