const express = require('express');
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/friends/request - enviar solicitud
router.post('/request', auth, async (req, res) => {
  try {
    const { toUserId } = req.body;
    if (!toUserId) return res.status(400).json({ error: 'Falta el destinatario.' });
    if (toUserId === String(req.user._id)) {
      return res.status(400).json({ error: 'No puedes agregarte a ti mismo.' });
    }

    const toUser = await User.findById(toUserId);
    if (!toUser) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (req.user.friends.includes(toUserId)) {
      return res.status(400).json({ error: 'Ya son amigos.' });
    }

    const existing = await FriendRequest.findOne({
      $or: [
        { from: req.user._id, to: toUserId },
        { from: toUserId, to: req.user._id }
      ],
      status: 'pending'
    });
    if (existing) {
      return res.status(400).json({ error: 'Ya existe una solicitud pendiente.' });
    }

    const request = await FriendRequest.create({ from: req.user._id, to: toUserId });
    res.status(201).json({ message: 'Solicitud enviada.', request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al enviar solicitud.' });
  }
});

// GET /api/friends/requests - solicitudes pendientes recibidas
router.get('/requests', auth, async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.user._id, status: 'pending' })
      .populate('from', 'nickname avatar profilePhoto nameColor status');
    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener solicitudes.' });
  }
});

// POST /api/friends/requests/:id/respond - aceptar o rechazar
router.post('/requests/:id/respond', auth, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' | 'reject'
    const request = await FriendRequest.findById(req.params.id);

    if (!request || String(request.to) !== String(req.user._id)) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Esta solicitud ya fue respondida.' });
    }

    if (action === 'accept') {
      request.status = 'accepted';
      await request.save();

      await User.findByIdAndUpdate(request.from, { $addToSet: { friends: request.to } });
      await User.findByIdAndUpdate(request.to, { $addToSet: { friends: request.from } });

      return res.json({ message: 'Solicitud aceptada.' });
    } else if (action === 'reject') {
      request.status = 'rejected';
      await request.save();
      return res.json({ message: 'Solicitud rechazada.' });
    }

    res.status(400).json({ error: 'Acción inválida.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al responder solicitud.' });
  }
});

// GET /api/friends - lista de amigos
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'nickname avatar profilePhoto nameColor status statusMessage lastSeen');
    res.json({ friends: user.friends });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener amigos.' });
  }
});

// DELETE /api/friends/:friendId - eliminar amistad
router.delete('/:friendId', auth, async (req, res) => {
  try {
    const { friendId } = req.params;
    await User.findByIdAndUpdate(req.user._id, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: req.user._id } });
    res.json({ message: 'Amistad eliminada.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar amistad.' });
  }
});

module.exports = router;
