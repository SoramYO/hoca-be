const roomController = require('../controllers/room.controller');
const { protect } = require('../middlewares/auth.middleware');

const roomRoutes = async (fastify, options) => {
  fastify.addHook('onRequest', protect);

  fastify.get('/', roomController.getRooms);
  fastify.post('/', roomController.createRoom);
  fastify.get('/categories', roomController.getCategories); // Public categories for users
  fastify.get('/my', roomController.getMyRooms); // My created rooms
  fastify.get('/check-eligibility', roomController.checkJoinEligibility); // Check before joining
  fastify.get('/check-create-eligibility', roomController.checkCreateEligibility); // Check before creating
  fastify.get('/:id', roomController.getRoom);
  fastify.post('/:id/join', roomController.joinRoom);
  fastify.post('/:id/leave', roomController.leaveRoom);
  fastify.post('/:id/close', roomController.closeRoom); // Owner closes their room
};

module.exports = roomRoutes;

