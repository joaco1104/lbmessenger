const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Room = require('../models/Room');

const DEFAULT_ROOMS = [
  { name: 'General del Liceo', slug: 'general', icon: '🏫', isGlobal: true, description: 'Chat general para todos los estudiantes.', tags: [] },
  { name: 'K-pop', slug: 'kpop', icon: '🎤', description: 'Para hablar de tus grupos y comebacks favoritos.', tags: ['K-pop'] },
  { name: 'Programación', slug: 'programacion', icon: '💻', description: 'Código, proyectos y dudas técnicas.', tags: ['Programación', 'Tecnología'] },
  { name: 'Música', slug: 'musica', icon: '🎵', description: 'Comparte y descubre música.', tags: ['Música', 'Rock', 'Metal'] },
  { name: 'Gaming', slug: 'gaming', icon: '🎮', description: 'Videojuegos, builds y squads.', tags: ['Gaming', 'Videojuegos', 'Roblox', 'Minecraft'] }
];

async function seedRooms() {
  for (const room of DEFAULT_ROOMS) {
    await Room.findOneAndUpdate(
      { slug: room.slug },
      room,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log('✅ Salas por defecto verificadas/creadas');
}

async function seedSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const nickname = process.env.SUPERADMIN_NICKNAME || 'SuperAdmin';

  if (!email || !password) {
    console.warn('⚠️ SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD no definidos en .env');
    return;
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    // Autorreparación: se ejecuta en cada arranque (no solo la primera vez
    // que se promueve), así cualquier inconsistencia entre el rol y el
    // estado de verificación/bloqueo del superadmin se corrige sola en el
    // próximo deploy en vez de quedar "atascada" para siempre. Antes,
    // si `role` ya era 'superadmin', esta rama nunca se ejecutaba y un
    // isVerified:false accidental (o un ban accidental) nunca se corregía.
    const needsFix =
      existing.role !== 'superadmin' ||
      !existing.isVerified ||
      existing.isBanned;

    if (needsFix) {
      existing.role = 'superadmin';
      existing.isVerified = true;
      existing.isBanned = false;
      await existing.save();
      console.log('✅ Cuenta superadmin verificada/reparada:', email);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await User.create({
    email: email.toLowerCase(),
    password: hashedPassword,
    nickname,
    role: 'superadmin',
    isVerified: true
  });
  console.log('✅ Superadmin creado:', email);
}

async function seedDatabase() {
  await seedRooms();
  await seedSuperAdmin();
}

module.exports = seedDatabase;