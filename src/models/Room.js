const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomCategory' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null if admin room
  
  // Privacy
  isPublic: { type: Boolean, default: true },
  password: { type: String, select: false },
  
  // Settings
  maxParticipants: { type: Number, default: 30 },
  timerMode: { 
    type: String, 
    enum: ['POMODORO_25_5', 'POMODORO_45_5', 'POMODORO_50_10', 'COUNT_UP'],
    default: 'POMODORO_25_5'
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  closedAt: Date,
  isAdminRoom: { type: Boolean, default: false },

  // Active Participants (for checking limit < 50)
  activeParticipants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// Index for getting public rooms
roomSchema.index({ isPublic: 1, isActive: 1 });

module.exports = mongoose.model('Room', roomSchema);
