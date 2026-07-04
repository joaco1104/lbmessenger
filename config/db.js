const mongoose = require('mongoose');

// ---------------------------------------------------------------------
// Conexión a MongoDB pensada para Render Free + MongoDB Atlas (M0):
//
// - Render Free "duerme" el servicio tras inactividad y tarda ~30-60s en
//   despertar. Un clúster M0 de Atlas también puede tardar unos segundos
//   en responder tras estar inactivo.
// - Antes, si la primera conexión fallaba, el proceso se mataba con
//   `process.exit(1)`, lo que provocaba un ciclo de reinicios en Render
//   (el servicio nunca terminaba de levantar y todas las rutas devolvían
//   502/503, que en el navegador se percibía como errores 500 aleatorios).
//
// Ahora: reintenta la conexión indefinidamente con backoff, sin tumbar
// el proceso, y expone el estado real de la conexión para que el resto
// del backend pueda responder con un mensaje claro mientras conecta.
// ---------------------------------------------------------------------

const RETRY_DELAY_MS = 5000;

mongoose.set('bufferCommands', false); // evita que las queries se queden "colgadas" en silencio

function isConnected() {
  return mongoose.connection.readyState === 1; // 1 = connected
}

async function connectWithRetry() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000
    });
    console.log('✅ MongoDB conectado');
  } catch (err) {
    console.error(`❌ Error conectando a MongoDB: ${err.message}`);
    console.error(`↻ Reintentando en ${RETRY_DELAY_MS / 1000}s...`);
    setTimeout(connectWithRetry, RETRY_DELAY_MS);
  }
}

function connectDB() {
  if (!process.env.MONGO_URI) {
    console.error('❌ Falta la variable de entorno MONGO_URI.');
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB desconectado. Intentando reconectar...');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconectado');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ Error de MongoDB:', err.message);
  });

  // No se espera (await) esta promesa a propósito: el servidor HTTP debe
  // levantar de inmediato para que Render marque el deploy como saludable
  // aunque la base de datos tarde unos segundos más en conectar.
  return connectWithRetry();
}

module.exports = connectDB;
module.exports.isConnected = isConnected;
