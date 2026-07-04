const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const generateOTP = require('../utils/generateOTP');
const { sendOTPEmail } = require('../utils/mailer');

const router = express.Router();

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'educacionvillarrica.cl';

// REQUIRE_INSTITUTIONAL_EMAIL=false permite desactivar temporalmente la
// restricción de dominio (útil en desarrollo). Si no está definida, o si
// vale "true", la restricción queda activa (comportamiento seguro por
// defecto para producción).
const REQUIRE_INSTITUTIONAL_EMAIL = process.env.REQUIRE_INSTITUTIONAL_EMAIL !== 'false';

function isValidInstitutionalEmail(email) {
  if (typeof email !== 'string') return false;
  if (!REQUIRE_INSTITUTIONAL_EMAIL) return true;
  const domain = email.split('@')[1];
  return domain && domain.toLowerCase() === ALLOWED_DOMAIN.toLowerCase();
}

function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no está configurado en las variables de entorno.');
  }
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
// Crea el usuario sin verificar y envía el código OTP
router.post('/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email || !password || !nickname) {
      return res.status(400).json({ error: 'Email, contraseña y apodo son obligatorios.' });
    }

    if (!isValidInstitutionalEmail(email)) {
      return res.status(400).json({ error: `Solo se permiten correos @${ALLOWED_DOMAIN}` });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.isVerified) {
      return res.status(409).json({ error: 'Ya existe una cuenta verificada con este correo.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otpCode = generateOTP();
    const otpExpiresAt = new Date(
      Date.now() + (Number(process.env.OTP_EXPIRES_MINUTES) || 10) * 60 * 1000
    );

    let user;
    if (existing && !existing.isVerified) {
      // Reintento de registro: actualiza datos y reenvía OTP
      existing.password = hashedPassword;
      existing.nickname = nickname;
      existing.otpCode = otpCode;
      existing.otpExpiresAt = otpExpiresAt;
      user = await existing.save();
    } else {
      try {
        user = await User.create({
          email: email.toLowerCase(),
          password: hashedPassword,
          nickname,
          otpCode,
          otpExpiresAt
        });
      } catch (createErr) {
        // Condición de carrera: dos registros casi simultáneos con el mismo
        // correo (doble clic, reintento de red) pueden pasar ambos el
        // `findOne` de arriba antes de que exista el documento. El índice
        // único de `email` rechaza el segundo `create` con error 11000.
        // En vez de un 500 confuso, recuperamos la cuenta que ya se creó
        // y seguimos el flujo normal en vez de dejar dos documentos
        // inconsistentes (uno verificado, otro no) para el mismo email.
        if (createErr.code === 11000) {
          const winner = await User.findOne({ email: email.toLowerCase() });
          if (winner && winner.isVerified) {
            return res.status(409).json({ error: 'Ya existe una cuenta verificada con este correo.' });
          }
          if (winner) {
            winner.password = hashedPassword;
            winner.nickname = nickname;
            winner.otpCode = otpCode;
            winner.otpExpiresAt = otpExpiresAt;
            user = await winner.save();
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }
    }

    // El envío del correo se maneja aparte de la creación del usuario:
    // si el proveedor de email (Resend) falla o tarda demasiado, la
    // cuenta ya quedó creada y el usuario puede
    // pedir que se reenvíe el código con /resend-otp, en vez de recibir
    // un error 500 que sugiere que el registro completo falló.
    let emailSent = true;
    try {
      await sendOTPEmail(user.email, otpCode);
    } catch (mailErr) {
      emailSent = false;
      console.error('No se pudo enviar el correo OTP:', mailErr.message);
    }

    res.status(201).json({
      message: emailSent
        ? 'Cuenta creada. Revisa tu correo institucional para verificar tu cuenta.'
        : 'Cuenta creada, pero no pudimos enviar el correo con el codigo. Usa "Reenviar codigo" para intentarlo de nuevo.',
      email: user.email,
      emailSent
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario.' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email y código son obligatorios.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.isVerified) return res.status(400).json({ error: 'La cuenta ya está verificada.' });

    if (user.otpCode !== code) {
      return res.status(400).json({ error: 'Código incorrecto.' });
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' });
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    const token = signToken(user);

    res.json({
      message: 'Cuenta verificada correctamente.',
      token,
      user: {
        id: user._id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar el código.' });
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.isVerified) return res.status(400).json({ error: 'La cuenta ya está verificada.' });

    const otpCode = generateOTP();
    user.otpCode = otpCode;
    user.otpExpiresAt = new Date(
      Date.now() + (Number(process.env.OTP_EXPIRES_MINUTES) || 10) * 60 * 1000
    );
    await user.save();

    try {
      await sendOTPEmail(user.email, otpCode);
    } catch (mailErr) {
      console.error('No se pudo reenviar el correo OTP:', mailErr.message);
      return res.status(502).json({ error: 'No se pudo enviar el correo en este momento. Intenta nuevamente en unos segundos.' });
    }

    res.json({ message: 'Código reenviado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reenviar el código.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Debes verificar tu cuenta antes de iniciar sesión.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Tu cuenta ha sido suspendida.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas.' });

    user.status = 'online';
    user.lastSeen = new Date();
    await user.save();

    const token = signToken(user);

    res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: {
        id: user._id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        nameColor: user.nameColor,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

module.exports = router;
