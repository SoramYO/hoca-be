const quoteService = require('../services/quote.service');

const getRandomQuote = async (req, reply) => {
    try {
        const quote = await quoteService.getRandomQuote();
        reply.send(quote);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

const getAllQuotes = async (req, reply) => {
    try {
        const quotes = await quoteService.getAllQuotes();
        reply.send(quotes);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

module.exports = {
    getRandomQuote,
    getAllQuotes
};
