// Mapeo simple de nombre de avatar -> emoji para mostrar en la UI.
// (Mantiene el frontend ligero sin necesidad de imágenes reales).
const AVATAR_EMOJI = {
  avatar1: '🙂', avatar2: '😎', avatar3: '🐱', avatar4: '🐼',
  avatar5: '🎮', avatar6: '🎧', avatar7: '⭐', avatar8: '🐧'
};

function avatarKey(filename) {
  // 'avatar1.png' -> 'avatar1'
  return (filename || 'avatar1.png').replace('.png', '');
}

function avatarEmoji(filename) {
  return AVATAR_EMOJI[avatarKey(filename)] || '🙂';
}

// Devuelve el HTML a insertar dentro de un .avatar-circle: la foto de
// perfil real si el usuario subió una, o el emoji de siempre si no.
// `user` puede ser el objeto de usuario/amigo/remitente completo, o
// null/undefined (se usa el emoji por defecto en ese caso).
function avatarHtml(user) {
  if (user && user.profilePhoto) {
    return `<img src="${user.profilePhoto}" class="avatar-img" alt="" />`;
  }
  return avatarEmoji(user && user.avatar);
}

// Devuelve el HTML del banner (imagen ancha) de un usuario, o null si no
// tiene uno configurado. Se usa tanto en el panel de perfil propio como
// en la página de perfil público (profile.html).
function bannerHtml(user) {
  if (user && user.banner) {
    return `<img src="${user.banner}" class="banner-img" alt="" />`;
  }
  return null;
}
