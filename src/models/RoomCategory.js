const mongoose = require('mongoose');

const roomCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String
}, { timestamps: true });

module.exports = mongoose.model('RoomCategory', roomCategorySchema);
