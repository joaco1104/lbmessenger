const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/chats - lista de conversaciones recientes del usuario
router.get('/', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate('participants', 'nickname avatar profilePhoto nameColor status statusMessage')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    const formatted = chats.map((chat) => {
      const otherUser = chat.participants.find(
        (p) => String(p._id) !== String(req.user._id)
      );
      return {
        chatId: chat._id,
        otherUser,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt
      };
    });

    res.json({ chats: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener conversaciones.' });
  }
});

// POST /api/chats/with/:userId - obtener o crear chat con otro usuario (solo amigos)
router.post('/with/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.user.friends.includes(userId)) {
      return res.status(403).json({ error: 'Solo puedes chatear con tus amigos.' });
    }

    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, userId], $size: 2 }
    });

    if (!chat) {
      chat = await Chat.create({ participants: [req.user._id, userId] });
    }

    res.json({ chatId: chat._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener/crear chat.' });
  }
});

// GET /api/chats/:chatId/messages - historial de mensajes
router.get('/:chatId/messages', auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat || !chat.participants.map(String).includes(String(req.user._id))) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación.' });
    }

    const messages = await Message.find({ chat: chatId, isDeleted: false })
      .populate('sender', 'nickname avatar profilePhoto nameColor')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes.' });
  }
});

module.exports = router;
