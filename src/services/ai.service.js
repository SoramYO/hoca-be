/**
 * AI Service - OpenRouter Integration
 * Provides streaming AI responses for Study Assistant
 * 
 * Free Models Available:
 * - google/gemma-2-9b-it:free
 * - meta-llama/llama-3.2-3b-instruct:free
 * - microsoft/phi-3-mini-128k-instruct:free
 */

const AIUsage = require('../models/AIUsage');
const subscriptionService = require('./subscription.service');

// AI Configuration
const AI_CONFIG = {
    OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
    // Free models on OpenRouter
    FREE_MODELS: [
        'arcee-ai/trinity-large-preview:free',
        'tngtech/deepseek-r1t2-chimera:free',
        'z-ai/glm-4.5-air:free'
    ],
    DEFAULT_MODEL: process.env.OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free',

    // Daily limits
    FREE_DAILY_LIMIT: 5,

    // System prompt to keep AI focused on education
    SYSTEM_PROMPT: `Bạn là HOCA AI - trợ lý học tập thông minh của nền tảng HOCA.

NGUYÊN TẮC:
1. Chỉ trả lời các câu hỏi liên quan đến học tập, kiến thức học thuật
2. Trả lời ngắn gọn, súc tích, dễ hiểu
3. Sử dụng tiếng Việt tự nhiên, thân thiện
4. Nếu câu hỏi không liên quan đến học tập, lịch sự từ chối và hướng dẫn hỏi về học tập
5. Có thể giải thích công thức, lý thuyết, bài tập
6. Khuyến khích và động viên học viên

PHONG CÁCH:
- Thân thiện như một người bạn học
- Sử dụng emoji phù hợp 📚✨🎯
- Chia nhỏ kiến thức phức tạp thành các bước đơn giản

Hãy trả lời câu hỏi của học viên:`
};

/**
 * Check if user can ask AI questions today
 * @param {Object} user - User object with subscription info
 * @returns {Object} { canAsk, remaining, limit, message }
 */
async function checkAILimit(user) {
    // Use getEffectiveTier to respect subscription expiry
    const tier = subscriptionService.getEffectiveTier(user);
    const isPremium = tier !== 'FREE';

    if (isPremium) {
        return {
            canAsk: true,
            remaining: -1, // Unlimited
            limit: -1,
            isPremium: true
        };
    }

    // FREE user - check daily limit
    const usage = await AIUsage.getTodayUsage(user._id);
    const remaining = Math.max(0, AI_CONFIG.FREE_DAILY_LIMIT - usage.questionCount);

    return {
        canAsk: remaining > 0,
        remaining,
        limit: AI_CONFIG.FREE_DAILY_LIMIT,
        used: usage.questionCount,
        isPremium: false,
        message: remaining <= 0
            ? 'Bạn đã hết lượt hỏi hôm nay. Nâng cấp HOCA+ để hỏi không giới hạn!'
            : null
    };
}

/**
 * Get AI status for user
 * @param {Object} user - User object
 * @returns {Object} AI availability status
 */
async function getAIStatus(user) {
    const limitInfo = await checkAILimit(user);

    return {
        available: true,
        model: AI_CONFIG.DEFAULT_MODEL,
        ...limitInfo
    };
}

/**
 * Stream AI response from OpenRouter
 * @param {string} question - User's question
 * @param {Object} user - User object for context
 * @param {Array} conversationHistory - Previous messages for context
 * @returns {AsyncGenerator} Yields response chunks
 */
async function* streamAIResponse(question, user, conversationHistory = []) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        yield { type: 'error', content: 'AI service is not configured. Please contact admin.' };
        return;
    }

    // Check limit for FREE users
    const limitInfo = await checkAILimit(user);
    if (!limitInfo.canAsk) {
        yield {
            type: 'limit_reached',
            content: limitInfo.message,
            remaining: 0,
            limit: limitInfo.limit
        };
        return;
    }

    // Build messages array
    const messages = [
        { role: 'system', content: AI_CONFIG.SYSTEM_PROMPT },
        ...conversationHistory.slice(-6), // Keep last 3 exchanges for context
        { role: 'user', content: question }
    ];

    try {
        const response = await fetch(AI_CONFIG.OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': process.env.APP_URL || 'https://hoca.vn',
                'X-Title': 'HOCA Study Assistant'
            },
            body: JSON.stringify({
                model: AI_CONFIG.DEFAULT_MODEL,
                messages,
                stream: true,
                max_tokens: 1024,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenRouter API error:', response.status, errorData);
            yield { type: 'error', content: 'Xin lỗi, AI đang bận. Vui lòng thử lại sau.' };
            return;
        }

        // Stream response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        yield { type: 'start', remaining: limitInfo.isPremium ? -1 : limitInfo.remaining - 1 };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);

                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;

                        if (content) {
                            fullResponse += content;
                            yield { type: 'chunk', content };
                        }
                    } catch (e) {
                        // Skip malformed JSON
                    }
                }
            }
        }

        // Record usage after successful response
        await AIUsage.incrementUsage(user._id, {
            question,
            response: fullResponse,
            model: AI_CONFIG.DEFAULT_MODEL,
            tokensUsed: 0 // OpenRouter doesn't always provide token count in stream
        });

        yield { type: 'done', fullResponse };

    } catch (error) {
        console.error('AI Service error:', error);
        yield { type: 'error', content: 'Đã có lỗi xảy ra. Vui lòng thử lại.' };
    }
}

/**
 * Non-streaming AI call (for simpler use cases)
 */
async function askAI(question, user, conversationHistory = []) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error('AI service is not configured');
    }

    const limitInfo = await checkAILimit(user);
    if (!limitInfo.canAsk) {
        throw new Error(limitInfo.message);
    }

    const messages = [
        { role: 'system', content: AI_CONFIG.SYSTEM_PROMPT },
        ...conversationHistory.slice(-6),
        { role: 'user', content: question }
    ];

    const response = await fetch(AI_CONFIG.OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://hoca.vn',
            'X-Title': 'HOCA Study Assistant'
        },
        body: JSON.stringify({
            model: AI_CONFIG.DEFAULT_MODEL,
            messages,
            max_tokens: 1024,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error('AI API request failed');
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';

    // Record usage
    await AIUsage.incrementUsage(user._id, {
        question,
        response: aiResponse,
        model: AI_CONFIG.DEFAULT_MODEL,
        tokensUsed: data.usage?.total_tokens || 0
    });

    return {
        response: aiResponse,
        remaining: limitInfo.isPremium ? -1 : limitInfo.remaining - 1
    };
}

module.exports = {
    AI_CONFIG,
    checkAILimit,
    getAIStatus,
    streamAIResponse,
    askAI
};
