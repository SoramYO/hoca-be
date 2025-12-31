const MotivationalQuote = require('../models/MotivationalQuote');

const getRandomQuote = async () => {
    const count = await MotivationalQuote.countDocuments({ isActive: true });
    if (count === 0) {
        return { content: 'Hãy tiếp tục cố gắng! 💪', type: 'ENCOURAGEMENT' };
    }

    const randomIndex = Math.floor(Math.random() * count);
    const quote = await MotivationalQuote.findOne({ isActive: true }).skip(randomIndex);
    return quote;
};

const getAllQuotes = async () => {
    return await MotivationalQuote.find().sort('-createdAt');
};

const createQuote = async (data) => {
    return await MotivationalQuote.create(data);
};

const seedQuotes = async () => {
    const existingCount = await MotivationalQuote.countDocuments();
    if (existingCount > 0) {
        console.log('Motivational quotes already seeded');
        return;
    }

    const quotes = [
        // Ca dao tục ngữ
        { content: 'Có công mài sắt, có ngày nên kim.', type: 'PROVERB' },
        { content: 'Học, học nữa, học mãi.', type: 'PROVERB' },
        { content: 'Đi một ngày đàng, học một sàng khôn.', type: 'PROVERB' },
        { content: 'Không thầy đố mày làm nên.', type: 'PROVERB' },
        { content: 'Kiến tha lâu cũng đầy tổ.', type: 'PROVERB' },
        { content: 'Một cây làm chẳng nên non, ba cây chụm lại nên hòn núi cao.', type: 'PROVERB' },
        { content: 'Luyện mãi thành tài, miệt mài thành giỏi.', type: 'PROVERB' },
        { content: 'Học thầy không tày học bạn.', type: 'PROVERB' },

        // Câu hỏi thăm
        { content: 'Bạn có đang tập trung không vậy? 🤔', type: 'QUESTION' },
        { content: 'Đã nghỉ ngơi chưa? Đừng quên uống nước nhé! 💧', type: 'QUESTION' },
        { content: 'Bạn đã học được bao lâu rồi? Hãy tiếp tục! ⏰', type: 'QUESTION' },
        { content: 'Có gặp khó khăn gì không? Hãy kiên trì nhé! 💡', type: 'QUESTION' },
        { content: 'Bạn có cần nghỉ giải lao một chút không? 🧘', type: 'QUESTION' },

        // Câu động viên
        { content: 'Cố gắng lên, sắp đạt được mục tiêu rồi! 🎯', type: 'ENCOURAGEMENT' },
        { content: 'Bạn đang làm rất tốt! Hãy tiếp tục! 🌟', type: 'ENCOURAGEMENT' },
        { content: 'Mỗi phút học tập là một bước tiến! 📈', type: 'ENCOURAGEMENT' },
        { content: 'Thành công đến từ sự kiên trì! 💪', type: 'ENCOURAGEMENT' },
        { content: 'Bạn thật tuyệt vời khi dành thời gian học tập! 🏆', type: 'ENCOURAGEMENT' },
        { content: 'Hôm nay bạn sẽ học được điều gì mới! 📚', type: 'ENCOURAGEMENT' },
        { content: 'Giữ vững tinh thần, bạn sẽ làm được! 🔥', type: 'ENCOURAGEMENT' },
        { content: 'Mỗi ngày một chút, tiến bộ từng ngày! 🚀', type: 'ENCOURAGEMENT' },
        { content: 'Đừng bỏ cuộc, mục tiêu đang ở phía trước! 🎓', type: 'ENCOURAGEMENT' },
        { content: 'Học tập chăm chỉ hôm nay, thành công ngày mai! ✨', type: 'ENCOURAGEMENT' }
    ];

    await MotivationalQuote.insertMany(quotes);
    console.log(`Seeded ${quotes.length} motivational quotes`);
};

module.exports = {
    getRandomQuote,
    getAllQuotes,
    createQuote,
    seedQuotes
};
