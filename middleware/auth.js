const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'No autorizado. Token faltante.' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET no esta configurado en las variables de entorno.');
      return res.status(500).json({ error: 'Error de configuracion del servidor.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -otpCode');

    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Tu cuenta ha sido suspendida.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Tu sesion expiro. Inicia sesion nuevamente.' });
    }
    return res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}

module.exports = authMiddleware;