// Lista de intereses disponibles (debe coincidir con utils/interests.js del backend)
const INTERESTS = [
  'K-pop', 'Programación', 'Gaming', 'Anime', 'Manga', 'Rock', 'Metal',
  'Música', 'Arte', 'Dibujo', 'Fotografía', 'Videojuegos', 'Roblox',
  'Minecraft', 'Ciencia', 'Tecnología'
];

// Renderiza una grilla de "chips" seleccionables dentro de `container`.
// `selected` es un array de strings ya elegidos (puede venir vacío).
// `onChange(selectedArray)` se llama cada vez que el usuario agrega o
// quita un interés, entregando la lista actualizada.
function renderInterestPicker(container, selected, onChange) {
  const chosen = new Set(selected || []);
  container.innerHTML = '';
  INTERESTS.forEach((tag) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip' + (chosen.has(tag) ? ' selected' : '');
    chip.textContent = tag;
    chip.onclick = () => {
      if (chosen.has(tag)) {
        chosen.delete(tag);
      } else {
        chosen.add(tag);
      }
      chip.classList.toggle('selected');
      onChange(Array.from(chosen));
    };
    container.appendChild(chip);
  });
}