const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Session = require('../models/Session');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/feynman-learn');
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
};

const seedUsers = async () => {
    try {
        await User.deleteMany({});
        console.log('Cleared existing users');

        const users = [
            {
                name: 'Alex Chen',
                email: 'alex@example.com',
                passwordHash: 'password123',
                role: 'student'
            },
            {
                name: 'Sarah Kim',
                email: 'sarah@example.com',
                passwordHash: 'password123',
                role: 'student'
            },
            {
                name: 'Mike Johnson',
                email: 'mike@example.com',
                passwordHash: 'password123',
                role: 'student'
            },
            {
                name: 'Admin User',
                email: 'admin@example.com',
                passwordHash: 'admin123',
                role: 'admin'
            }
        ];

        // Create users with properly hashed passwords
        const createdUsers = [];
        for (const userData of users) {
            // Hash the password manually
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(userData.passwordHash, salt);
            
            // Create user with hashed password
            const username = await User.generateUniqueUsername(userData.name);
            const user = new User({
                name: userData.name,
                email: userData.email,
                username,
                passwordHash: hashedPassword,
                role: userData.role
            });
            
            await user.save();
            createdUsers.push(user);
        }
        console.log(`Created ${createdUsers.length} users`);

        // Ensure a Feynman admin user exists
        let feynman = await User.findOne({ username: 'feynman' });
        if (!feynman) {
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash('welcome123', salt);
            feynman = new User({
                name: 'Richard Feynman',
                email: 'feynman@feynmanlearn.com',
                username: 'feynman',
                passwordHash: hashedPassword,
                role: 'admin'
            });
            await feynman.save();
            console.log('Created Feynman admin user');
        }

        return createdUsers;

    } catch (error) {
        console.error('Error seeding users:', error);
        throw error;
    }
};

const seedSessions = async (users) => {
    try {
        await Session.deleteMany({});
        console.log('Cleared existing sessions');

        const now = new Date();
        // Ensure all dates are at least 1 day in the future
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const threeDaysLater = new Date(now.getTime() + 72 * 60 * 60 * 1000);
        const fourDaysLater = new Date(now.getTime() + 96 * 60 * 60 * 1000);
        const fiveDaysLater = new Date(now.getTime() + 120 * 60 * 60 * 1000);
        const sixDaysLater = new Date(now.getTime() + 144 * 60 * 60 * 1000);

        const sessions = [
            {
                topic: 'Calculus Derivatives',
                level: 'college',
                date: tomorrow,
                duration: 60,
                maxParticipants: 4,
                meetLink: 'https://meet.google.com/abc-defg-hij',
                creator: users[1]._id,
                description: 'Learn the fundamentals of derivatives',
                tags: ['calculus', 'math']
            },
            {
                topic: 'Photosynthesis Process',
                level: 'high_school',
                date: dayAfter,
                duration: 45,
                maxParticipants: 3,
                meetLink: 'https://meet.google.com/xyz-uvw-rst',
                creator: users[2]._id,
                description: 'Understanding how plants convert light energy',
                tags: ['biology', 'plants']
            },
            {
                topic: 'Spanish Verb Conjugations',
                level: 'high_school',
                date: threeDaysLater,
                duration: 50,
                maxParticipants: 5,
                meetLink: 'https://meet.google.com/def-ghi-jkl',
                creator: users[0]._id,
                description: 'Master present tense verb conjugations',
                tags: ['spanish', 'language']
            },
            {
                topic: 'World War II Timeline',
                level: 'high_school',
                date: fourDaysLater,
                duration: 75,
                maxParticipants: 6,
                meetLink: 'https://meet.google.com/mno-pqr-stu',
                creator: users[3]._id,
                description: 'Comprehensive overview of WWII events',
                tags: ['history', 'world-war-ii']
            },
            {
                topic: 'Python Programming Basics',
                level: 'college',
                date: fiveDaysLater,
                duration: 90,
                maxParticipants: 4,
                meetLink: 'https://meet.google.com/vwx-yz1-234',
                creator: users[1]._id,
                description: 'Introduction to Python programming',
                tags: ['programming', 'python']
            },
            {
                topic: 'Chemistry Lab Safety',
                level: 'high_school',
                date: sixDaysLater,
                duration: 40,
                maxParticipants: 8,
                meetLink: 'https://meet.google.com/567-890-abc',
                creator: users[2]._id,
                description: 'Essential safety protocols for chemistry labs',
                tags: ['chemistry', 'safety']
            }
        ];

        const createdSessions = await Session.insertMany(sessions);
        console.log(`Created ${createdSessions.length} sessions`);

        return createdSessions;

    } catch (error) {
        console.error('Error seeding sessions:', error);
        throw error;
    }
};

const seedDatabase = async () => {
    try {
        await connectDB();
        console.log('Starting database seeding...');

        const users = await seedUsers();
        const sessions = await seedSessions(users);

        console.log('Database seeding completed successfully!');
        console.log('\nSample login credentials:');
        console.log('Student: alex@example.com / password123');
        console.log('Student: sarah@example.com / password123');
        console.log('Admin: admin@example.com / admin123');

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };