const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Room = require('../models/Room');

// Mapa en memoria: userId -> socketId (para saber quién está online y notificar)
const onlineUsers = new Map();

// Mapa en memoria: chatId -> timestamp del último zumbido enviado en ese chat
// (evita spam de zumbidos; se resetea si el servidor se reinicia, sin problema).
const lastNudgeAt = new Map();
const NUDGE_COOLDOWN_MS = 8000;

function initSockets(io) {
  // Middleware de autenticación del socket vía JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No autorizado.'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -otpCode');

      if (!user || user.isBanned) return next(new Error('No autorizado.'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Token inválido.'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = String(socket.user._id);
    onlineUsers.set(userId, socket.id);

    await User.findByIdAndUpdate(userId, { status: 'online', lastSeen: new Date() });
    socket.broadcast.emit('friend:status', { userId, status: 'online' });

    // Une al usuario a una "room" personal para recibir eventos dirigidos
    socket.join(`user:${userId}`);

    // Unirse a una sala temática (k-pop, programación, etc.)
    socket.on('room:join', (roomId) => {
      socket.join(`room:${roomId}`);
    });

    socket.on('room:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
    });

    // Mensaje en sala / chat global
    socket.on('room:message', async ({ roomId, content }) => {
      try {
        if (!content || !content.trim()) return;
        const room = await Room.findById(roomId);
        if (!room) return;

        const message = await Message.create({
          room: roomId,
          sender: userId,
          content: content.trim().slice(0, 1000)
        });

        const populated = await message.populate('sender', 'nickname avatar profilePhoto nameColor');

        io.to(`room:${roomId}`).emit('room:message', {
          roomId,
          message: populated
        });
      } catch (err) {
        console.error('Error en room:message', err);
      }
    });

    // Mensaje privado 1 a 1
    socket.on('chat:message', async ({ chatId, content }) => {
      try {
        if (!content || !content.trim()) return;

        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.map(String).includes(userId)) return;

        const message = await Message.create({
          chat: chatId,
          sender: userId,
          content: content.trim().slice(0, 1000)
        });

        chat.lastMessage = message._id;
        chat.lastMessageAt = new Date();
        await chat.save();

        const populated = await message.populate('sender', 'nickname avatar profilePhoto nameColor');

        // Envía a ambos participantes (cada uno tiene su "room" personal)
        chat.participants.forEach((participantId) => {
          io.to(`user:${participantId}`).emit('chat:message', {
            chatId,
            message: populated
          });
        });
      } catch (err) {
        console.error('Error en chat:message', err);
      }
    });

    // Indicador de "está escribiendo..."
    socket.on('chat:typing', ({ chatId, toUserId }) => {
      io.to(`user:${toUserId}`).emit('chat:typing', {
        chatId,
        fromUserId: userId,
        nickname: socket.user.nickname
      });
    });

    // "Zumbido" (nudge) al estilo MSN: sacude la ventana de conversación
    // del destinatario y reproduce un sonido. Solo entre amigos con un
    // chat 1 a 1 existente, y con un pequeño cooldown para evitar spam.
    socket.on('chat:nudge', async ({ chatId, toUserId }) => {
      try {
        if (!chatId || !toUserId) return;

        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.map(String).includes(userId)) return;
        if (!chat.participants.map(String).includes(String(toUserId))) return;

        const now = Date.now();
        const last = lastNudgeAt.get(String(chatId)) || 0;
        if (now - last < NUDGE_COOLDOWN_MS) return; // ignorado silenciosamente, ya se avisó en el cliente
        lastNudgeAt.set(String(chatId), now);

        io.to(`user:${toUserId}`).emit('chat:nudge', {
          chatId,
          fromUserId: userId,
          nickname: socket.user.nickname
        });
      } catch (err) {
        console.error('Error en chat:nudge', err);
      }
    });

    // Cambiar estado manualmente (online / ausente)
    socket.on('user:setStatus', async (status) => {
      if (!['online', 'away'].includes(status)) return;
      await User.findByIdAndUpdate(userId, { status });
      socket.broadcast.emit('friend:status', { userId, status });
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen: new Date() });
      socket.broadcast.emit('friend:status', { userId, status: 'offline' });
    });
  });
}

module.exports = { initSockets, onlineUsers };
