const rankService = require('../services/rank.service');

const getRanks = async (req, reply) => {
    try {
        const ranks = await rankService.getAllRanks();
        reply.send(ranks);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

const updateRank = async (req, reply) => {
    try {
        const { level } = req.params;
        const rank = await rankService.updateRank(Number(level), req.body);
        reply.send({ message: 'Rank updated successfully', rank });
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

module.exports = {
    getRanks,
    updateRank
};
