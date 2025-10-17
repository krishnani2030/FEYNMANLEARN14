#!/usr/bin/env node

/**
 * Encryption Key Backup Utility for Feynman Learn
 * Creates secure backup of your encryption keys
 *
 * Usage: node scripts/backup-keys.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function encryptBackup(data, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        encrypted: encrypted,
        salt: salt.toString('hex'),
        iv: iv.toString('hex')
    };
}

function decryptBackup(backupData, password) {
    const key = crypto.pbkdf2Sync(password, Buffer.from(backupData.salt, 'hex'), 100000, 32, 'sha256');
    const iv = Buffer.from(backupData.iv, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(backupData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
}

function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `key-backup-${timestamp}.json.enc`;

    const backupData = {
        encryptionKey: process.env.ENCRYPTION_KEY,
        createdAt: new Date().toISOString(),
        version: '1.0'
    };

    console.log('🔐 Creating encrypted key backup...');
    console.log('📁 Backup file: scripts/' + backupFilename);

    // For demo purposes, we'll use a simple password
    // In production, you'd want a more secure password input method
    const backupPassword = crypto.randomBytes(16).toString('hex');

    try {
        const encryptedBackup = encryptBackup(backupData, backupPassword);

        const backupContent = {
            ...encryptedBackup,
            description: 'Feynman Learn Encryption Key Backup',
            warning: 'Keep this password safe! You need it to restore keys.'
        };

        fs.writeFileSync(
            path.join(__dirname, backupFilename),
            JSON.stringify(backupContent, null, 2)
        );

        console.log('✅ Backup created successfully!');
        console.log('\n🔑 Recovery Information:');
        console.log(`Password: ${backupPassword}`);
        console.log('💡 Store this password securely (password manager recommended)');

        return { backupFilename, backupPassword };

    } catch (error) {
        console.error('❌ Failed to create backup:', error.message);
        process.exit(1);
    }
}

function restoreBackup(backupFile, password) {
    try {
        const backupPath = path.join(__dirname, backupFile);
        const backupContent = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

        const decryptedData = decryptBackup(backupContent, password);

        console.log('✅ Backup restored successfully!');
        console.log('\n🔑 Restored Key:');
        console.log(`ENCRYPTION_KEY=${decryptedData.encryptionKey}`);

        return decryptedData;

    } catch (error) {
        console.error('❌ Failed to restore backup:', error.message);
        console.log('\n💡 Make sure you have:');
        console.log('   1. Correct backup file path');
        console.log('   2. Correct password');
        process.exit(1);
    }
}

function main() {
    console.log('🔐 Feynman Learn - Key Backup Utility');
    console.log('=' .repeat(50));

    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'restore') {
        const backupFile = args[1];
        const password = args[2];

        if (!backupFile || !password) {
            console.error('❌ Usage: node scripts/backup-keys.js restore <backup-file> <password>');
            process.exit(1);
        }

        restoreBackup(backupFile, password);

    } else {
        // Default: create backup
        const { backupFilename, backupPassword } = createBackup();

        console.log('\n📋 Next steps:');
        console.log('1. Copy the backup file to a secure location');
        console.log('2. Store the password securely');
        console.log('3. Test restoration: node scripts/backup-keys.js restore ' + backupFilename + ' ' + backupPassword);
    }
}

if (require.main === module) {
    main();
}

module.exports = { encryptBackup, decryptBackup, createBackup, restoreBackup };
