function requireAdmin(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso restringido a administradores.' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acceso restringido al superadmin.' });
  }
  next();
}

module.exports = { requireAdmin, requireSuperAdmin };
