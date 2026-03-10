const Feedback = require('../models/Feedback');
const Room = require('../models/Room');

// User: submit feedback after leaving room
const createFeedback = async (req, reply) => {
  try {
    const { rating, comment, roomId } = req.body || {};

    if (!rating) {
      return reply.code(400).send({ message: 'Rating is required' });
    }

    const numericRating = Number(rating);
    if (Number.isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return reply.code(400).send({ message: 'Rating must be between 1 and 5' });
    }

    let room = null;
    if (roomId) {
      room = await Room.findById(roomId).select('_id');
      if (!room) {
        return reply.code(400).send({ message: 'Invalid room' });
      }
    }

    const feedback = await Feedback.create({
      user: req.user.id,
      room: room ? room._id : undefined,
      rating: numericRating,
      comment: comment && comment.trim() ? comment.trim() : undefined
    });

    reply.code(201).send(feedback);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// Admin: list feedbacks
const getAllFeedback = async (req, reply) => {
  try {
    const { page = 1, limit = 20, minRating, maxRating } = req.query;
    const query = {};

    if (minRating) {
      query.rating = { ...query.rating, $gte: Number(minRating) };
    }
    if (maxRating) {
      query.rating = { ...query.rating, $lte: Number(maxRating) };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Feedback.find(query)
        .populate('user', 'displayName email avatar')
        .populate('room', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Feedback.countDocuments(query)
    ]);

    reply.send({
      feedbacks: items,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit) || 1)
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

// Admin: summary for dashboard card
const getFeedbackSummary = async (req, reply) => {
  try {
    const result = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = result[0] || { averageRating: 0, count: 0 };

    reply.send({
      averageRating: Number(summary.averageRating || 0).toFixed(1),
      count: summary.count
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

module.exports = {
  createFeedback,
  getAllFeedback,
  getFeedbackSummary
};

