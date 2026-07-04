// Extrae el ID de un video de YouTube a partir de un enlace pegado por el
// usuario. Soporta youtube.com/watch?v=, youtu.be/, youtube.com/embed/ y
// youtube.com/shorts/. Devuelve null si el enlace no es válido.
// (Debe coincidir con la validación equivalente en utils/profileExtras.js del backend).
const YOUTUBE_ID_REGEX =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = YOUTUBE_ID_REGEX.exec(url.trim());
  return match ? match[1] : null;
}

// HTML de una miniatura clicable (para listas de administración de videos
// en el panel de perfil, donde no queremos cargar el iframe pesado).
function youtubeThumbnailHtml(videoId) {
  return `<img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="Miniatura del video" class="video-thumb" />`;
}

// HTML del iframe embebido real (usado en la página de perfil pública).
// Usa youtube-nocookie.com para reducir el uso de cookies de seguimiento.
function youtubeEmbedHtml(videoId) {
  return `<div class="video-embed-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="Video de YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
}
