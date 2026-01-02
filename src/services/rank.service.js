const Rank = require('../models/Rank');

// Default Ranks Configuration
const DEFAULT_RANKS = [
    { level: 0, name: 'Tân binh', requiredHours: 0, icon: '/icons/rank/0.png' },
    { level: 1, name: 'Học viên', requiredHours: 5, icon: '/icons/rank/1.png' },
    { level: 2, name: 'Chiến binh', requiredHours: 20, icon: '/icons/rank/2.png' },
    { level: 3, name: 'Tinh anh', requiredHours: 50, icon: '/icons/rank/3.png' },
    { level: 4, name: 'Cao thủ', requiredHours: 100, icon: '/icons/rank/4.png' },
    { level: 5, name: 'Đại sư', requiredHours: 200, icon: '/icons/rank/5.png' },
    { level: 6, name: 'Tông sư', requiredHours: 400, icon: '/icons/rank/6.png' },
    { level: 7, name: 'Vương giả', requiredHours: 700, icon: '/icons/rank/7.png' },
    { level: 8, name: 'Đế vương', requiredHours: 1000, icon: '/icons/rank/8.png' },
    { level: 9, name: 'Huyền thoại', requiredHours: 2000, icon: '/icons/rank/9.png' }
];

const seedDefaultRanks = async () => {
    const count = await Rank.countDocuments();
    if (count === 0) {
        console.log('Seeding default ranks...');
        await Rank.insertMany(DEFAULT_RANKS);
        console.log('Default ranks seeded successfully.');
    }
};

const getAllRanks = async () => {
    return await Rank.find().sort({ level: 1 });
};

const getRankByLevel = async (level) => {
    return await Rank.findOne({ level });
};

const updateRank = async (level, data) => {
    const rank = await Rank.findOne({ level });
    if (!rank) throw new Error('Rank not found');

    if (data.name) rank.name = data.name;
    if (data.requiredHours !== undefined) rank.requiredHours = data.requiredHours;
    if (data.icon) rank.icon = data.icon;
    if (data.color) rank.color = data.color;

    await rank.save();
    return rank;
};

// Calculate user's current rank based on total hours
const calculateUserRank = async (totalMinutes) => {
    const totalHours = totalMinutes / 60;

    // Find the highest rank that fits the hours
    // Sort descending by requiredHours to find the highest match first
    const ranks = await Rank.find().sort({ requiredHours: -1 });

    for (const rank of ranks) {
        if (totalHours >= rank.requiredHours) {
            return rank;
        }
    }

    // Should not happen if level 0 is 0 hours, but fallback to level 0
    return await Rank.findOne({ level: 0 });
};

// Get the next rank for progress
const getNextRank = async (currentLevel) => {
    return await Rank.findOne({ level: currentLevel + 1 });
};

module.exports = {
    seedDefaultRanks,
    getAllRanks,
    getRankByLevel,
    updateRank,
    calculateUserRank,
    getNextRank
};
