const mongoose = require('mongoose');
const INTERESTS = require('../utils/interests');

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '💬' },
    isGlobal: { type: Boolean, default: false },
    tags: {
      type: [{ type: String, enum: INTERESTS }],
      default: []
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Room', roomSchema);