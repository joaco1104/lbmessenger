// Emoticonos clásicos al estilo de los mensajeros de los 2000: se escriben
// como "código de texto" (igual que en su momento) y se muestran como un
// emoji. Usamos emojis estándar de Unicode (no artwork de ninguna marca),
// por lo que se ven distinto según el dispositivo, tal como pasa con
// cualquier emoji normal.
//
// El orden importa: los códigos más largos/específicos van primero para
// que no los "coma" un código más corto (ej: ":-)" antes que ":)").
const EMOTICON_MAP = [
  ["(brokenheart)", "💔"],
  ["(heart)", "❤️"],
  ["(coffee)", "☕"],
  ["(music)", "🎵"],
  ["(movie)", "🎬"],
  ["(cake)", "🎂"],
  ["(beer)", "🍺"],
  ["(rose)", "🌹"],
  ["(star)", "⭐"],
  ["(sun)", "☀️"],
  ["(devil)", "😈"],
  ["(angel)", "😇"],
  ["(cool)", "😎"],
  ["(ok)", "👌"],
  [":')", "🥲"],
  [":'(", "😢"],
  [":-)", "🙂"],
  [":)", "🙂"],
  [":-D", "😄"],
  [":D", "😄"],
  [";-)", "😉"],
  [";)", "😉"],
  [":-P", "😛"],
  [":P", "😛"],
  [":-p", "😛"],
  [":p", "😛"],
  [":-(", "☹️"],
  [":(", "☹️"],
  [":-O", "😮"],
  [":O", "😮"],
  [":-o", "😮"],
  [":o", "😮"],
  [":-$", "😳"],
  [":$", "😳"],
  [":-@", "😡"],
  [":@", "😡"],
  [":-S", "😕"],
  [":S", "😕"],
  [":-s", "😕"],
  [":s", "😕"],
  ["8-)", "🤓"],
  ["8)", "🤓"],
  ["<3", "❤️"],
  ["</3", "💔"],
  ["(y)", "👍"],
  ["(Y)", "👍"],
  ["(n)", "👎"],
  ["(N)", "👎"]
];

// Picker: lista de códigos para mostrar en la grilla del selector
// (usa una sola variante de cada emoji para no repetir).
const EMOTICON_PICKER_LIST = [
  ":)", ":D", ";)", ":P", ":(", ":'(", ":O", ":$", ":@", ":S",
  "8-)", "(cool)", "(angel)", "(devil)", "(heart)", "(brokenheart)",
  "(y)", "(n)", "(ok)", "(star)", "(sun)", "(coffee)", "(music)",
  "(movie)", "(cake)", "(beer)", "(rose)"
];

// Escapa HTML y reemplaza los códigos de emoticonos por su emoji.
// El contenido SIEMPRE se escapa como HTML; los emoticonos se insertan
// después usando marcadores seguros, así que nunca hay forma de inyectar
// HTML a través de un mensaje (ni siquiera con códigos como "<3" o "</3").
function renderMessageContent(rawText) {
  let text = rawText ?? '';

  // 1) Reemplaza cada código de emoticono por un marcador único que no
  //    contiene caracteres especiales de HTML (para que sobreviva intacto
  //    al escape del paso 2 sin alterar el resto del escapado).
  const placeholders = [];
  EMOTICON_MAP.forEach(([code, emoji], i) => {
    if (text.indexOf(code) !== -1) {
      const token = `\u0000E${i}\u0000`;
      text = text.split(code).join(token);
      placeholders.push([token, emoji]);
    }
  });

  // 2) Escapa el resto del texto como HTML (previene inyección de <script>, etc.)
  const div = document.createElement('div');
  div.textContent = text;
  let escaped = div.innerHTML;

  // 3) Sustituye los marcadores por el emoji real.
  placeholders.forEach(([token, emoji]) => {
    escaped = escaped.split(token).join(emoji);
  });

  return escaped;
}
