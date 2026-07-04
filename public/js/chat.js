const API = (window.LBM_API_BASE || '') + '/api';
const token = localStorage.getItem('lbm_token');
let me = JSON.parse(localStorage.getItem('lbm_user') || 'null');

if (!token || !me) {
  window.location.href = '/index.html';
}

// Elemento raíz que controla qué vista se ve a pantalla completa en
// tablet chico / móvil: 'list' | 'chat' | 'profile' (ver style.css)
const appShell = document.getElementById('appShell');

// ---------- Estado global ----------
let currentTab = 'chats';
let currentConversation = null; // { type: 'chat'|'room', id, title, otherUserId? }
let friendsCache = [];
let roomsCache = [];
let typingTimeout = null;

// ---------- Helpers de fetch autenticado ----------
async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error en la solicitud.');
  return data;
}

// ---------- Socket.io ----------
const socket = io(window.LBM_API_BASE || undefined, { auth: { token } });

socket.on('connect_error', (err) => {
  if (err.message === 'No autorizado.' || err.message === 'Token inválido.') {
    localStorage.clear();
    window.location.href = '/index.html';
  }
});

socket.on('friend:status', ({ userId, status }) => {
  const friend = friendsCache.find((f) => f._id === userId);
  if (friend) friend.status = status;
  if (currentTab === 'chats' || currentTab === 'friends') renderList();
  if (currentConversation?.otherUserId === userId) {
    document.getElementById('chatHeaderSub').textContent = statusLabel(status);
  }
});

socket.on('chat:message', ({ chatId, message }) => {
  if (currentConversation?.type === 'chat' && currentConversation.id === chatId) {
    appendMessage(message);
  }
  loadChats(); // refresca lista de conversaciones recientes
});

socket.on('room:message', ({ roomId, message }) => {
  if (currentConversation?.type === 'room' && currentConversation.id === roomId) {
    appendMessage(message);
  }
});

socket.on('chat:typing', ({ chatId, nickname }) => {
  if (currentConversation?.type === 'chat' && currentConversation.id === chatId) {
    const el = document.getElementById('typingIndicator');
    el.textContent = `${nickname} está escribiendo...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => (el.textContent = ''), 2000);
  }
});

// ---------- Inicialización ----------
async function init() {
  appShell.setAttribute('data-view', 'list'); // vista inicial en móvil: la lista de chats

  // El login/registro solo devuelven campos básicos; se completa el perfil
  // (foto, mensaje personal, página, etc.) con una consulta a /users/me.
  try {
    const { user } = await api('/users/me');
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
  } catch (err) {
    // Si falla (ej. token vencido), el helper `api` ya redirige en otros casos;
    // aquí simplemente seguimos con los datos que había en localStorage.
  }

  renderProfile();
  await loadAvatarGrid();
  loadProfileInterests();
  await Promise.all([loadFriends(), loadRooms(), loadRequests(), loadRecommendations()]);
  renderList();

  if (me.role === 'admin' || me.role === 'superadmin') {
    document.getElementById('adminLink').classList.remove('hidden');
  }
}

function statusLabel(status) {
  return status === 'online' ? '🟢 En línea' : status === 'away' ? '🌙 Ausente' : '⚪ Desconectado';
}

// ---------- Ir al perfil público de alguien ----------
// Se usa en todos los lugares donde se muestra la foto o el apodo de una
// persona (listas de chats/amigos/salas/solicitudes, resultados de
// búsqueda, encabezado del chat activo): al hacer clic, se abre su perfil
// público en una pestaña nueva, igual que ya hacía el botón "👤 Perfil"
// del encabezado del chat.
function openProfile(nickname) {
  if (!nickname) return;
  window.open(`/profile.html?u=${encodeURIComponent(nickname)}`, '_blank');
}

// Marca un elemento (avatar o nombre) como clicable hacia el perfil de
// `nickname`, sin disparar el onclick de la fila que lo contiene (por
// ejemplo, para no abrir un chat quiere el usuario solo ver el perfil).
function bindProfileLink(el, nickname) {
  if (!el || !nickname) return;
  el.classList.add('user-link');
  el.title = `Ver perfil de ${nickname}`;
  el.onclick = (e) => {
    e.stopPropagation();
    openProfile(nickname);
  };
}

// ---------- Perfil ----------
function renderProfile() {
  document.getElementById('profileAvatar').innerHTML = avatarHtml(me);
  document.getElementById('profileNickname').textContent = me.nickname;
  document.getElementById('profileNickname').style.color = me.nameColor || '#0066cc';
  document.getElementById('profileEmail').textContent = me.email;
  document.getElementById('colorPicker').value = me.nameColor || '#0066cc';
  document.getElementById('statusMessageInput').value = me.statusMessage || '';
  document.getElementById('removePhotoBtn').classList.toggle('hidden', !me.profilePhoto);
  document.getElementById('bioInput').value = me.bio || '';

  const bannerPreview = document.getElementById('profileBannerPreview');
  bannerPreview.innerHTML = me.banner
    ? `<img src="${me.banner}" class="banner-img" alt="" />`
    : '<span class="banner-empty-hint">Sin banner</span>';
  document.getElementById('removeBannerBtn').classList.toggle('hidden', !me.banner);
  document.getElementById('removeBackgroundBtn').classList.toggle('hidden', !me.profileBackground);

  renderProfileLinks();
  renderProfileVideos();
}

// ---------- Links personalizados ----------
function renderProfileLinks() {
  const list = document.getElementById('profileLinksList');
  const links = me.links || [];
  if (links.length === 0) {
    list.innerHTML = '<div class="system-msg" style="margin:0;">Aún no agregaste links</div>';
  } else {
    list.innerHTML = '';
    links.forEach((link, index) => {
      const row = document.createElement('div');
      row.className = 'profile-link-row';
      row.innerHTML = `
        <span class="link-label">${escapeHtml(link.label)}</span>
        <span class="link-url">${escapeHtml(link.url)}</span>
        <button type="button" class="remove-btn" title="Quitar">✕</button>`;
      row.querySelector('.remove-btn').onclick = async () => {
        const updated = links.filter((_, i) => i !== index);
        await saveLinks(updated);
      };
      list.appendChild(row);
    });
  }
}

async function saveLinks(updated) {
  const errorEl = document.getElementById('linkError');
  errorEl.textContent = '';
  try {
    const { user } = await api('/users/me/links', { method: 'PATCH', body: JSON.stringify({ links: updated }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfileLinks();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

document.getElementById('addLinkBtn').onclick = async () => {
  const labelInput = document.getElementById('newLinkLabel');
  const urlInput = document.getElementById('newLinkUrl');
  const errorEl = document.getElementById('linkError');
  errorEl.textContent = '';

  const label = labelInput.value.trim();
  let url = urlInput.value.trim();
  if (!label || !url) {
    errorEl.textContent = 'Completa el nombre y la URL.';
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  const updated = [...(me.links || []), { label, url }];
  await saveLinks(updated);
  if (!document.getElementById('linkError').textContent) {
    labelInput.value = '';
    urlInput.value = '';
  }
};

// ---------- Videos de YouTube ----------
function renderProfileVideos() {
  const list = document.getElementById('profileVideosList');
  const videos = me.videos || [];
  if (videos.length === 0) {
    list.innerHTML = '<div class="system-msg" style="margin:0;">Aún no agregaste videos</div>';
  } else {
    list.innerHTML = '';
    videos.forEach((video, index) => {
      const row = document.createElement('div');
      row.className = 'profile-video-row';
      row.innerHTML = `
        ${youtubeThumbnailHtml(video.videoId)}
        <span class="video-url">${escapeHtml(video.url)}</span>
        <button type="button" class="remove-btn" title="Quitar">✕</button>`;
      row.querySelector('.remove-btn').onclick = async () => {
        const updated = videos.filter((_, i) => i !== index);
        await saveVideos(updated);
      };
      list.appendChild(row);
    });
  }
}

async function saveVideos(updated) {
  const errorEl = document.getElementById('videoError');
  errorEl.textContent = '';
  try {
    const { user } = await api('/users/me/videos', { method: 'PATCH', body: JSON.stringify({ videos: updated }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfileVideos();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

document.getElementById('addVideoBtn').onclick = async () => {
  const urlInput = document.getElementById('newVideoUrl');
  const errorEl = document.getElementById('videoError');
  errorEl.textContent = '';

  const url = urlInput.value.trim();
  if (!url) {
    errorEl.textContent = 'Pega un enlace de YouTube.';
    return;
  }
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    errorEl.textContent = 'Ese enlace no parece ser un video válido de YouTube.';
    return;
  }

  const updated = [...(me.videos || []), { url, videoId }];
  await saveVideos(updated);
  if (!document.getElementById('videoError').textContent) {
    urlInput.value = '';
  }
};

// ---------- Biografía ----------
document.getElementById('bioInput').addEventListener('change', async (e) => {
  try {
    const { user } = await api('/users/me', { method: 'PATCH', body: JSON.stringify({ bio: e.target.value }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Ver mi perfil público ----------
document.getElementById('viewMyProfileBtn').onclick = () => {
  openProfile(me.nickname);
};

async function loadAvatarGrid() {
  const { avatars } = await api('/users/avatars');
  const grid = document.getElementById('avatarGrid');
  grid.innerHTML = '';
  avatars.forEach((a) => {
    const div = document.createElement('div');
    div.className = 'avatar-option' + (avatarKey(a) === avatarKey(me.avatar) ? ' selected' : '');
    div.textContent = avatarEmoji(a);
    div.onclick = async () => {
      const { user } = await api('/users/me', { method: 'PATCH', body: JSON.stringify({ avatar: a }) });
      me = user;
      localStorage.setItem('lbm_user', JSON.stringify(me));
      renderProfile();
      loadAvatarGrid();
    };
    grid.appendChild(div);
  });
}

document.getElementById('colorPicker').addEventListener('change', async (e) => {
  const { user } = await api('/users/me', { method: 'PATCH', body: JSON.stringify({ nameColor: e.target.value }) });
  me = user;
  localStorage.setItem('lbm_user', JSON.stringify(me));
  renderProfile();
});

// ---------- Mensaje personal (estilo "mensaje personal" de MSN) ----------
document.getElementById('statusMessageInput').addEventListener('change', async (e) => {
  try {
    const { user } = await api('/users/me', { method: 'PATCH', body: JSON.stringify({ statusMessage: e.target.value }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Foto de perfil real (JPEG o GIF) ----------
const MAX_PHOTO_DIMENSION = 320; // px, solo se aplica a JPEG (los GIF se suben tal cual para no perder la animación)

document.getElementById('uploadPhotoBtn').onclick = () => {
  document.getElementById('photoFileInput').click();
};

document.getElementById('photoFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // permite volver a elegir el mismo archivo después
  if (!file) return;

  const errorEl = document.getElementById('photoError');
  errorEl.textContent = '';

  if (!['image/jpeg', 'image/gif'].includes(file.type)) {
    errorEl.textContent = 'Solo se aceptan imágenes JPEG o GIF.';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    errorEl.textContent = 'El archivo es demasiado pesado (máx. 4MB antes de comprimir).';
    return;
  }

  try {
    let dataUri;
    if (file.type === 'image/gif') {
      // Los GIF se suben sin reprocesar para conservar la animación.
      dataUri = await fileToDataUri(file);
    } else {
      // Los JPEG se redimensionan/comprimen en el navegador antes de enviarlos.
      dataUri = await resizeImageToJpeg(file, MAX_PHOTO_DIMENSION);
    }

    const { user } = await api('/users/me/photo', { method: 'PATCH', body: JSON.stringify({ photo: dataUri }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfile();
  } catch (err) {
    errorEl.textContent = err.message || 'No se pudo subir la foto.';
  }
});

document.getElementById('removePhotoBtn').onclick = async () => {
  try {
    const { user } = await api('/users/me/photo', { method: 'DELETE' });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfile();
  } catch (err) {
    alert(err.message);
  }
};

// ---------- Banner del perfil (imagen ancha) ----------
const MAX_BANNER_DIMENSION = 900; // px, ancho máximo antes de comprimir (solo JPEG)

document.getElementById('uploadBannerBtn').onclick = () => {
  document.getElementById('bannerFileInput').click();
};

document.getElementById('bannerFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const errorEl = document.getElementById('bannerError');
  errorEl.textContent = '';

  if (!['image/jpeg', 'image/gif'].includes(file.type)) {
    errorEl.textContent = 'Solo se aceptan imágenes JPEG o GIF.';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    errorEl.textContent = 'El archivo es demasiado pesado (máx. 4MB antes de comprimir).';
    return;
  }

  try {
    const dataUri = file.type === 'image/gif'
      ? await fileToDataUri(file)
      : await resizeImageToJpeg(file, MAX_BANNER_DIMENSION);

    const { user } = await api('/users/me/banner', { method: 'PATCH', body: JSON.stringify({ banner: dataUri }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfile();
  } catch (err) {
    errorEl.textContent = err.message || 'No se pudo subir el banner.';
  }
});

document.getElementById('removeBannerBtn').onclick = async () => {
  try {
    const { user } = await api('/users/me/banner', { method: 'DELETE' });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfile();
  } catch (err) {
    alert(err.message);
  }
};

// ---------- Fondo personalizado del perfil ----------
const MAX_BACKGROUND_DIMENSION = 1400; // px, ancho máximo antes de comprimir (solo JPEG)

document.getElementById('uploadBackgroundBtn').onclick = () => {
  document.getElementById('backgroundFileInput').click();
};

document.getElementById('backgroundFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  const errorEl = document.getElementById('backgroundError');
  errorEl.textContent = '';

  if (!['image/jpeg', 'image/gif'].includes(file.type)) {
    errorEl.textContent = 'Solo se aceptan imágenes JPEG o GIF.';
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    errorEl.textContent = 'El archivo es demasiado pesado (máx. 4MB antes de comprimir).';
    return;
  }

  try {
    // Los GIF se suben tal cual para conservar la animación; los JPEG se
    // redimensionan/comprimen en el navegador (igual que la foto y el banner).
    const dataUri = file.type === 'image/gif'
      ? await fileToDataUri(file)
      : await resizeImageToJpeg(file, MAX_BACKGROUND_DIMENSION);
    const { user } = await api('/users/me/background', { method: 'PATCH', body: JSON.stringify({ background: dataUri }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfile();
  } catch (err) {
    errorEl.textContent = err.message || 'No se pudo subir el fondo.';
  }
});

document.getElementById('removeBackgroundBtn').onclick = async () => {
  try {
    const { user } = await api('/users/me/background', { method: 'DELETE' });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderProfile();
  } catch (err) {
    alert(err.message);
  }
};

function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function resizeImageToJpeg(file, maxDimension) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

// Selector de intereses en el perfil: guarda el cambio de inmediato al tocar un chip
function loadProfileInterests() {
  const container = document.getElementById('profileInterests');
  renderInterestPicker(container, me.interests || [], async (selected) => {
    try {
      const { user } = await api('/users/me', { method: 'PATCH', body: JSON.stringify({ interests: selected }) });
      me = user;
      localStorage.setItem('lbm_user', JSON.stringify(me));
      await Promise.all([loadRecommendations(), loadRooms()]);
      if (currentTab === 'friends' || currentTab === 'rooms') renderList();
    } catch (err) {
      alert(err.message);
    }
  });
}

document.getElementById('statusOnlineBtn').onclick = () => setStatus('online');
document.getElementById('statusAwayBtn').onclick = () => setStatus('away');

async function setStatus(status) {
  await api('/users/me', { method: 'PATCH', body: JSON.stringify({ status }) });
  socket.emit('user:setStatus', status);
  document.getElementById('statusOnlineBtn').classList.toggle('active', status === 'online');
  document.getElementById('statusAwayBtn').classList.toggle('active', status === 'away');
}

document.getElementById('logoutBtn').onclick = () => {
  localStorage.clear();
  window.location.href = '/index.html';
};

// ---------- Mi página personal (estilo Neocities) ----------
function updateBlogPreview() {
  const html = document.getElementById('blogHtmlInput').value;
  const css = document.getElementById('blogCssInput').value;
  const frame = document.getElementById('blogPreviewFrame');
  // El iframe tiene sandbox="" (sin permisos), así que aunque el HTML
  // incluya <script>, nunca se ejecutará. Es una vista previa segura.
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${html}</body></html>`;
}

document.getElementById('editBlogBtn').onclick = () => {
  const blog = me.blog || {};
  document.getElementById('blogTitleInput').value = blog.title || '';
  document.getElementById('blogHtmlInput').value = blog.html || '';
  document.getElementById('blogCssInput').value = blog.css || '';
  document.getElementById('blogPublicCheckbox').checked = Boolean(blog.isPublic);
  document.getElementById('blogError').textContent = '';
  updateBlogPreview();
  document.getElementById('blogModal').classList.remove('hidden');
};

document.getElementById('blogHtmlInput').addEventListener('input', updateBlogPreview);
document.getElementById('blogCssInput').addEventListener('input', updateBlogPreview);

document.getElementById('cancelBlogBtn').onclick = () => {
  document.getElementById('blogModal').classList.add('hidden');
};

document.getElementById('saveBlogBtn').onclick = async () => {
  const errorEl = document.getElementById('blogError');
  errorEl.textContent = '';
  try {
    const { user } = await api('/users/me/blog', {
      method: 'PATCH',
      body: JSON.stringify({
        title: document.getElementById('blogTitleInput').value,
        html: document.getElementById('blogHtmlInput').value,
        css: document.getElementById('blogCssInput').value,
        isPublic: document.getElementById('blogPublicCheckbox').checked
      })
    });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    document.getElementById('blogModal').classList.add('hidden');
    if (user.blog.isPublic) {
      alert(`¡Listo! Tu página está publicada en:\n${location.origin}/blog.html?u=${encodeURIComponent(user.nickname)}`);
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
};

// ---------- Personalización total del perfil (estilo Neocities/MySpace) ----------
const THEME_DEFAULTS = {
  bgColor: '#e8eef7', cardBgColor: '#ffffff', textColor: '#222222', linkColor: '#1d4cc0',
  borderColor: '#c7d3e8', fontFamily: 'system', borderStyle: 'solid', borderWidth: 1,
  borderRadius: 10, cardOpacity: 1, boxShadow: 'soft', backgroundEffect: 'none', animation: 'none'
};
const LAYOUT_LABELS = { bio: '📝 Biografía', links: '🔗 Links', videos: '🎬 Videos', widgets: '🧩 Mis widgets', blog: '🌐 Página personal' };
const DEFAULT_LAYOUT = ['bio', 'links', 'videos', 'widgets', 'blog'];

document.getElementById('editThemeBtn').onclick = () => {
  const t = Object.assign({}, THEME_DEFAULTS, me.theme || {});
  document.getElementById('themeBgColor').value = t.bgColor;
  document.getElementById('themeCardBgColor').value = t.cardBgColor;
  document.getElementById('themeTextColor').value = t.textColor;
  document.getElementById('themeLinkColor').value = t.linkColor;
  document.getElementById('themeBorderColor').value = t.borderColor;
  document.getElementById('themeFontFamily').value = t.fontFamily;
  document.getElementById('themeBorderStyle').value = t.borderStyle;
  document.getElementById('themeBorderWidth').value = t.borderWidth;
  document.getElementById('themeBorderWidthVal').textContent = t.borderWidth;
  document.getElementById('themeBorderRadius').value = t.borderRadius;
  document.getElementById('themeBorderRadiusVal').textContent = t.borderRadius;
  document.getElementById('themeCardOpacity').value = Math.round(t.cardOpacity * 100);
  document.getElementById('themeOpacityVal').textContent = Math.round(t.cardOpacity * 100);
  document.getElementById('themeBoxShadow').value = t.boxShadow;
  document.getElementById('themeBackgroundEffect').value = t.backgroundEffect;
  document.getElementById('themeAnimation').value = t.animation;
  document.getElementById('themeError').textContent = '';
  renderWidgetsList();
  renderLayoutOrderList();
  document.getElementById('themeModal').classList.remove('hidden');
};

['themeBorderWidth', 'themeBorderRadius', 'themeCardOpacity'].forEach((id) => {
  document.getElementById(id).addEventListener('input', (e) => {
    const labelId = { themeBorderWidth: 'themeBorderWidthVal', themeBorderRadius: 'themeBorderRadiusVal', themeCardOpacity: 'themeOpacityVal' }[id];
    document.getElementById(labelId).textContent = e.target.value;
  });
});

document.getElementById('cancelThemeBtn').onclick = () => {
  document.getElementById('themeModal').classList.add('hidden');
};

document.getElementById('saveThemeBtn').onclick = async () => {
  const errorEl = document.getElementById('themeError');
  errorEl.textContent = '';
  try {
    const theme = {
      bgColor: document.getElementById('themeBgColor').value,
      cardBgColor: document.getElementById('themeCardBgColor').value,
      textColor: document.getElementById('themeTextColor').value,
      linkColor: document.getElementById('themeLinkColor').value,
      borderColor: document.getElementById('themeBorderColor').value,
      fontFamily: document.getElementById('themeFontFamily').value,
      borderStyle: document.getElementById('themeBorderStyle').value,
      borderWidth: Number(document.getElementById('themeBorderWidth').value),
      borderRadius: Number(document.getElementById('themeBorderRadius').value),
      cardOpacity: Number(document.getElementById('themeCardOpacity').value) / 100,
      boxShadow: document.getElementById('themeBoxShadow').value,
      backgroundEffect: document.getElementById('themeBackgroundEffect').value,
      animation: document.getElementById('themeAnimation').value
    };
    const { user } = await api('/users/me/theme', { method: 'PATCH', body: JSON.stringify({ theme }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    document.getElementById('themeModal').classList.add('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
  }
};

// ---------- Widgets/módulos de contenido personalizables ----------
function renderWidgetsList() {
  const list = document.getElementById('widgetsList');
  const widgets = me.widgets || [];
  if (widgets.length === 0) {
    list.innerHTML = '<div class="system-msg" style="margin:0;">Aún no agregaste widgets</div>';
    return;
  }
  list.innerHTML = '';
  widgets.forEach((w, index) => {
    const row = document.createElement('div');
    row.className = 'profile-link-row widget-row';
    row.innerHTML = `
      <div class="widget-info">
        <span class="link-label">${escapeHtml(w.icon || '📌')} ${escapeHtml(w.title || '(sin título)')}</span>
        <span class="link-url">${escapeHtml((w.content || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 60))}</span>
      </div>
      <button type="button" class="order-btn" title="Subir" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="order-btn" title="Bajar" ${index === widgets.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="remove-btn" title="Quitar">✕</button>`;
    const [upBtn, downBtn] = row.querySelectorAll('.order-btn');
    upBtn.onclick = () => moveWidget(index, -1);
    downBtn.onclick = () => moveWidget(index, 1);
    row.querySelector('.remove-btn').onclick = () => saveWidgets(widgets.filter((_, i) => i !== index));
    list.appendChild(row);
  });
}

async function saveWidgets(updated) {
  const errorEl = document.getElementById('widgetError');
  errorEl.textContent = '';
  try {
    const { user } = await api('/users/me/widgets', { method: 'PATCH', body: JSON.stringify({ widgets: updated }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderWidgetsList();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function moveWidget(index, dir) {
  const widgets = [...(me.widgets || [])];
  const target = index + dir;
  if (target < 0 || target >= widgets.length) return;
  [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
  saveWidgets(widgets);
}

document.getElementById('addWidgetBtn').onclick = async () => {
  const errorEl = document.getElementById('widgetError');
  errorEl.textContent = '';
  const title = document.getElementById('newWidgetTitle').value.trim();
  const icon = document.getElementById('newWidgetIcon').value.trim() || '📌';
  const color = document.getElementById('newWidgetColor').value;
  const content = document.getElementById('newWidgetContent').value;
  if (!title || !content.trim()) {
    errorEl.textContent = 'Completa el título y el contenido del widget.';
    return;
  }
  const updated = [...(me.widgets || []), { title, icon, color, content }];
  await saveWidgets(updated);
  if (!document.getElementById('widgetError').textContent) {
    document.getElementById('newWidgetTitle').value = '';
    document.getElementById('newWidgetIcon').value = '';
    document.getElementById('newWidgetContent').value = '';
  }
};

// ---------- Orden reorganizable de las secciones del perfil ----------
function renderLayoutOrderList() {
  const list = document.getElementById('layoutOrderList');
  const layout = me.layout && me.layout.length ? me.layout : DEFAULT_LAYOUT;
  list.innerHTML = '';
  layout.forEach((key, index) => {
    const row = document.createElement('div');
    row.className = 'layout-order-row';
    row.innerHTML = `
      <span class="order-label">${LAYOUT_LABELS[key] || key}</span>
      <button type="button" class="order-btn" title="Subir" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="order-btn" title="Bajar" ${index === layout.length - 1 ? 'disabled' : ''}>↓</button>`;
    const [upBtn, downBtn] = row.querySelectorAll('.order-btn');
    upBtn.onclick = () => moveLayout(index, -1);
    downBtn.onclick = () => moveLayout(index, 1);
    list.appendChild(row);
  });
}

async function moveLayout(index, dir) {
  const layout = [...(me.layout && me.layout.length ? me.layout : DEFAULT_LAYOUT)];
  const target = index + dir;
  if (target < 0 || target >= layout.length) return;
  [layout[index], layout[target]] = [layout[target], layout[index]];
  try {
    const { user } = await api('/users/me/layout', { method: 'PATCH', body: JSON.stringify({ layout }) });
    me = user;
    localStorage.setItem('lbm_user', JSON.stringify(me));
    renderLayoutOrderList();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Navegación móvil (lista / chat / perfil a pantalla completa) ----------
// En desktop estos botones están ocultos por CSS y esto no tiene efecto visible.
document.getElementById('mobileProfileBtn').onclick = () => {
  appShell.setAttribute('data-view', 'profile');
};

document.getElementById('chatBackBtn').onclick = () => {
  appShell.setAttribute('data-view', 'list');
};

// El fondo oscuro que aparece detrás del panel de perfil en tablet (ver
// .panel-backdrop en CSS) debe cerrar el panel al tocarlo, igual que el
// botón "Volver" que ya está dentro del panel.
document.getElementById('panelBackdrop').onclick = () => {
  appShell.setAttribute('data-view', currentConversation ? 'chat' : 'list');
};

document.getElementById('profileBackBtn').onclick = () => {
  // Si había una conversación abierta, volvemos a ella; si no, a la lista.
  appShell.setAttribute('data-view', currentConversation ? 'chat' : 'list');
};

// ---------- Tabs ----------
document.querySelectorAll('.sidebar-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    document.getElementById('friendSearchBox').classList.toggle('hidden', currentTab !== 'friends');
    document.getElementById('createRoomBox').classList.toggle('hidden', currentTab !== 'rooms');
    renderList();
  });
});

// ---------- Carga de datos ----------
let chatsCache = [];
let requestsCache = [];
let recommendationsCache = [];

async function loadChats() {
  const { chats } = await api('/chats');
  chatsCache = chats;
  if (currentTab === 'chats') renderList();
}

async function loadFriends() {
  const { friends } = await api('/friends');
  friendsCache = friends.map((f) => ({ ...f, _id: f._id }));
}

async function loadRooms() {
  const { rooms } = await api('/rooms');
  roomsCache = rooms;
}

async function loadRecommendations() {
  try {
    const { recommendations } = await api('/users/recommendations');
    recommendationsCache = recommendations;
  } catch (err) {
    recommendationsCache = [];
  }
}

async function loadRequests() {
  const { requests } = await api('/friends/requests');
  requestsCache = requests;
  const badge = document.getElementById('reqBadge');
  badge.textContent = requests.length;
  badge.classList.toggle('hidden', requests.length === 0);
  if (currentTab === 'requests') renderList();
}

// ---------- Render de la lista lateral ----------
function renderList() {
  const panel = document.getElementById('listPanel');
  panel.innerHTML = '';

  if (currentTab === 'chats') {
    loadChats().then(() => {}); // refresco async silencioso (no bloquea render inicial)
    if (chatsCache.length === 0) {
      panel.innerHTML = '<div class="system-msg">Aún no tienes conversaciones</div>';
      return;
    }
    chatsCache.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'list-item' + (currentConversation?.type === 'chat' && currentConversation.id === c.chatId ? ' active' : '');
      item.innerHTML = `
        <div class="avatar-circle">${avatarHtml(c.otherUser)}<span class="status-dot ${c.otherUser?.status || 'offline'}"></span></div>
        <div class="list-item-text">
          <div class="list-item-name" style="color:${c.otherUser?.nameColor || '#333'}">${escapeHtml(c.otherUser?.nickname || 'Usuario')}</div>
          <div class="list-item-sub">${c.lastMessage ? escapeHtml(c.lastMessage.content).slice(0, 30) : 'Sin mensajes'}</div>
        </div>`;
      item.onclick = () => openChat(c.chatId, c.otherUser);
      bindProfileLink(item.querySelector('.avatar-circle'), c.otherUser?.nickname);
      bindProfileLink(item.querySelector('.list-item-name'), c.otherUser?.nickname);
      panel.appendChild(item);
    });
  }

  if (currentTab === 'friends') {
    if (recommendationsCache.length > 0) {
      const recTitle = document.createElement('div');
      recTitle.className = 'section-title';
      recTitle.textContent = 'Recomendados para ti';
      panel.appendChild(recTitle);

      recommendationsCache.forEach((u) => {
        const isFriend = friendsCache.some((f) => f._id === u._id);
        if (isFriend) return;
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
          <div class="avatar-circle">${avatarHtml(u)}<span class="status-dot ${u.status || 'offline'}"></span></div>
          <div class="list-item-text">
            <div class="list-item-name" style="color:${u.nameColor || '#333'}">${escapeHtml(u.nickname)}</div>
            <div class="mini-tags">${u.sharedTags.map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>
          </div>`;
        bindProfileLink(item.querySelector('.avatar-circle'), u.nickname);
        bindProfileLink(item.querySelector('.list-item-name'), u.nickname);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'padding:3px 8px;font-size:11px;';
        btn.textContent = 'Agregar';
        btn.onclick = async (ev) => {
          ev.stopPropagation();
          try {
            await api('/friends/request', { method: 'POST', body: JSON.stringify({ toUserId: u._id }) });
            btn.textContent = 'Enviada ✓';
            btn.disabled = true;
          } catch (err) {
            alert(err.message);
          }
        };
        item.appendChild(btn);
        panel.appendChild(item);
      });

      const friendsTitle = document.createElement('div');
      friendsTitle.className = 'section-title';
      friendsTitle.textContent = 'Mis amigos';
      panel.appendChild(friendsTitle);
    }

    if (friendsCache.length === 0) {
      panel.innerHTML += '<div class="system-msg">Aún no tienes amigos agregados</div>';
    }
    friendsCache.forEach((f) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="avatar-circle">${avatarHtml(f)}<span class="status-dot ${f.status || 'offline'}"></span></div>
        <div class="list-item-text">
          <div class="list-item-name" style="color:${f.nameColor || '#333'}">${escapeHtml(f.nickname)}</div>
          <div class="list-item-sub">${f.statusMessage ? escapeHtml(f.statusMessage) : statusLabel(f.status)}</div>
        </div>`;
      item.onclick = async () => {
        const { chatId } = await api(`/chats/with/${f._id}`, { method: 'POST' });
        openChat(chatId, f);
      };
      bindProfileLink(item.querySelector('.avatar-circle'), f.nickname);
      bindProfileLink(item.querySelector('.list-item-name'), f.nickname);
      panel.appendChild(item);
    });
  }

  if (currentTab === 'rooms') {
    roomsCache.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'list-item' + (currentConversation?.type === 'room' && currentConversation.id === r._id ? ' active' : '');
      item.innerHTML = `
        <div class="avatar-circle">${r.icon}</div>
        <div class="list-item-text">
          <div class="list-item-name">${escapeHtml(r.name)}</div>
          <div class="list-item-sub">${escapeHtml(r.description || '')}</div>
          <div class="mini-tags">${(r.tags || []).map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>`;
      item.onclick = () => openRoom(r);
      panel.appendChild(item);
    });
  }

  if (currentTab === 'requests') {
    if (requestsCache.length === 0) {
      panel.innerHTML = '<div class="system-msg">No tienes solicitudes pendientes</div>';
    }
    requestsCache.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="avatar-circle">${avatarHtml(r.from)}</div>
        <div class="list-item-text">
          <div class="list-item-name">${escapeHtml(r.from.nickname)}</div>
          <div class="row-actions" style="margin-top:4px;">
            <button class="btn" style="padding:3px 8px;font-size:11px;" data-action="accept">Aceptar</button>
            <button class="btn secondary" style="padding:3px 8px;font-size:11px;" data-action="reject">Rechazar</button>
          </div>
        </div>`;
      bindProfileLink(item.querySelector('.avatar-circle'), r.from.nickname);
      bindProfileLink(item.querySelector('.list-item-name'), r.from.nickname);
      item.querySelector('[data-action="accept"]').onclick = async (e) => {
        e.stopPropagation();
        await api(`/friends/requests/${r._id}/respond`, { method: 'POST', body: JSON.stringify({ action: 'accept' }) });
        await Promise.all([loadFriends(), loadRequests()]);
      };
      item.querySelector('[data-action="reject"]').onclick = async (e) => {
        e.stopPropagation();
        await api(`/friends/requests/${r._id}/respond`, { method: 'POST', body: JSON.stringify({ action: 'reject' }) });
        await loadRequests();
      };
      panel.appendChild(item);
    });
  }
}

// ---------- Búsqueda de usuarios (pestaña amigos) ----------
let searchDebounce = null;
document.getElementById('friendSearchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value;
  searchDebounce = setTimeout(async () => {
    if (!q.trim()) return renderList();
    const { users } = await api(`/users/search?q=${encodeURIComponent(q)}`);
    const panel = document.getElementById('listPanel');
    panel.innerHTML = '';
    if (users.length === 0) {
      panel.innerHTML = '<div class="system-msg">Sin resultados</div>';
      return;
    }
    users.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      const isFriend = friendsCache.some((f) => f._id === u._id);
      item.innerHTML = `
        <div class="avatar-circle">${avatarHtml(u)}</div>
        <div class="list-item-text">
          <div class="list-item-name">${escapeHtml(u.nickname)}</div>
          <div class="list-item-sub">${isFriend ? 'Ya son amigos' : ''}</div>
        </div>`;
      bindProfileLink(item.querySelector('.avatar-circle'), u.nickname);
      bindProfileLink(item.querySelector('.list-item-name'), u.nickname);
      if (!isFriend) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.cssText = 'padding:3px 8px;font-size:11px;';
        btn.textContent = 'Agregar';
        btn.onclick = async (ev) => {
          ev.stopPropagation();
          try {
            await api('/friends/request', { method: 'POST', body: JSON.stringify({ toUserId: u._id }) });
            btn.textContent = 'Enviada ✓';
            btn.disabled = true;
          } catch (err) {
            alert(err.message);
          }
        };
        item.appendChild(btn);
      }
      panel.appendChild(item);
    });
  }, 300);
});

// ---------- Conversación activa ----------
async function openChat(chatId, otherUser) {
  currentConversation = { type: 'chat', id: chatId, otherUserId: otherUser._id, title: otherUser.nickname };
  appShell.setAttribute('data-view', 'chat'); // en móvil, muestra el chat a pantalla completa
  document.getElementById('emptyPlaceholder').classList.add('hidden');
  document.getElementById('activeChatView').classList.remove('hidden');
  document.getElementById('chatHeaderAvatar').innerHTML = avatarHtml(otherUser);
  document.getElementById('chatHeaderName').textContent = otherUser.nickname;
  document.getElementById('chatHeaderName').style.color = otherUser.nameColor || '#1d4cc0';
  document.getElementById('chatHeaderSub').textContent = otherUser.statusMessage || statusLabel(otherUser.status);
  bindProfileLink(document.getElementById('chatHeaderAvatar'), otherUser.nickname);
  bindProfileLink(document.getElementById('chatHeaderName'), otherUser.nickname);

  const viewBlogBtn = document.getElementById('viewBlogBtn');
  viewBlogBtn.classList.remove('hidden');
  viewBlogBtn.onclick = () => window.open(`/blog.html?u=${encodeURIComponent(otherUser.nickname)}`, '_blank');

  const viewProfileBtn = document.getElementById('viewProfileBtn');
  viewProfileBtn.classList.remove('hidden');
  viewProfileBtn.onclick = () => openProfile(otherUser.nickname);

  document.getElementById('nudgeBtn').classList.remove('hidden');

  const { messages } = await api(`/chats/${chatId}/messages`);
  renderMessages(messages);
  renderList();
}

async function openRoom(room) {
  if (currentConversation?.type === 'room') {
    socket.emit('room:leave', currentConversation.id);
  }
  currentConversation = { type: 'room', id: room._id, title: room.name };
  appShell.setAttribute('data-view', 'chat'); // en móvil, muestra la sala a pantalla completa
  socket.emit('room:join', room._id);

  document.getElementById('emptyPlaceholder').classList.add('hidden');
  document.getElementById('activeChatView').classList.remove('hidden');
  document.getElementById('chatHeaderAvatar').textContent = room.icon;
  document.getElementById('chatHeaderName').textContent = room.name;
  document.getElementById('chatHeaderName').style.color = '#1d4cc0';
  document.getElementById('chatHeaderSub').textContent = room.description || 'Sala temática';
  // Una sala no es una persona: se quita el enlace a perfil que haya
  // quedado de una conversación 1 a 1 anterior.
  [document.getElementById('chatHeaderAvatar'), document.getElementById('chatHeaderName')].forEach((el) => {
    el.classList.remove('user-link');
    el.title = '';
    el.onclick = null;
  });

  // El zumbido y el perfil/página personal son cosas 1 a 1; no aplican en salas grupales.
  document.getElementById('viewBlogBtn').classList.add('hidden');
  document.getElementById('viewProfileBtn').classList.add('hidden');
  document.getElementById('nudgeBtn').classList.add('hidden');

  const { messages } = await api(`/rooms/${room._id}/messages`);
  renderMessages(messages);
  renderList();
}

function renderMessages(messages) {
  const area = document.getElementById('messagesArea');
  area.innerHTML = '';
  messages.forEach(appendMessage);
}

// Inserta un aviso local (no se guarda en la base de datos), usado para
// notificar zumbidos dentro de la conversación abierta.
function appendSystemMessage(text) {
  const area = document.getElementById('messagesArea');
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function appendMessage(message) {
  const area = document.getElementById('messagesArea');
  const isOwn = message.sender._id === me.id || message.sender._id === me._id;
  const row = document.createElement('div');
  row.className = 'message-row' + (isOwn ? ' own' : '');

  const time = new Date(message.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

  row.innerHTML = `
    <div class="message-meta"><span class="author" style="color:${message.sender.nameColor || '#333'}">${escapeHtml(message.sender.nickname)}</span> · ${time}</div>
    <div class="message-bubble">${renderMessageContent(message.content)}</div>
    ${!isOwn ? '<div class="message-actions">Reportar</div>' : ''}
  `;

  if (!isOwn) {
    row.querySelector('.message-actions').onclick = () => openReportModal(message._id);
  }

  area.appendChild(row);
  area.scrollTop = area.scrollHeight;
}

// ---------- Envío de mensajes ----------
document.getElementById('sendBtn').onclick = sendMessage;
document.getElementById('messageInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  } else {
    notifyTyping();
  }
});

function notifyTyping() {
  if (currentConversation?.type === 'chat') {
    socket.emit('chat:typing', { chatId: currentConversation.id, toUserId: currentConversation.otherUserId });
  }
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content || !currentConversation) return;

  if (currentConversation.type === 'chat') {
    socket.emit('chat:message', { chatId: currentConversation.id, content });
  } else {
    socket.emit('room:message', { roomId: currentConversation.id, content });
  }
  input.value = '';
}

// ---------- Selector de emoticonos clásicos (estilo mensajería 2000s) ----------
(function setupEmoticonPicker() {
  const picker = document.getElementById('emoticonPicker');
  const btn = document.getElementById('emoticonBtn');
  const input = document.getElementById('messageInput');

  picker.innerHTML = EMOTICON_PICKER_LIST.map((code) => {
    const emojiHtml = renderMessageContent(code); // el código ya escapado, convertido a su emoji
    return `<button type="button" title="${escapeHtml(code)}" data-code="${escapeHtml(code)}">${emojiHtml}</button>`;
  }).join('');

  picker.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const code = b.dataset.code;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + code + input.value.slice(end);
      input.focus();
      input.selectionStart = input.selectionEnd = start + code.length;
      picker.classList.add('hidden');
    };
  });

  btn.onclick = () => picker.classList.toggle('hidden');

  document.addEventListener('click', (e) => {
    if (!picker.classList.contains('hidden') && !picker.contains(e.target) && e.target !== btn) {
      picker.classList.add('hidden');
    }
  });
})();

// ---------- Zumbido (nudge) ----------
const NUDGE_COOLDOWN_MS = 8000;
let nudgeCooldownUntil = 0;

document.getElementById('nudgeBtn').onclick = () => {
  if (!currentConversation || currentConversation.type !== 'chat') return;
  if (Date.now() < nudgeCooldownUntil) return;

  socket.emit('chat:nudge', { chatId: currentConversation.id, toUserId: currentConversation.otherUserId });
  appendSystemMessage(`⚡ Le enviaste un zumbido a ${currentConversation.title}`);
  shakeChatWindow();

  nudgeCooldownUntil = Date.now() + NUDGE_COOLDOWN_MS;
  const btn = document.getElementById('nudgeBtn');
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; }, NUDGE_COOLDOWN_MS);
};

socket.on('chat:nudge', async ({ chatId, nickname }) => {
  // Si la conversación ya está abierta, solo sacude y suena.
  if (currentConversation?.type === 'chat' && currentConversation.id === chatId) {
    appendSystemMessage(`⚡ ¡${nickname} te ha enviado un zumbido!`);
    shakeChatWindow();
    playNudgeSound();
    return;
  }

  // Si no, la abrimos automáticamente (igual que hacía el MSN original).
  await loadChats();
  const found = chatsCache.find((c) => c.chatId === chatId);
  if (found) {
    await openChat(found.chatId, found.otherUser);
    appendSystemMessage(`⚡ ¡${nickname} te ha enviado un zumbido!`);
    shakeChatWindow();
  }
  playNudgeSound();
});

function shakeChatWindow() {
  const el = document.getElementById('activeChatView');
  el.classList.remove('nudge-shake');
  // Forzar reflow para poder reiniciar la animación si se recibe otro zumbido seguido
  void el.offsetWidth;
  el.classList.add('nudge-shake');
  if (navigator.vibrate) {
    try { navigator.vibrate([80, 40, 80, 40, 120]); } catch (e) { /* no soportado, se ignora */ }
  }
}

// Sonido de zumbido sintetizado con Web Audio API (no es un archivo de
// audio de terceros, se genera en el momento).
let sharedAudioCtx = null;
function playNudgeSound() {
  try {
    sharedAudioCtx = sharedAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = sharedAudioCtx;
    const duration = 0.5;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);

    // Vibrato rápido de frecuencia para simular el "buzz" clásico
    for (let t = 0; t < duration; t += 0.05) {
      osc.frequency.setValueAtTime(t % 0.1 < 0.05 ? 180 : 260, now + t);
    }

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    // Si el navegador bloquea audio sin interacción previa, simplemente no suena.
  }
}

// ---------- Reportar mensaje ----------
let reportingMessageId = null;

function openReportModal(messageId) {
  reportingMessageId = messageId;
  document.getElementById('reportReason').value = '';
  document.getElementById('reportError').textContent = '';
  document.getElementById('reportModal').classList.remove('hidden');
}

document.getElementById('cancelReportBtn').onclick = () => {
  document.getElementById('reportModal').classList.add('hidden');
};

document.getElementById('submitReportBtn').onclick = async () => {
  const reason = document.getElementById('reportReason').value.trim();
  const errorEl = document.getElementById('reportError');
  if (!reason) {
    errorEl.textContent = 'Debes escribir un motivo.';
    return;
  }
  try {
    await api('/reports', { method: 'POST', body: JSON.stringify({ messageId: reportingMessageId, reason }) });
    document.getElementById('reportModal').classList.add('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
  }
};

// ---------- Crear foro ----------
let newRoomTagsSelected = [];

document.getElementById('createRoomBtn').onclick = () => {
  document.getElementById('newRoomName').value = '';
  document.getElementById('newRoomDescription').value = '';
  document.getElementById('newRoomIcon').value = '';
  document.getElementById('createRoomError').textContent = '';
  newRoomTagsSelected = [];
  renderInterestPicker(document.getElementById('newRoomTags'), newRoomTagsSelected, (selected) => {
    newRoomTagsSelected = selected;
  });
  document.getElementById('createRoomModal').classList.remove('hidden');
};

document.getElementById('cancelCreateRoomBtn').onclick = () => {
  document.getElementById('createRoomModal').classList.add('hidden');
};

document.getElementById('submitCreateRoomBtn').onclick = async () => {
  const name = document.getElementById('newRoomName').value.trim();
  const description = document.getElementById('newRoomDescription').value.trim();
  const icon = document.getElementById('newRoomIcon').value.trim();
  const errorEl = document.getElementById('createRoomError');
  errorEl.textContent = '';

  if (!name) {
    errorEl.textContent = 'El nombre del foro es obligatorio.';
    return;
  }

  try {
    await api('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, description, icon, tags: newRoomTagsSelected })
    });
    document.getElementById('createRoomModal').classList.add('hidden');
    await loadRooms();
    renderList();
  } catch (err) {
    errorEl.textContent = err.message;
  }
};

// ---------- Util ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Cierre genérico de modales (clic afuera / tecla Escape) ----------
// Cada modal ya se cierra con su propio botón "Cancelar", pero además se
// agregan dos formas adicionales, consistentes en TODOS los modales de la
// app, para que nunca quede uno atrapado sin poder cerrarlo:
//   1) Clic en el fondo oscuro (fuera de la caja del modal).
//   2) Tecla Escape, mientras haya algún modal visible.
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((overlay) => {
    overlay.classList.add('hidden');
  });
});

// ---------- Buscador de perfiles ----------
// Modal independiente de la búsqueda de "Amigos": no agrega amigos, solo
// permite encontrar a cualquier persona por apodo y entrar a su perfil
// público. Disponible en cualquier momento desde el ícono 🔍 de la
// titlebar, en cualquier tamaño de pantalla.
document.getElementById('profileSearchBtn').onclick = () => {
  const input = document.getElementById('profileSearchInput');
  input.value = '';
  document.getElementById('profileSearchResults').innerHTML = '';
  document.getElementById('profileSearchModal').classList.remove('hidden');
  input.focus();
};

document.getElementById('closeProfileSearchBtn').onclick = () => {
  document.getElementById('profileSearchModal').classList.add('hidden');
};

let profileSearchDebounce = null;
document.getElementById('profileSearchInput').addEventListener('input', (e) => {
  clearTimeout(profileSearchDebounce);
  const q = e.target.value;
  const results = document.getElementById('profileSearchResults');
  profileSearchDebounce = setTimeout(async () => {
    if (!q.trim()) {
      results.innerHTML = '';
      return;
    }
    let users = [];
    try {
      ({ users } = await api(`/users/search?q=${encodeURIComponent(q)}`));
    } catch (err) {
      results.innerHTML = `<div class="system-msg">${escapeHtml(err.message)}</div>`;
      return;
    }
    if (users.length === 0) {
      results.innerHTML = '<div class="system-msg">Sin resultados</div>';
      return;
    }
    results.innerHTML = '';
    users.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="avatar-circle">${avatarHtml(u)}</div>
        <div class="list-item-text">
          <div class="list-item-name" style="color:${u.nameColor || '#333'}">${escapeHtml(u.nickname)}</div>
          <div class="list-item-sub">${statusLabel(u.status)}</div>
        </div>`;
      // Toda la fila lleva al perfil: es un buscador de perfiles, a
      // diferencia de la búsqueda de la pestaña "Amigos" (que agrega).
      item.onclick = () => openProfile(u.nickname);
      bindProfileLink(item.querySelector('.avatar-circle'), u.nickname);
      bindProfileLink(item.querySelector('.list-item-name'), u.nickname);
      results.appendChild(item);
    });
  }, 300);
});

init();