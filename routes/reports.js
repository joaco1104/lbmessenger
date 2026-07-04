const express = require('express');
const Message = require('../models/Message');
const Report = require('../models/Report');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/reports - reportar un mensaje
router.post('/', auth, async (req, res) => {
  try {
    const { messageId, reason } = req.body;

    if (!messageId || !reason || !reason.trim()) {
      return res.status(400).json({ error: 'Debes indicar el mensaje y un motivo.' });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Mensaje no encontrado.' });

    if (String(message.sender) === String(req.user._id)) {
      return res.status(400).json({ error: 'No puedes reportar tu propio mensaje.' });
    }

    const report = await Report.create({
      message: message._id,
      reportedBy: req.user._id,
      messageAuthor: message.sender,
      reason: reason.trim(),
      messageContentSnapshot: message.content
    });

    res.status(201).json({ message: 'Reporte enviado. El equipo de moderación lo revisará.', report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al enviar el reporte.' });
  }
});

module.exports = router;
