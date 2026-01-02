/**
 * Seed script to insert 13 badges into the database
 * Run with: node seedBadges.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Badge = require('./src/models/Badge');
const env = require('./src/config/env');

const badges = [
    // STREAK badges
    { name: 'Streak 3 Ngày', description: 'Học liên tục 3 ngày', icon: '/badges/streak_3.png', type: 'STREAK', threshold: 3, color: 'from-amber-400 to-orange-500' },
    { name: 'Streak 7 Ngày', description: 'Học liên tục 1 tuần', icon: '/badges/streak_7.png', type: 'STREAK', threshold: 7, color: 'from-amber-500 to-orange-600' },
    { name: 'Streak 10 Ngày', description: 'Học liên tục 10 ngày', icon: '/badges/streak_10.png', type: 'STREAK', threshold: 10, color: 'from-orange-400 to-red-500' },
    { name: 'Streak 14 Ngày', description: 'Học liên tục 2 tuần', icon: '/badges/streak_14.png', type: 'STREAK', threshold: 14, color: 'from-orange-500 to-red-600' },
    { name: 'Streak 30 Ngày', description: 'Học liên tục 1 tháng', icon: '/badges/streak_30.png', type: 'STREAK', threshold: 30, color: 'from-red-400 to-pink-500' },
    { name: 'Streak 60 Ngày', description: 'Học liên tục 2 tháng', icon: '/badges/streak_60.png', type: 'STREAK', threshold: 60, color: 'from-pink-400 to-purple-500' },
    { name: 'Streak 100 Ngày', description: 'Học liên tục 100 ngày', icon: '/badges/streak_100.png', type: 'STREAK', threshold: 100, color: 'from-purple-400 to-indigo-500' },
    { name: 'Streak 365 Ngày', description: 'Học liên tục 1 năm', icon: '/badges/streak_365.png', type: 'STREAK', threshold: 365, color: 'from-indigo-400 to-blue-500' },

    // STUDY_HOURS badges
    { name: '10 Giờ Học', description: 'Tích lũy 10 giờ học', icon: '/badges/study_10h.png', type: 'STUDY_HOURS', threshold: 10, color: 'from-green-400 to-emerald-500' },
    { name: '50 Giờ Học', description: 'Tích lũy 50 giờ học', icon: '/badges/study_50h.png', type: 'STUDY_HOURS', threshold: 50, color: 'from-emerald-400 to-teal-500' },
    { name: '100 Giờ Học', description: 'Tích lũy 100 giờ học', icon: '/badges/study_100h.png', type: 'STUDY_HOURS', threshold: 100, color: 'from-teal-400 to-cyan-500' },
    { name: '500 Giờ Học', description: 'Tích lũy 500 giờ học', icon: '/badges/study_500h.png', type: 'STUDY_HOURS', threshold: 500, color: 'from-cyan-400 to-blue-500' },
    { name: '1000 Giờ Học', description: 'Tích lũy 1000 giờ học', icon: '/badges/study_1000h.png', type: 'STUDY_HOURS', threshold: 1000, color: 'from-blue-400 to-violet-500' },
];

async function seedBadges() {
    try {
        await mongoose.connect(env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        for (const badgeData of badges) {
            const existing = await Badge.findOne({ name: badgeData.name });
            if (existing) {
                // Update existing badge
                await Badge.findByIdAndUpdate(existing._id, badgeData);
                console.log(`🔄 Updated: ${badgeData.name}`);
            } else {
                // Create new badge
                await Badge.create(badgeData);
                console.log(`✨ Created: ${badgeData.name}`);
            }
        }

        console.log('\n🎉 Badge seeding completed!');
        console.log(`Total badges in DB: ${await Badge.countDocuments()}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedBadges();
