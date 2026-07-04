// ---------------------------------------------------------------------
// Configuración del frontend: a qué backend se conecta.
// ---------------------------------------------------------------------
// - Si sirves el frontend y el backend juntos desde el mismo servidor
//   (por ejemplo, todo en Render), deja esto en '' (string vacío):
//   las peticiones irán al mismo dominio automáticamente.
//
// - Si el frontend vive en Netlify y el backend en Render (dominios
//   distintos), pon aquí la URL completa de tu servicio de Render, SIN
//   slash final. Ejemplo:
//   const LBM_API_BASE = 'https://lbmessenger-backend.onrender.com';
// ---------------------------------------------------------------------
const LBM_API_BASE = '';

window.LBM_API_BASE = LBM_API_BASE;
