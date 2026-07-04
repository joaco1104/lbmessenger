const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const INTERESTS = require('../utils/interests');

const router = express.Router();

// Convierte un nombre de foro en un slug simple para la URL/identificador único
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

// GET /api/rooms - listar todas las salas disponibles
// Las salas globales van primero; entre el resto, se priorizan las que
// comparten más tags con los intereses del usuario (recomendación simple).
router.get('/', auth, async (req, res) => {
  try {
    const rooms = await Room.find().lean();
    const myInterests = req.user.interests || [];

    const withScore = rooms.map((r) => {
      const sharedTags = (r.tags || []).filter((t) => myInterests.includes(t));
      return { ...r, sharedCount: sharedTags.length };
    });

    withScore.sort((a, b) => {
      if (a.isGlobal !== b.isGlobal) return a.isGlobal ? -1 : 1;
      if (b.sharedCount !== a.sharedCount) return b.sharedCount - a.sharedCount;
      return a.name.localeCompare(b.name);
    });

    res.json({ rooms: withScore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener salas.' });
  }
});

// GET /api/rooms/:roomId/messages - historial de mensajes de una sala
router.get('/:roomId/messages', auth, async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await Message.find({ room: roomId, isDeleted: false })
      .populate('sender', 'nickname avatar profilePhoto nameColor')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes de la sala.' });
  }
});

// POST /api/rooms - crear un nuevo foro (disponible para todos los usuarios)
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, icon, tags } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del foro es obligatorio.' });
    }

    const cleanTags = Array.isArray(tags) ? tags.filter((t) => INTERESTS.includes(t)) : [];

    let baseSlug = slugify(name);
    if (!baseSlug) baseSlug = `foro-${Date.now()}`;

    let uniqueSlug = baseSlug;
    let counter = 1;
    while (await Room.findOne({ slug: uniqueSlug })) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    const room = await Room.create({
      name: name.trim().slice(0, 40),
      slug: uniqueSlug,
      description: (description || '').trim().slice(0, 200),
      icon: icon && icon.trim() ? icon.trim().slice(0, 4) : '💬',
      tags: cleanTags,
      createdBy: req.user._id
    });

    res.status(201).json({ message: 'Foro creado correctamente.', room });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un foro con ese nombre.' });
    }
    res.status(500).json({ error: 'Error al crear el foro.' });
  }
});

module.exports = router;