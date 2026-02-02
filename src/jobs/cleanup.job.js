/**
 * Cleanup Job: Delete INACTIVE accounts after 24 hours
 * This helps prevent spam accounts and keeps the database clean.
 */
const cron = require('node-cron');
const User = require('../models/User');

/**
 * Delete users who:
 * - Have accountStatus = 'INACTIVE'
 * - Were created more than 24 hours ago
 */
const cleanupInactiveAccounts = async () => {
    try {
        const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

        const result = await User.deleteMany({
            accountStatus: 'INACTIVE',
            createdAt: { $lt: cutoffDate }
        });

        if (result.deletedCount > 0) {
            console.log(`[Cleanup Job] Deleted ${result.deletedCount} inactive accounts (unverified > 24h)`);
        }
        return { success: true, count: result.deletedCount || 0 };
    } catch (error) {
        console.error('[Cleanup Job] Error cleaning up inactive accounts:', error);
        throw error;
    }
};

/**
 * Schedule the cleanup job to run every hour
 */
const startCleanupJob = () => {
    // Run every hour at minute 0
    cron.schedule('0 * * * *', () => {
        console.log('[Cleanup Job] Running inactive account cleanup...');
        cleanupInactiveAccounts();
    });

    console.log('[Cleanup Job] Inactive account cleanup job scheduled (runs every hour)');

    // Also run once on startup (after 1 minute delay to let DB connect)
    setTimeout(() => {
        console.log('[Cleanup Job] Running initial cleanup on startup...');
        cleanupInactiveAccounts();
    }, 60000);
};

module.exports = {
    startCleanupJob,
    cleanupInactiveAccounts
};
