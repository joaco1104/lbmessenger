const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { AVATARS } = require('../models/User');
const INTERESTS = require('../utils/interests');
const { sanitizeBlogHtml, sanitizeBlogCss } = require('../utils/sanitizeBlog');
const { sanitizeLinks, sanitizeVideos, sanitizeTheme, sanitizeWidgets, sanitizeLayout } = require('../utils/profileExtras');
const { optimizeDataUri } = require('../utils/optimizeImage');

const router = express.Router();

// GET /api/users/me
router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/users/me - actualizar perfil (apodo, avatar, color, intereses, bio)
router.patch('/me', auth, async (req, res) => {
  try {
    const { nickname, avatar, nameColor, status, interests, statusMessage, profileAccent, bio } = req.body;
    const updates = {};

    if (nickname) updates.nickname = nickname.trim().slice(0, 20);
    if (avatar) {
      if (!AVATARS.includes(avatar)) {
        return res.status(400).json({ error: 'Avatar inválido.' });
      }
      updates.avatar = avatar;
    }
    if (nameColor) updates.nameColor = nameColor;
    if (status && ['online', 'away'].includes(status)) updates.status = status;
    if (typeof statusMessage === 'string') updates.statusMessage = statusMessage.trim().slice(0, 100);
    if (typeof profileAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(profileAccent)) {
      updates.profileAccent = profileAccent;
    }
    if (typeof bio === 'string') updates.bio = bio.trim().slice(0, 500);
    if (interests) {
      if (!Array.isArray(interests)) {
        return res.status(400).json({ error: 'Los intereses deben ser una lista.' });
      }
      const invalid = interests.filter((i) => !INTERESTS.includes(i));
      if (invalid.length > 0) {
        return res.status(400).json({ error: 'Hay intereses inválidos en la lista.' });
      }
      updates.interests = interests;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
      .select('-password -otpCode');

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar perfil.' });
  }
});

// ---------- Foto de perfil real (JPEG o GIF) ----------
// Se recibe como Data URI base64 ya redimensionada/comprimida por el
// cliente, y además se vuelve a optimizar en el servidor (ver
// utils/optimizeImage.js) para ahorrar espacio en MongoDB.
const MAX_PHOTO_BASE64_LENGTH = 2_800_000; // ~2MB de imagen real en base64 (límite de entrada, antes de optimizar)

// PATCH /api/users/me/photo - subir/reemplazar foto de perfil
router.patch('/me/photo', auth, async (req, res) => {
  try {
    const { photo } = req.body;
    if (!photo || typeof photo !== 'string') {
      return res.status(400).json({ error: 'Falta la imagen.' });
    }

    const match = /^data:image\/(jpeg|gif);base64,/.exec(photo);
    if (!match) {
      return res.status(400).json({ error: 'Solo se aceptan imágenes JPEG o GIF.' });
    }
    if (photo.length > MAX_PHOTO_BASE64_LENGTH) {
      return res.status(400).json({ error: 'La imagen es demasiado grande (máx. ~2MB).' });
    }

    // Re-comprimimos en el servidor (además del resize del cliente) para
    // ahorrar espacio en MongoDB sin depender solo del navegador.
    const optimizedPhoto = await optimizeDataUri(photo, 320);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePhoto: optimizedPhoto },
      { new: true }
    ).select('-password -otpCode');

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al subir la foto de perfil.' });
  }
});

// DELETE /api/users/me/photo - quitar la foto y volver al avatar emoji
router.delete('/me/photo', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePhoto: null },
      { new: true }
    ).select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al quitar la foto de perfil.' });
  }
});

// ---------- Banner del perfil (imagen ancha tipo "cover photo") ----------
// Mismo esquema que la foto de perfil: Data URI base64, JPEG o GIF.
const MAX_IMAGE_BASE64_LENGTH = 2_800_000; // ~2MB de imagen real en base64

// PATCH /api/users/me/banner - subir/reemplazar banner del perfil
router.patch('/me/banner', auth, async (req, res) => {
  try {
    const { banner } = req.body;
    if (!banner || typeof banner !== 'string') {
      return res.status(400).json({ error: 'Falta la imagen del banner.' });
    }

    const match = /^data:image\/(jpeg|gif);base64,/.exec(banner);
    if (!match) {
      return res.status(400).json({ error: 'Solo se aceptan imágenes JPEG o GIF.' });
    }
    if (banner.length > MAX_IMAGE_BASE64_LENGTH) {
      return res.status(400).json({ error: 'La imagen es demasiado grande (máx. ~2MB).' });
    }

    const optimizedBanner = await optimizeDataUri(banner, 900);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { banner: optimizedBanner },
      { new: true }
    ).select('-password -otpCode');

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al subir el banner.' });
  }
});

// DELETE /api/users/me/banner - quitar el banner
router.delete('/me/banner', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { banner: null },
      { new: true }
    ).select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al quitar el banner.' });
  }
});

// ---------- Fondo personalizado del perfil (imagen o GIF) ----------
// Se aplica como fondo de la página pública de perfil (public/profile.html).

// PATCH /api/users/me/background - subir/reemplazar fondo personalizado
router.patch('/me/background', auth, async (req, res) => {
  try {
    const { background } = req.body;
    if (!background || typeof background !== 'string') {
      return res.status(400).json({ error: 'Falta la imagen de fondo.' });
    }

    const match = /^data:image\/(jpeg|gif);base64,/.exec(background);
    if (!match) {
      return res.status(400).json({ error: 'Solo se aceptan imágenes JPEG o GIF.' });
    }
    if (background.length > MAX_IMAGE_BASE64_LENGTH) {
      return res.status(400).json({ error: 'La imagen es demasiado grande (máx. ~2MB).' });
    }

    const optimizedBackground = await optimizeDataUri(background, 1400);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profileBackground: optimizedBackground },
      { new: true }
    ).select('-password -otpCode');

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al subir el fondo personalizado.' });
  }
});

// DELETE /api/users/me/background - quitar el fondo personalizado
router.delete('/me/background', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profileBackground: null },
      { new: true }
    ).select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al quitar el fondo personalizado.' });
  }
});

// ---------- Links personalizados ----------
// PATCH /api/users/me/links - reemplaza la lista completa de links (máx. 6)
router.patch('/me/links', auth, async (req, res) => {
  try {
    const links = sanitizeLinks(req.body.links);
    const user = await User.findByIdAndUpdate(req.user._id, { links }, { new: true })
      .select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al guardar los links.' });
  }
});

// ---------- Videos de YouTube ----------
// PATCH /api/users/me/videos - reemplaza la lista completa de videos (máx. 6)
router.patch('/me/videos', auth, async (req, res) => {
  try {
    const videos = sanitizeVideos(req.body.videos);
    const user = await User.findByIdAndUpdate(req.user._id, { videos }, { new: true })
      .select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al guardar los videos.' });
  }
});

// ---------- Estilo/tema personalizado del perfil (estilo Neocities/MySpace) ----------
// PATCH /api/users/me/theme - guarda colores, tipografía, bordes, sombras y animación
router.patch('/me/theme', auth, async (req, res) => {
  try {
    const theme = sanitizeTheme(req.body.theme);
    const user = await User.findByIdAndUpdate(req.user._id, { theme }, { new: true })
      .select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al guardar el estilo del perfil.' });
  }
});

// ---------- Widgets/cajas de contenido personalizables ----------
// PATCH /api/users/me/widgets - reemplaza la lista completa de widgets (máx. 8)
router.patch('/me/widgets', auth, async (req, res) => {
  try {
    const widgets = sanitizeWidgets(req.body.widgets);
    const user = await User.findByIdAndUpdate(req.user._id, { widgets }, { new: true })
      .select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al guardar los widgets.' });
  }
});

// ---------- Orden de las secciones del perfil ----------
// PATCH /api/users/me/layout - guarda el orden en que se muestran las secciones
router.patch('/me/layout', auth, async (req, res) => {
  try {
    const layout = sanitizeLayout(req.body.layout);
    const user = await User.findByIdAndUpdate(req.user._id, { layout }, { new: true })
      .select('-password -otpCode');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al guardar el orden del perfil.' });
  }
});

// ---------- Blog personal (estilo Neocities) ----------
// PATCH /api/users/me/blog - guardar título/HTML/CSS y visibilidad
router.patch('/me/blog', auth, async (req, res) => {
  try {
    const { title, html, css, isPublic } = req.body;

    const updates = {
      'blog.title': (title || '').toString().trim().slice(0, 60),
      'blog.html': sanitizeBlogHtml((html || '').toString()).slice(0, 20000),
      'blog.css': sanitizeBlogCss((css || '').toString()).slice(0, 8000),
      'blog.isPublic': Boolean(isPublic),
      'blog.updatedAt': new Date()
    };

    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true })
      .select('-password -otpCode');

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar tu página personal.' });
  }
});

// GET /api/users/avatars - lista de avatares disponibles
router.get('/avatars', auth, (req, res) => {
  res.json({ avatars: AVATARS });
});

// GET /api/users/recommendations - personas con intereses similares
// Ordena por cantidad de tags en común (mayor primero). Sin algoritmo complejo.
router.get('/recommendations', auth, async (req, res) => {
  try {
    const myInterests = req.user.interests || [];

    const users = await User.find({
      _id: { $ne: req.user._id },
      isBanned: false
    }).select('nickname avatar profilePhoto nameColor status statusMessage interests');

    const recommendations = users
      .map((u) => {
        const sharedTags = (u.interests || []).filter((i) => myInterests.includes(i));
        return {
          _id: u._id,
          nickname: u.nickname,
          avatar: u.avatar,
          profilePhoto: u.profilePhoto,
          nameColor: u.nameColor,
          status: u.status,
          statusMessage: u.statusMessage,
          sharedTags,
          sharedCount: sharedTags.length
        };
      })
      .filter((entry) => entry.sharedCount > 0)
      .sort((a, b) => b.sharedCount - a.sharedCount)
      .slice(0, 10);

    res.json({ recommendations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener recomendaciones.' });
  }
});

// GET /api/users/search?q=texto - buscar usuarios por apodo (para agregar amigos)
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ users: [] });
    }
    const users = await User.find({
      nickname: { $regex: q.trim(), $options: 'i' },
      _id: { $ne: req.user._id },
      isBanned: false
    })
      .select('nickname avatar profilePhoto nameColor status')
      .limit(15);

    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar usuarios.' });
  }
});

// ---------- Perfil público completo ----------
// GET /api/users/:nickname/profile - datos de perfil ampliado de un usuario
// (banner, fondo, bio, links, videos, y si su blog es público). Se registra
// al final para no interferir con las rutas específicas de arriba (/me,
// /avatars, /recommendations, /search).
router.get('/:nickname/profile', auth, async (req, res) => {
  try {
    const user = await User.findOne({ nickname: req.params.nickname, isBanned: false }).select(
      'nickname avatar profilePhoto banner profileBackground nameColor statusMessage bio links videos blog theme widgets layout createdAt'
    );

    if (!user) {
      return res.status(404).json({ error: 'Este usuario no existe.' });
    }

    res.json({
      profile: {
        nickname: user.nickname,
        avatar: user.avatar,
        profilePhoto: user.profilePhoto,
        banner: user.banner,
        profileBackground: user.profileBackground,
        nameColor: user.nameColor,
        statusMessage: user.statusMessage,
        bio: user.bio,
        links: user.links || [],
        videos: user.videos || [],
        blogIsPublic: Boolean(user.blog && user.blog.isPublic),
        blogTitle: user.blog && user.blog.title,
        theme: user.theme,
        widgets: user.widgets || [],
        layout: user.layout && user.layout.length ? user.layout : ['bio', 'links', 'videos', 'widgets', 'blog'],
        memberSince: user.createdAt
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

module.exports = router;