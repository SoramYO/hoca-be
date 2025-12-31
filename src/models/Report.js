const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  submitter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' }, // Optional, if reported in a room
  
  reason: { 
    type: String, 
    enum: ['INAPPROPRIATE_CONTENT', 'HARASSMENT', 'SPAM', 'DISRUPTION', 'OTHER'],
    required: true 
  },
  description: String,
  
  status: { 
    type: String, 
    enum: ['PENDING', 'REVIEWED', 'DISMISSED', 'ACTION_TAKEN'],
    default: 'PENDING'
  },
  
  resolutionNotes: String,
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
