const quoteController = require('../controllers/quote.controller');
const { protect } = require('../middlewares/auth.middleware');

const quoteRoutes = async (fastify, options) => {
    // Get random quote (requires auth)
    fastify.get('/random', { preHandler: protect }, quoteController.getRandomQuote);

    // Get all quotes (for admin or debugging)
    fastify.get('/', { preHandler: protect }, quoteController.getAllQuotes);
};

module.exports = quoteRoutes;
