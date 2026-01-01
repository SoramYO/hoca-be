const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Badge = require('./models/Badge');
const RoomCategory = require('./models/RoomCategory');
const SystemConfig = require('./models/SystemConfig');
const quoteService = require('./services/quote.service');

dotenv.config({ path: '../.env' }); // Adjust path if needed

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hoca');
    console.log('✅ Connected to MongoDB');

    // Seed Categories
    const categories = ['Tự học', 'Học nhóm', 'Ngoại ngữ', 'IT', 'Kinh tế', 'Giải trí'];
    for (const name of categories) {
      const exists = await RoomCategory.findOne({ name });
      if (!exists) {
        await RoomCategory.create({ name });
        console.log(`Created category: ${name}`);
      }
    }

    // Seed Badges
    const badges = [
      { name: '10 Day Streak', type: 'STREAK', threshold: 10, icon: 'fire-10', color: 'from-orange-400 to-red-500' },
      { name: '30 Day Streak', type: 'STREAK', threshold: 30, icon: 'fire-30', color: 'from-yellow-400 to-orange-500' },
      { name: '100 Day Streak', type: 'STREAK', threshold: 100, icon: 'fire-100', color: 'from-purple-400 to-pink-500' },
      { name: '10 Hours Study', type: 'STUDY_HOURS', threshold: 10, icon: 'book-10', color: 'from-blue-400 to-cyan-500' },
      { name: '100 Hours Study', type: 'STUDY_HOURS', threshold: 100, icon: 'book-100', color: 'from-emerald-400 to-teal-500' }
    ];

    for (const badge of badges) {
      const exists = await Badge.findOne({ name: badge.name });
      if (!exists) {
        await Badge.create(badge);
        console.log(`Created badge: ${badge.name}`);
      }
    }

    // Seed SystemConfig
    const configs = [
      { key: 'minRoomParticipants', value: 2, description: 'Minimum participants per room' },
      { key: 'maxRoomParticipants', value: 50, description: 'Maximum participants per room (Pro users)' },
      { key: 'freeMaxParticipants', value: 4, description: 'Maximum participants for free users' },
      { key: 'freeDailyRoomLimit', value: 2, description: 'Max rooms free users can create per day' },
      { key: 'freeDailyStudyMinutes', value: 180, description: 'Max study minutes per day for free users (3 hours)' }
    ];

    for (const config of configs) {
      const exists = await SystemConfig.findOne({ key: config.key });
      if (!exists) {
        await SystemConfig.create(config);
        console.log(`Created config: ${config.key} = ${config.value}`);
      }
    }

    // Seed Admin User
    const User = require('./models/User');
    const adminExists = await User.findOne({ email: 'admin@hoca.com' });
    if (!adminExists) {
      await User.create({
        displayName: 'Super Admin',
        email: 'admin@hoca.com',
        password: 'adminpassword123', // Will be hashed by pre-save hook
        role: 'ADMIN'
      });
      console.log('✅ Created default admin: admin@hoca.com / adminpassword123');
    }

    // Seed Pricing Plans
    const PricingPlan = require('./models/PricingPlan');
    const plans = [
      {
        name: 'Gói Tháng Premium',
        description: 'Truy cập đầy đủ tính năng trong 30 ngày',
        price: 99000,
        tier: 'MONTHLY',
        durationDays: 30,
        isActive: true,
        features: ['Màn hình ảo', 'Phòng học không giới hạn', 'Sticker độc quyền', 'Chất lượng HD']
      },
      {
        name: 'Gói Năm Premium',
        description: 'Tiết kiệm 16% so với gói tháng',
        price: 999000,
        tier: 'YEARLY',
        durationDays: 365,
        isActive: true,
        features: ['Màn hình ảo', 'Phòng học không giới hạn', 'Sticker độc quyền', 'Chất lượng HD', 'Huy hiệu độc quyền']
      }
    ];

    for (const plan of plans) {
      const exists = await PricingPlan.findOne({ tier: plan.tier });
      if (!exists) {
        await PricingPlan.create(plan);
        console.log(`Created plan: ${plan.name}`);
      }
    }

    // Seed Motivational Quotes
    await quoteService.seedQuotes();

    console.log('✅ Seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedData();

