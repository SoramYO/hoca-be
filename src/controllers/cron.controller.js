const { cleanupInactiveAccounts } = require('../jobs/cleanup.job');
const { performStreakMaintenance, performRoomMaintenance } = require('../jobs/streak.job');

const runCleanup = async (req, reply) => {
  try {
    // Simple security check
    const cronSecret = process.env.CRON_SECRET || 'hoca_cron_secret_key';
    const authHeader = req.headers['x-cron-secret'];

    if (authHeader !== cronSecret && req.query.secret !== cronSecret) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const result = await cleanupInactiveAccounts();
    reply.send({ message: 'Cleanup job executed successfully', result });
  } catch (error) {
    console.error('Manual cleanup trigger error:', error);
    reply.code(500).send({ message: error.message });
  }
};

const runStreakMaintenance = async (req, reply) => {
  try {
    // Simple security check
    const cronSecret = process.env.CRON_SECRET || 'hoca_cron_secret_key';
    const authHeader = req.headers['x-cron-secret'];

    if (authHeader !== cronSecret && req.query.secret !== cronSecret) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const result = await performStreakMaintenance();
    reply.send({ message: 'Streak maintenance executed successfully', result });
  } catch (error) {
    console.error('Manual streak maintenance trigger error:', error);
    reply.code(500).send({ message: error.message });
  }
};

const runRoomMaintenance = async (req, reply) => {
  try {
    // Simple security check
    const cronSecret = process.env.CRON_SECRET || 'hoca_cron_secret_key';
    const authHeader = req.headers['x-cron-secret'];

    if (authHeader !== cronSecret && req.query.secret !== cronSecret) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    const result = await performRoomMaintenance();
    reply.send({ message: 'Room maintenance executed successfully', result });
  } catch (error) {
    console.error('Manual room maintenance trigger error:', error);
    reply.code(500).send({ message: error.message });
  }
};

module.exports = {
  runCleanup,
  runStreakMaintenance,
  runRoomMaintenance
};
