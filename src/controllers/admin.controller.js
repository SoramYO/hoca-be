const User = require('../models/User');
const Room = require('../models/Room');
const RoomCategory = require('../models/RoomCategory');
const Transaction = require('../models/Transaction');
const SystemConfig = require('../models/SystemConfig');
const moment = require('moment');

// User Management
const getAllUsers = async (req, reply) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort('-createdAt');

    const total = await User.countDocuments(query);

    reply.send({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const toggleBlockUser = async (req, reply) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return reply.code(404).send({ message: 'User not found' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    reply.send({ message: `User ${user.isBlocked ? 'blocked' : 'unblocked'}`, user });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const getUserDetails = async (req, reply) => {
  try {
    const userService = require('../services/user.service');
    const user = await userService.getUserById(req.params.id);
    reply.send(user);
  } catch (error) {
    reply.code(404).send({ message: error.message });
  }
};

// Analytics
const getSystemStats = async (req, reply) => {
  try {
    const [totalUsers, totalRooms, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments(),
      Transaction.aggregate([
        { $match: { status: 'COMPLETED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const revenue = totalRevenue.length > 0 ? totalRevenue[0].total : 0;

    // Recent Growth (Last 7 days)
    const sevenDaysAgo = moment().subtract(7, 'days').toDate();
    const newUsers = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    reply.send({
      totalUsers,
      totalRooms,
      revenue,
      newUsersLast7Days: newUsers
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// Room Management
const getAllRooms = async (req, reply) => {
  try {
    const { page = 1, limit = 12, search, filter } = req.query;
    const query = { isActive: true }; // Default to active rooms

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } }
        // Add owner name search if needed (requires population filter or aggregate)
      ];
    }

    // Simple filter mock
    if (filter === 'reported') {
      // query.reports = { $gt: 0 }; 
    }

    const rooms = await Room.find(query)
      .populate('owner', 'displayName avatar')
      .populate('activeParticipants', 'displayName avatar') // Inefficient for large scale but fine for now
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Room.countDocuments(query);

    // Enhance with "mock" report data/flags as requested by UI
    const enhancedRooms = rooms.map(room => ({
      ...room.toObject(),
      reportCount: Math.floor(Math.random() * 5), // Mock
      isNSFW: Math.random() > 0.9, // Mock
      isTrending: room.activeParticipants.length > 10
    }));

    reply.send({ rooms: enhancedRooms, total, page });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const warnUser = async (req, reply) => {
  try {
    const { userId } = req.params;
    const { reason, expiryDate } = req.body;

    const user = await User.findById(userId);
    if (!user) return reply.code(404).send({ message: 'User not found' });

    user.warnings.push({
      reason,
      expiresAt: expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    await user.save();
    reply.send({ message: 'User warned successfully', user });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// Revenue Management (Real Data)
const getRevenueStats = async (req, reply) => {
  try {
    // 1. Total Revenue (All time)
    const totalRevResult = await Transaction.aggregate([
      { $match: { status: 'COMPLETED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = totalRevResult[0]?.total || 0;

    // 2. Premium Sales (All time)
    const premiumRevResult = await Transaction.aggregate([
      { $match: { status: 'COMPLETED', type: 'PREMIUM_SUBSCRIPTION' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const premiumSales = premiumRevResult[0]?.total || 0;

    // 3. Ad Revenue
    // Currently no Ad model, returning 0 for now.
    const adRevenue = 0;

    // 4. ARPU (Total Revenue / Total Users)
    const totalUsers = await User.countDocuments();
    const arpu = totalUsers > 0 ? Math.round(totalRevenue / totalUsers) : 0;

    // 5. Chart Data (Last 7 days)
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const date = moment().subtract(i, 'days');
      const start = date.startOf('day').toDate();
      const end = date.endOf('day').toDate();

      const dayStats = await Transaction.aggregate([
        { $match: { status: 'COMPLETED', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } }
      ]);

      const premium = dayStats.find(s => s._id === 'PREMIUM_SUBSCRIPTION')?.total || 0;
      const ad = 0;

      chartData.push({
        day: date.format('DD/MM'),
        premium,
        ad
      });
    }

    // 6. Recent Transactions
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'displayName');

    // Format transactions for FE
    const formattedTxns = transactions.map(tx => ({
      id: tx.txnRef || tx._id.toString().substring(0, 8),
      type: tx.type,
      user: tx.user?.displayName || 'Unknown',
      amount: tx.amount,
      date: tx.createdAt,
      status: tx.status
    }));

    reply.send({
      totalRevenue,
      premiumSales,
      adRevenue,
      arpu,
      chartData,
      transactions: formattedTxns
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// Ad Management
const getAdStats = async (req, reply) => {
  try {
    reply.send({
      views: 125000,
      ctr: 2.4,
      revenue: 15400000,
      activeCampaigns: 5,
      placements: [
        { id: 1, name: 'Homepage Banner', location: 'Top of Dashboard', type: 'Display', status: 'Active', ctr: 3.2 },
        { id: 2, name: 'Sidebar Skyscraper', location: 'Right Sidebar', type: 'Display', status: 'Paused', ctr: 1.8 }
      ]
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// Analytics Reports (Real Data)
const getAnalytics = async (req, reply) => {
  try {
    const { type } = req.query; // growth, engagement, technical
    const StudySession = require('../models/StudySession');

    if (type === 'growth') {
      // Last 7 days user growth
      let newUsers = [];
      let labels = [];
      for (let i = 6; i >= 0; i--) {
        const date = moment().subtract(i, 'days');
        const count = await User.countDocuments({
          createdAt: {
            $gte: date.startOf('day').toDate(),
            $lte: date.endOf('day').toDate()
          }
        });
        newUsers.push(count);
        labels.push(date.format('DD/MM'));
      }

      const totalNewUsers = await User.countDocuments({
        createdAt: { $gte: moment().subtract(30, 'days').toDate() }
      });

      const activeUsers = await User.countDocuments({
        lastStudyDate: { $gte: moment().subtract(7, 'days').toDate() }
      });

      const mau = await User.countDocuments({
        lastStudyDate: { $gte: moment().subtract(30, 'days').toDate() }
      });

      return reply.send({
        newUsers, // Array of counts
        labels,   // Array of dates
        totalNewUsers,
        activeUsers,
        mau
      });
    }

    if (type === 'study_hours') {
      // Last 7 days study hours
      let studyHours = [];
      let labels = [];
      for (let i = 6; i >= 0; i--) {
        const date = moment().subtract(i, 'days');
        const start = date.clone().startOf('day').toDate();
        const end = date.clone().endOf('day').toDate();

        const dayStats = await StudySession.aggregate([
          { $match: { createdAt: { $gte: start, $lte: end } } },
          { $group: { _id: null, totalMinutes: { $sum: '$duration' } } }
        ]);

        const hours = dayStats[0]?.totalMinutes ? Math.round(dayStats[0].totalMinutes / 60) : 0;
        studyHours.push(hours);
        labels.push(date.format('ddd')); // Mon, Tue, etc.
      }

      return reply.send({
        studyHours, // Array of hours per day
        labels      // Day names
      });
    }

    if (type === 'engagement') {
      // Average Session Time
      const allSessions = await StudySession.aggregate([
        { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
      ]);
      const avgMinutes = allSessions[0]?.avgDuration ? Math.round(allSessions[0].avgDuration / 60) : 0;

      // Retention Rate (Pseudo: Active Users / Total Users)
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({
        lastStudyDate: { $gte: moment().subtract(30, 'days').toDate() }
      });
      const retentionRate = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0;

      return reply.send({
        avgSessionTime: `${avgMinutes}m`,
        retentionRate: parseFloat(retentionRate),
        cohortData: [] // TODO: Complex cohort analysis
      });
    }

    if (type === 'technical') {
      // Mock system stats (Node.js doesn't expose host CPU easily without lib)
      // Retaining mock for technical as it requires 'os-utils' or similar
      return reply.send({
        serverCpu: Math.floor(Math.random() * 30) + 10,
        serverRam: Math.floor(Math.random() * 40) + 30,
        bandwidth: Math.floor(Math.random() * 200) + 300
      });
    }

    reply.code(400).send({ message: 'Invalid analytics type' });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const closeRoom = async (req, reply) => {
  try {
    const { id } = req.params;
    const room = await Room.findById(id);
    if (!room) return reply.code(404).send({ message: 'Room not found' });

    room.isActive = false;
    await room.save();

    // TODO: Notify socket

    reply.send({ message: 'Room closed successfully', room });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const getAdminRoomDetails = async (req, reply) => {
  try {
    const { id } = req.params;
    const room = await Room.findById(id)
      .populate('owner', 'displayName avatar email')
      .populate('category', 'name')
      .populate('activeParticipants', 'displayName avatar email');

    if (!room) return reply.code(404).send({ message: 'Room not found' });

    // Calculate session stats for this room (mock or real)
    // For now, return basic info extended with report count
    const StudySession = require('../models/StudySession');
    const totalSessions = await StudySession.countDocuments({ room: id });

    reply.send({
      ...room.toObject(),
      totalSessions,
      reports: [] // TODO: Populate reports
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const createAdminRoom = async (req, reply) => {
  try {
    const { name, categoryId, timerMode } = req.body;

    // Check if category exists if provided
    if (categoryId) {
      const categoryExists = await RoomCategory.findById(categoryId);
      if (!categoryExists) return reply.code(400).send({ message: 'Invalid Category ID' });
    }

    const room = await Room.create({
      name,
      category: categoryId || null,
      isAdminRoom: true,
      owner: null, // Admin room has no user owner
      maxParticipants: 50,
      timerMode: timerMode || 'POMODORO_25_5',
      isPublic: true,
      isActive: true
    });

    reply.code(201).send(room);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const getRoomCategories = async (req, reply) => {
  try {
    const categories = await RoomCategory.find().sort('name');
    reply.send(categories);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const createRoomCategory = async (req, reply) => {
  try {
    const { name, description } = req.body;
    const category = await RoomCategory.create({ name, description });
    reply.code(201).send(category);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

// System Config Management
const getSystemConfig = async (req, reply) => {
  try {
    const configs = await SystemConfig.find();
    // Convert to key-value object for easier frontend use
    const configObj = {};
    configs.forEach(c => { configObj[c.key] = c.value; });
    reply.send(configObj);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const updateSystemConfig = async (req, reply) => {
  try {
    const updates = req.body; // { key: value, ... }
    const results = [];
    for (const [key, value] of Object.entries(updates)) {
      const config = await SystemConfig.setValue(key, value);
      results.push(config);
    }
    reply.send({ message: 'Config updated', configs: results });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// RoomCategory Update & Delete
const updateRoomCategory = async (req, reply) => {
  try {
    const { id } = req.params;
    const category = await RoomCategory.findByIdAndUpdate(id, req.body, { new: true });
    if (!category) return reply.code(404).send({ message: 'Category not found' });
    reply.send(category);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const deleteRoomCategory = async (req, reply) => {
  try {
    const { id } = req.params;
    const category = await RoomCategory.findByIdAndDelete(id);
    if (!category) return reply.code(404).send({ message: 'Category not found' });
    reply.send({ message: 'Category deleted' });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

module.exports = {
  getAllUsers,
  toggleBlockUser,
  getSystemStats,
  getAllRooms,
  closeRoom,
  getUserDetails,
  warnUser,
  getRevenueStats,
  getAdStats,
  getAnalytics,
  createAdminRoom,
  getRoomCategories,
  createRoomCategory,
  updateRoomCategory,
  deleteRoomCategory,
  getAdminRoomDetails,
  getSystemConfig,
  updateSystemConfig
};
