const roomService = require('../services/room.service');

const createRoom = async (req, reply) => {
  try {
    const room = await roomService.createRoom(req.user.id, req.body);
    reply.code(201).send(room);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getRooms = async (req, reply) => {
  try {
    const rooms = await roomService.getPublicRooms();
    reply.send(rooms);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const getRoom = async (req, reply) => {
  try {
    const room = await roomService.getRoomById(req.params.id);
    reply.send(room);
  } catch (error) {
    reply.code(404).send({ message: error.message });
  }
};

const joinRoom = async (req, reply) => {
  try {
    const { password } = req.body || {};
    const result = await roomService.joinRoom(req.params.id, req.user.id, password);
    reply.send(result);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const leaveRoom = async (req, reply) => {
  try {
    await roomService.leaveRoom(req.params.id, req.user.id);
    reply.send({ message: 'Left successfully' });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom
};
