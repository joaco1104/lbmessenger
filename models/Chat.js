const mongoose = require('mongoose');

// Representa una conversación privada 1 a 1.
// Las salas/chat global se manejan con el modelo Room (separado, más simple).
const chatSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Un chat único por par de usuarios
chatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', chatSchema);
