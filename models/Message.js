const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // Si el mensaje pertenece a un chat privado
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    // Si el mensaje pertenece a una sala / chat global
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

messageSchema.index({ chat: 1, createdAt: 1 });
messageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
