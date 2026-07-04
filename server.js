require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const seedDatabase = require('./utils/seed');
const { initSockets } = require('./sockets');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const friendRoutes = require('./routes/friends');
const chatRoutes = require('./routes/chats');
const roomRoutes = require('./routes/rooms');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');

const app = express();

// Render (y la mayoría de PaaS) sirven la app detrás de un proxy inverso.
// Esto permite que Express detecte correctamente HTTPS/IP real.
app.set('trust proxy', 1);

const server = http.createServer(app);

// ---------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------
// Por defecto el frontend se sirve desde el mismo dominio que el backend
// (todo en un único servicio de Render), así que no haría falta CORS.
// Pero para no romper despliegues donde el frontend vive en otro dominio
// (por ejemplo Netlify, ver netlify.toml / public/js/config.js), se
// refleja el origin de la petición en vez de usar '*'. No se usan
// cookies para autenticación (el JWT viaja en el header Authorization),
// así que esto es seguro y evita bloqueos de credenciales cruzadas.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Peticiones sin header Origin (curl, apps móviles, health checks) o
    // sin restricción configurada: se permiten todas.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
};

app.use(cors(corsOptions));

// Límite elevado porque las fotos de perfil se envían como Data URI
// (base64) dentro del JSON; el resto de la app usa payloads pequeños.
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Si el JSON del body viene mal formado, express-json lanza un error que
// por defecto terminaba como un 500 genérico. Lo convertimos en un 400
// claro para no confundirlo con un fallo real del servidor.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en la petición.' });
  }
  next(err);
});

// Endpoint simple de salud, útil para Render y para depurar despliegues.
// Se registra ANTES del middleware de "readiness" a propósito: debe
// responder 200 siempre que el proceso esté vivo, incluso si Mongo
// todavía está conectando, para que el healthcheck de Render no marque
// el despliegue como fallido durante el arranque en frío.
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'connecting'
  });
});

// ---------------------------------------------------------------------
// Readiness: mientras Mongo no esté conectado (arranque en frío típico
// de Render Free + Atlas), las rutas de la API responden 503 con un
// mensaje claro en vez de fallar con un 500 confuso o quedarse colgadas.
// ---------------------------------------------------------------------
app.use('/api', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'El servidor se está iniciando (plan gratuito). Intenta nuevamente en unos segundos.'
    });
  }
  next();
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/blog', blogRoutes);

// Fallback para servir el frontend
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta no encontrada.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejador de errores de último recurso: evita que un throw no
// controlado tumbe la petición sin dar respuesta JSON al frontend.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const io = new Server(server, {
  cors: corsOptions
});
initSockets(io);

const PORT = process.env.PORT || 3000;

// El servidor HTTP escucha de inmediato: así Render considera el deploy
// exitoso aunque MongoDB tarde unos segundos más en conectar (típico en
// planes gratuitos). La conexión a Mongo y el seed corren en paralelo.
server.listen(PORT, () => {
  console.log(`🚀 LBMessenger corriendo en http://localhost:${PORT}`);
});

connectDB();

mongoose.connection.once('connected', () => {
  seedDatabase().catch((err) => {
    console.error('❌ Error al inicializar datos por defecto (salas/superadmin):', err.message);
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
