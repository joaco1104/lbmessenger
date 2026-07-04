// Utilidades de validación para las nuevas secciones del perfil:
// links personalizados y videos de YouTube insertados por URL.

const { sanitizeBlogHtml } = require('./sanitizeBlog');

const MAX_LINKS = 6;
const MAX_VIDEOS = 6;
const MAX_WIDGETS = 8;

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const THEME_DEFAULTS = {
  bgColor: '#e8eef7',
  cardBgColor: '#ffffff',
  textColor: '#222222',
  linkColor: '#1d4cc0',
  borderColor: '#c7d3e8',
  fontFamily: 'system',
  borderStyle: 'solid',
  borderWidth: 1,
  borderRadius: 10,
  cardOpacity: 1,
  boxShadow: 'soft',
  backgroundEffect: 'none',
  animation: 'none'
};
const THEME_ENUMS = {
  fontFamily: ['system', 'serif', 'mono', 'comic', 'fantasy', 'cursive'],
  borderStyle: ['solid', 'dashed', 'dotted', 'double', 'groove', 'none'],
  boxShadow: ['none', 'soft', 'hard', 'glow'],
  backgroundEffect: ['none', 'gradient', 'stars', 'stripes'],
  animation: ['none', 'fadein', 'rainbow', 'pulse', 'sparkle']
};
const LAYOUT_SECTIONS = ['bio', 'links', 'videos', 'widgets', 'blog'];

// Acepta youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
// youtube.com/shorts/ID y m.youtube.com, con o sin parámetros extra.
const YOUTUBE_ID_REGEX =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = YOUTUBE_ID_REGEX.exec(url.trim());
  return match ? match[1] : null;
}

function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

// Valida y normaliza la lista de links personalizados recibida del cliente.
// Lanza un Error con mensaje amigable si algo no es válido.
function sanitizeLinks(rawLinks) {
  if (!Array.isArray(rawLinks)) {
    throw new Error('Los links deben ser una lista.');
  }
  if (rawLinks.length > MAX_LINKS) {
    throw new Error(`Puedes agregar hasta ${MAX_LINKS} links.`);
  }
  return rawLinks.map((item) => {
    const label = (item?.label || '').toString().trim().slice(0, 30);
    const url = (item?.url || '').toString().trim().slice(0, 300);
    if (!label) throw new Error('Cada link necesita un nombre.');
    if (!isValidHttpUrl(url)) {
      throw new Error(`El link "${label}" no es una URL válida (debe empezar con http:// o https://).`);
    }
    return { label, url };
  });
}

// Valida y normaliza la lista de videos de YouTube recibida del cliente.
function sanitizeVideos(rawVideos) {
  if (!Array.isArray(rawVideos)) {
    throw new Error('Los videos deben ser una lista.');
  }
  if (rawVideos.length > MAX_VIDEOS) {
    throw new Error(`Puedes agregar hasta ${MAX_VIDEOS} videos.`);
  }
  return rawVideos.map((item) => {
    const url = (item?.url || '').toString().trim().slice(0, 300);
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      throw new Error('Ese enlace no parece ser un video válido de YouTube.');
    }
    return { url, videoId };
  });
}

// Valida y normaliza el objeto de estilo del perfil (colores, tipografía,
// bordes, transparencia, sombras y animaciones). Cualquier valor inválido o
// ausente cae de vuelta a su default, así el perfil nunca queda roto.
function sanitizeTheme(rawTheme) {
  const input = rawTheme && typeof rawTheme === 'object' ? rawTheme : {};
  const theme = { ...THEME_DEFAULTS };

  ['bgColor', 'cardBgColor', 'textColor', 'linkColor', 'borderColor'].forEach((key) => {
    if (typeof input[key] === 'string' && HEX_COLOR_REGEX.test(input[key])) {
      theme[key] = input[key];
    }
  });

  Object.keys(THEME_ENUMS).forEach((key) => {
    if (THEME_ENUMS[key].includes(input[key])) theme[key] = input[key];
  });

  const borderWidth = Number(input.borderWidth);
  if (Number.isFinite(borderWidth)) theme.borderWidth = Math.min(12, Math.max(0, borderWidth));

  const borderRadius = Number(input.borderRadius);
  if (Number.isFinite(borderRadius)) theme.borderRadius = Math.min(40, Math.max(0, borderRadius));

  const cardOpacity = Number(input.cardOpacity);
  if (Number.isFinite(cardOpacity)) theme.cardOpacity = Math.min(1, Math.max(0.3, cardOpacity));

  return theme;
}

// Valida y normaliza los widgets/cajas de contenido personalizables. El
// contenido pasa por el mismo sanitizador del blog (se muestra también en
// un iframe sandbox sin scripts).
function sanitizeWidgets(rawWidgets) {
  if (!Array.isArray(rawWidgets)) {
    throw new Error('Los widgets deben ser una lista.');
  }
  if (rawWidgets.length > MAX_WIDGETS) {
    throw new Error(`Puedes agregar hasta ${MAX_WIDGETS} widgets.`);
  }
  return rawWidgets.map((item) => ({
    title: (item?.title || '').toString().trim().slice(0, 40),
    icon: (item?.icon || '📌').toString().trim().slice(0, 4) || '📌',
    color: HEX_COLOR_REGEX.test(item?.color) ? item.color : '#ffffff',
    content: sanitizeBlogHtml((item?.content || '').toString()).slice(0, 4000)
  }));
}

// Valida el orden de secciones del perfil: debe contener exactamente las
// secciones conocidas, sin repetir ni inventar nombres nuevos.
function sanitizeLayout(rawLayout) {
  if (!Array.isArray(rawLayout)) {
    throw new Error('El orden del perfil debe ser una lista.');
  }
  const cleaned = rawLayout.filter((key) => LAYOUT_SECTIONS.includes(key));
  const unique = [...new Set(cleaned)];
  LAYOUT_SECTIONS.forEach((key) => {
    if (!unique.includes(key)) unique.push(key);
  });
  return unique;
}

module.exports = {
  MAX_LINKS,
  MAX_VIDEOS,
  MAX_WIDGETS,
  LAYOUT_SECTIONS,
  extractYouTubeId,
  isValidHttpUrl,
  sanitizeLinks,
  sanitizeVideos,
  sanitizeTheme,
  sanitizeWidgets,
  sanitizeLayout
};
