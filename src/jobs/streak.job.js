const cron = require('node-cron');
const User = require('../models/User');
const Room = require('../models/Room');
const roomService = require('../services/room.service');

// Store io instance for emitting events
let ioInstance = null;

const setIoInstance = (io) => {
  ioInstance = io;
};

const performStreakMaintenance = async () => {
  console.log('Running daily streak maintenance...');
  try {
    // Check Streak Break
    // If user lastStudyDate < Yesterday, reset streak to 0.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // Users who haven't studied since before yesterday (meaning they skipped yesterday)
    // And have a streak > 0
    const brokenStreakUsers = await User.updateMany(
      {
        lastStudyDate: { $lt: yesterday },
        currentStreak: { $gt: 0 }
      },
      { currentStreak: 0 }
    );

    console.log(`Streak maintenance complete. ${brokenStreakUsers.modifiedCount || 0} streaks reset.`);
    return { success: true, count: brokenStreakUsers.modifiedCount || 0 };
  } catch (err) {
    console.error('Error in daily streak job:', err);
    throw err;
  }
};

const performRoomMaintenance = async () => {
  try {
    const now = new Date();

    // === WARNINGS: Check for rooms expiring soon ===
    // 10 minute warning
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    // Find rooms expiring in ~10 minutes (between 9-10 minutes)
    const nineMinutesFromNow = new Date(now.getTime() + 9 * 60 * 1000);
    const roomsWarning10m = await Room.find({
      isActive: true,
      autoCloseAt: { $gt: nineMinutesFromNow, $lte: tenMinutesFromNow }
    });

    for (const room of roomsWarning10m) {
      if (ioInstance) {
        ioInstance.to(room._id.toString()).emit('room-warning', {
          roomId: room._id.toString(),
          remainingMinutes: 10,
          message: 'Phòng sẽ tự động đóng sau 10 phút. Nâng cấp HOCA+ để tạo phòng không giới hạn!'
        });

        ioInstance.to(room._id.toString()).emit('chat-message', {
          userId: 'system',
          displayName: 'System',
          message: '⚠️ Phòng sẽ tự động đóng sau 10 phút! Nâng cấp HOCA+ để tạo phòng không giới hạn thời gian.',
          timestamp: new Date().toISOString()
        });

        console.log(`Sent 10-minute warning for room ${room._id}`);
      }
    }

    // Find rooms expiring in ~5 minutes (between 4-5 minutes)
    const fourMinutesFromNow = new Date(now.getTime() + 4 * 60 * 1000);
    const roomsWarning5m = await Room.find({
      isActive: true,
      autoCloseAt: { $gt: fourMinutesFromNow, $lte: fiveMinutesFromNow }
    });

    for (const room of roomsWarning5m) {
      if (ioInstance) {
        ioInstance.to(room._id.toString()).emit('room-warning', {
          roomId: room._id.toString(),
          remainingMinutes: 5,
          message: 'Phòng sẽ tự động đóng sau 5 phút!'
        });

        ioInstance.to(room._id.toString()).emit('chat-message', {
          userId: 'system',
          displayName: 'System',
          message: '🚨 Phòng sẽ tự động đóng sau 5 phút! Hãy lưu tiến độ học tập hoặc nâng cấp HOCA+.',
          timestamp: new Date().toISOString()
        });

        console.log(`Sent 5-minute warning for room ${room._id}`);
      }
    }

    // === AUTO-CLOSE: Expired rooms ===
    const expiredRooms = await roomService.getExpiredRooms();

    if (expiredRooms.length === 0) return { success: true, count: 0 };

    console.log(`Found ${expiredRooms.length} expired room(s) to auto-close`);

    let closedCount = 0;
    for (const room of expiredRooms) {
      try {
        // Close the room
        await roomService.closeRoom(room._id.toString(), 'auto_expired');
        closedCount++;

        // Notify all participants via socket
        if (ioInstance) {
          ioInstance.to(room._id.toString()).emit('room-closed', {
            roomId: room._id.toString(),
            reason: 'auto_expired',
            message: 'Phòng đã tự động đóng sau 60 phút. Nâng cấp HOCA+ để tạo phòng không giới hạn thời gian!'
          });

          // Also send chat message
          ioInstance.to(room._id.toString()).emit('chat-message', {
            userId: 'system',
            displayName: 'System',
            message: '⏰ Phòng đã tự động đóng sau 60 phút (giới hạn FREE). Nâng cấp HOCA+ để tạo phòng không giới hạn!',
            timestamp: new Date().toISOString()
          });
        }

        console.log(`Auto-closed room ${room._id} (owner: ${room.owner?.displayName || 'unknown'})`);
      } catch (err) {
        console.error(`Error auto-closing room ${room._id}:`, err);
      }
    }
    return { success: true, count: closedCount };
  } catch (err) {
    console.error('Error in room auto-close job:', err);
    throw err;
  }
};

const initJobs = () => {
  // Run every day at midnight - Streak maintenance
  cron.schedule('0 0 * * *', performStreakMaintenance);

  // Run every minute - Auto-close expired FREE tier rooms AND send warnings
  cron.schedule('* * * * *', performRoomMaintenance);

  console.log('Cron jobs initialized: streak maintenance (midnight), room auto-close (every minute)');
};

module.exports = { initJobs, setIoInstance, performStreakMaintenance, performRoomMaintenance };
