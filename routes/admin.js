const express = require('express');
const Report = require('../models/Report');
const Message = require('../models/Message');
const User = require('../models/User');
const Room = require('../models/Room');
const auth = require('../middleware/auth');
const { requireAdmin, requireSuperAdmin } = require('../middleware/admin');

const router = express.Router();

// Todas las rutas de admin requieren autenticación + rol admin/superadmin
router.use(auth, requireAdmin);

// GET /api/admin/reports - listar reportes (filtrable por status)
router.get('/reports', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const reports = await Report.find(filter)
      .populate('reportedBy', 'nickname avatar')
      .populate('messageAuthor', 'nickname avatar isBanned')
      .populate('message')
      .sort({ createdAt: -1 });

    res.json({ reports });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener reportes.' });
  }
});

// POST /api/admin/reports/:id/delete-message - eliminar el mensaje reportado
router.post('/reports/:id/delete-message', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado.' });

    await Message.findByIdAndUpdate(report.message, {
      isDeleted: true,
      deletedBy: req.user._id
    });

    report.status = 'reviewed';
    report.reviewedBy = req.user._id;
    await report.save();

    res.json({ message: 'Mensaje eliminado correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el mensaje.' });
  }
});

// POST /api/admin/reports/:id/dismiss - descartar el reporte sin acción
router.post('/reports/:id/dismiss', async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: 'dismissed', reviewedBy: req.user._id },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado.' });
    res.json({ message: 'Reporte descartado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al descartar el reporte.' });
  }
});

// POST /api/admin/users/:id/ban - banear usuario
router.post('/users/:id/ban', async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (['admin', 'superadmin'].includes(target.role) && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'No puedes banear a otro administrador.' });
    }

    target.isBanned = true;
    await target.save();
    res.json({ message: `Usuario ${target.nickname} suspendido.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al suspender usuario.' });
  }
});

// POST /api/admin/users/:id/unban - levantar suspensión
router.post('/users/:id/unban', async (req, res) => {
  try {
    const target = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false },
      { new: true }
    );
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ message: `Usuario ${target.nickname} reactivado.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reactivar usuario.' });
  }
});

// GET /api/admin/users - listar usuarios (para gestión)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('email nickname avatar role isBanned isVerified createdAt')
      .sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// ---- Rutas exclusivas de SUPERADMIN ----

// POST /api/admin/users/:id/promote - convertir usuario en admin
router.post('/users/:id/promote', requireSuperAdmin, async (req, res) => {
  try {
    const target = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'admin' },
      { new: true }
    );
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ message: `${target.nickname} ahora es administrador.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al promover usuario.' });
  }
});

// POST /api/admin/users/:id/demote - quitar rol de admin
router.post('/users/:id/demote', requireSuperAdmin, async (req, res) => {
  try {
    const target = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'user' },
      { new: true }
    );
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ message: `${target.nickname} ya no es administrador.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al degradar usuario.' });
  }
});

// POST /api/admin/rooms - crear sala temática
router.post('/rooms', requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, description, icon } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Nombre y slug son obligatorios.' });
    }
    const room = await Room.create({ name, slug, description, icon });
    res.status(201).json({ room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear sala.' });
  }
});

// DELETE /api/admin/rooms/:id - eliminar sala (no permite borrar el chat global)
router.delete('/rooms/:id', requireSuperAdmin, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Sala no encontrada.' });
    if (room.isGlobal) return res.status(400).json({ error: 'No puedes eliminar el chat global.' });

    await room.deleteOne();
    res.json({ message: 'Sala eliminada.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar sala.' });
  }
});

module.exports = router;
