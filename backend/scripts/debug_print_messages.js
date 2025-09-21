const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Message = require('../models/Message');
const User = require('../models/User');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/feynman-learn', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    const latest = await Message.find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    console.log(`Found ${latest.length} latest messages:`);
    for (const m of latest) {
      console.log({
        _id: m._id?.toString?.() || m._id,
        sessionId: m.sessionId === null ? null : m.sessionId?.toString?.() || m.sessionId,
        sender: m.sender?.toString?.() || m.sender,
        senderName: m.senderName,
        senderUsername: m.senderUsername,
        recipient: m.recipient ? (m.recipient?.toString?.() || m.recipient) : null,
        recipientUsername: m.recipientUsername || null,
        text: m.text,
        timestamp: m.timestamp,
      });
    }

    // Optional: print unique recipients for the most recent sender
    if (latest[0]) {
      const lastSender = latest[0].sender;
      const convPartners = await Message.aggregate([
        { $match: { sender: lastSender } },
        { $group: { _id: '$recipient' } },
        { $limit: 5 }
      ]);
      console.log('Recent conversation partners (by recipient ObjectId):', convPartners);
    }

  } catch (err) {
    console.error('Error reading messages:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
})();
