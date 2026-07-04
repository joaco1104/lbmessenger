// Sanitización básica del HTML/CSS del "blog" personal (estilo Neocities).
//
// Esta es una capa adicional de seguridad (defensa en profundidad). La
// protección principal es que el blog SIEMPRE se muestra dentro de un
// <iframe sandbox=""> sin permisos de script (ver public/blog.html), lo
// que impide que cualquier JavaScript se ejecute sin importar lo que el
// usuario haya escrito. Aun así, quitamos aquí las etiquetas y atributos
// más peligrosos por si el contenido se reutiliza en otro contexto.

function sanitizeBlogHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\s*script\b[^>]*>/gi, '')
    .replace(/<\s*\/?\s*(iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function sanitizeBlogCss(css) {
  if (!css) return '';
  return String(css)
    .replace(/javascript\s*:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/@import/gi, '');
}

module.exports = { sanitizeBlogHtml, sanitizeBlogCss };
