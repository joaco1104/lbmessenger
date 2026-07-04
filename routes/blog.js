const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/blog/:nickname
// Devuelve la página personal de un usuario si la marcó como pública.
// Requiere estar autenticado en LBMessenger (no es pública en todo
// internet, solo visible para otros miembros de la plataforma), ya que
// esta app es para una comunidad cerrada de estudiantes.
router.get('/:nickname', auth, async (req, res) => {
  try {
    const user = await User.findOne({ nickname: req.params.nickname, isBanned: false })
      .select('nickname avatar profilePhoto nameColor blog');

    if (!user || !user.blog || !user.blog.isPublic) {
      return res.status(404).json({ error: 'Esta página no existe o no es pública.' });
    }

    res.json({
      nickname: user.nickname,
      title: user.blog.title,
      html: user.blog.html,
      css: user.blog.css,
      updatedAt: user.blog.updatedAt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la página.' });
  }
});

module.exports = router;
