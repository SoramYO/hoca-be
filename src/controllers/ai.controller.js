/**
 * AI Controller - Handles AI Study Assistant endpoints (Fastify format)
 * Supports Server-Sent Events (SSE) for streaming responses
 */

const aiService = require('../services/ai.service');

/**
 * GET /api/ai/status
 * Get AI availability and remaining questions for user
 */
const getStatus = async (request, reply) => {
    try {
        const status = await aiService.getAIStatus(request.user);
        return reply.send(status);
    } catch (error) {
        console.error('AI status error:', error);
        return reply.status(500).send({ message: 'Failed to get AI status' });
    }
};

/**
 * POST /api/ai/chat
 * Stream AI response using Server-Sent Events
 * 
 * Body: { question: string, history?: Array<{role, content}> }
 */
const streamChat = async (request, reply) => {
    const { question, history = [] } = request.body || {};

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return reply.status(400).send({ message: 'Question is required' });
    }

    if (question.length > 2000) {
        return reply.status(400).send({ message: 'Question too long (max 2000 characters)' });
    }

    // Set up SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    try {
        // Stream AI response
        for await (const chunk of aiService.streamAIResponse(question.trim(), request.user, history)) {
            // Send SSE event
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // End stream
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();

    } catch (error) {
        console.error('AI chat stream error:', error);
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: 'Stream error occurred' })}\n\n`);
        reply.raw.end();
    }
};

/**
 * POST /api/ai/ask
 * Non-streaming AI question (simpler endpoint)
 * 
 * Body: { question: string, history?: Array<{role, content}> }
 */
const askQuestion = async (request, reply) => {
    const { question, history = [] } = request.body || {};

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return reply.status(400).send({ message: 'Question is required' });
    }

    if (question.length > 2000) {
        return reply.status(400).send({ message: 'Question too long (max 2000 characters)' });
    }

    try {
        const result = await aiService.askAI(question.trim(), request.user, history);
        return reply.send({
            success: true,
            response: result.response,
            remaining: result.remaining
        });
    } catch (error) {
        console.error('AI ask error:', error);

        if (error.message.includes('hết lượt') || error.message.includes('Nâng cấp')) {
            return reply.status(429).send({
                success: false,
                message: error.message,
                limitReached: true
            });
        }

        return reply.status(500).send({
            success: false,
            message: 'Failed to get AI response'
        });
    }
};

/**
 * GET /api/ai/usage
 * Get user's AI usage statistics
 */
const getUsage = async (request, reply) => {
    try {
        const AIUsage = require('../models/AIUsage');
        const usage = await AIUsage.getTodayUsage(request.user._id);
        const limitInfo = await aiService.checkAILimit(request.user);

        return reply.send({
            today: {
                questionsAsked: usage.questionCount,
                remaining: limitInfo.remaining,
                limit: limitInfo.limit
            },
            isPremium: limitInfo.isPremium
        });
    } catch (error) {
        console.error('AI usage error:', error);
        return reply.status(500).send({ message: 'Failed to get usage' });
    }
};

module.exports = {
    getStatus,
    streamChat,
    askQuestion,
    getUsage
};
