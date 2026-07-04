const mongoose = require('mongoose');
const INTERESTS = require('../utils/interests');

const AVATARS = [
  'avatar1.png', 'avatar2.png', 'avatar3.png', 'avatar4.png',
  'avatar5.png', 'avatar6.png', 'avatar7.png', 'avatar8.png'
];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },
    avatar: {
      type: String,
      default: AVATARS[0],
      enum: AVATARS
    },
    // Foto de perfil real (JPEG o GIF), guardada como Data URI en base64.
    // Si existe, se muestra en vez del emoji de `avatar`. Null = sin foto.
    profilePhoto: {
      type: String,
      default: null
    },
    // Banner del perfil (imagen ancha tipo "cover photo"), Data URI base64.
    banner: {
      type: String,
      default: null
    },
    // Fondo personalizado (imagen o GIF) para la página pública de perfil.
    profileBackground: {
      type: String,
      default: null
    },
    // Biografía corta del usuario.
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    // Links personalizados (etiqueta + URL), validados en routes/users.js.
    links: {
      type: [
        {
          _id: false,
          label: { type: String, trim: true, maxlength: 30 },
          url: { type: String, trim: true, maxlength: 300 }
        }
      ],
      default: []
    },
    // Videos de YouTube (solo se guarda el ID extraído + la URL original).
    videos: {
      type: [
        {
          _id: false,
          url: { type: String, trim: true, maxlength: 300 },
          videoId: { type: String, trim: true, maxlength: 20 }
        }
      ],
      default: []
    },
    nameColor: {
      type: String,
      default: '#0066cc'
    },
    // "Mensaje personal" al estilo MSN, se muestra bajo el apodo.
    statusMessage: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },
    // Color de acento para personalizar el panel de perfil propio.
    profileAccent: {
      type: String,
      default: '#2f63d6'
    },
    // Mini sitio personal al estilo Neocities. Se renderiza siempre dentro
    // de un iframe con sandbox estricto (sin JavaScript) por seguridad.
    blog: {
      title: { type: String, trim: true, maxlength: 60, default: '' },
      html: { type: String, maxlength: 20000, default: '' },
      css: { type: String, maxlength: 8000, default: '' },
      isPublic: { type: Boolean, default: false },
      updatedAt: Date
    },
    // ---- Personalización avanzada del perfil público (estilo Neocities/MySpace) ----
    theme: {
      bgColor: { type: String, default: '#e8eef7' },
      cardBgColor: { type: String, default: '#ffffff' },
      textColor: { type: String, default: '#222222' },
      linkColor: { type: String, default: '#1d4cc0' },
      borderColor: { type: String, default: '#c7d3e8' },
      fontFamily: {
        type: String,
        enum: ['system', 'serif', 'mono', 'comic', 'fantasy', 'cursive'],
        default: 'system'
      },
      borderStyle: {
        type: String,
        enum: ['solid', 'dashed', 'dotted', 'double', 'groove', 'none'],
        default: 'solid'
      },
      borderWidth: { type: Number, min: 0, max: 12, default: 1 },
      borderRadius: { type: Number, min: 0, max: 40, default: 10 },
      cardOpacity: { type: Number, min: 0.3, max: 1, default: 1 },
      boxShadow: { type: String, enum: ['none', 'soft', 'hard', 'glow'], default: 'soft' },
      backgroundEffect: { type: String, enum: ['none', 'gradient', 'stars', 'stripes'], default: 'none' },
      animation: { type: String, enum: ['none', 'fadein', 'rainbow', 'pulse', 'sparkle'], default: 'none' }
    },
    // Widgets/cajas de contenido personalizables (estilo "módulos" de MySpace).
    // `content` se sanitiza igual que el HTML del blog (defensa en profundidad,
    // ya que también se renderiza dentro de un iframe sandbox sin scripts).
    widgets: {
      type: [
        {
          _id: false,
          title: { type: String, trim: true, maxlength: 40, default: '' },
          icon: { type: String, trim: true, maxlength: 4, default: '📌' },
          color: { type: String, default: '#ffffff' },
          content: { type: String, maxlength: 4000, default: '' }
        }
      ],
      default: []
    },
    // Orden de las secciones del perfil público. El usuario puede reorganizarlas.
    layout: {
      type: [String],
      default: ['bio', 'links', 'videos', 'widgets', 'blog']
    },
    status: {
      type: String,
      enum: ['online', 'away', 'offline'],
      default: 'offline'
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin'],
      default: 'user'
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    isBanned: {
      type: Boolean,
      default: false
    },
    otpCode: String,
    otpExpiresAt: Date,
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    interests: {
      type: [{ type: String, enum: INTERESTS }],
      default: []
    },
    lastSeen: Date
  },
  { timestamps: true }
);

// NOTA: no declarar aquí un índice adicional para `email`. El campo ya
// tiene `unique: true` arriba, lo que crea su propio índice único. Un
// segundo `schema.index({ email: 1 })` entra en conflicto con ese índice
// (IndexOptionsConflict) y puede hacer que Mongo falle al construirlo,
// dejando el email SIN restricción de unicidad real: eso permite que
// existan dos documentos con el mismo correo (uno verificado y otro no),
// que es exactamente el bug de "login dice no verificado pero en la DB
// se ve verificado" — cada consulta puede estar mirando un documento
// distinto para el mismo email.

module.exports = mongoose.model('User', userSchema);
module.exports.AVATARS = AVATARS;