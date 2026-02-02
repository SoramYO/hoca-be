/**
 * AI Routes - Study Assistant API endpoints (Fastify format)
 */

const aiController = require('../controllers/ai.controller');
const { protect } = require('../middlewares/auth.middleware');

async function aiRoutes(fastify, options) {
    // All AI routes require authentication
    fastify.addHook('preHandler', protect);

    /**
     * @route   GET /api/ai/status
     * @desc    Get AI availability and user's remaining questions
     * @access  Private
     */
    fastify.get('/status', aiController.getStatus);

    /**
     * @route   POST /api/ai/chat
     * @desc    Stream AI response (Server-Sent Events)
     * @access  Private
     * @body    { question: string, history?: Array<{role, content}> }
     */
    fastify.post('/chat', aiController.streamChat);

    /**
     * @route   POST /api/ai/ask
     * @desc    Non-streaming AI question/answer
     * @access  Private
     * @body    { question: string, history?: Array<{role, content}> }
     */
    fastify.post('/ask', aiController.askQuestion);

    /**
     * @route   GET /api/ai/usage
     * @desc    Get user's AI usage statistics
     * @access  Private
     */
    fastify.get('/usage', aiController.getUsage);
}

module.exports = aiRoutes;
