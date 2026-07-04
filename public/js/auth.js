const API = (window.LBM_API_BASE || '') + '/api';

function showScreen(id) {
  ['loginScreen', 'registerScreen', 'otpScreen'].forEach((s) => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

document.getElementById('goRegister').onclick = () => showScreen('registerScreen');
document.getElementById('goLogin').onclick = () => showScreen('loginScreen');

// Si ya hay sesión activa, redirige al chat
if (localStorage.getItem('lbm_token')) {
  window.location.href = '/chat.html';
}

let pendingEmail = '';
let selectedRegisterInterests = [];

renderInterestPicker(document.getElementById('regInterests'), selectedRegisterInterests, (selected) => {
  selectedRegisterInterests = selected;
});

// ---------------------------------------------------------------------
// Ayuda para mostrar el aviso de "espera, plan gratuito" y deshabilitar
// el botón mientras dura la petición al backend (Render Free puede
// tardar en responder si el servicio estaba dormido).
// ---------------------------------------------------------------------
function setPending(button, noticeEl, isPending, idleLabel) {
  button.disabled = isPending;
  if (noticeEl) noticeEl.classList.toggle('hidden', !isPending);
  if (isPending) {
    button.dataset.idleLabel = idleLabel || button.textContent;
    button.textContent = 'Cargando...';
  } else if (button.dataset.idleLabel) {
    button.textContent = button.dataset.idleLabel;
  }
}

function friendlyErrorMessage(err) {
  if (err && err.isTimeoutOrNetwork) {
    return 'No pudimos contactar al servidor (puede estar despertando, es normal en el plan gratuito). Intenta de nuevo en unos segundos.';
  }
  return err.message;
}

// Envuelve fetch con un manejo de errores de red consistente (el backend
// gratuito puede tardar en arrancar y el fetch puede fallar directamente
// en vez de devolver una respuesta HTTP).
async function postJSON(path, body) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    const err = new Error('No se pudo conectar con el servidor.');
    err.isTimeoutOrNetwork = true;
    throw err;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data.error || (res.status === 503
      ? 'El servidor se está iniciando (plan gratuito). Intenta nuevamente en unos segundos.'
      : 'Ocurrió un error inesperado.');
    throw new Error(message);
  }

  return data;
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim();
  const nickname = document.getElementById('regNickname').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('registerError');
  const noticeEl = document.getElementById('registerNotice');
  const btn = document.getElementById('registerSubmitBtn');
  errorEl.textContent = '';

  setPending(btn, noticeEl, true, 'Registrarme');
  try {
    const data = await postJSON('/auth/register', {
      email,
      nickname,
      password,
      interests: selectedRegisterInterests
    });

    pendingEmail = email;
    document.getElementById('otpEmailLabel').textContent = email;
    showScreen('otpScreen');
  } catch (err) {
    errorEl.textContent = friendlyErrorMessage(err);
  } finally {
    setPending(btn, noticeEl, false);
  }
});

document.getElementById('otpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('otpCode').value.trim();
  const errorEl = document.getElementById('otpError');
  const successEl = document.getElementById('otpSuccess');
  const noticeEl = document.getElementById('otpNotice');
  const btn = document.getElementById('otpSubmitBtn');
  errorEl.textContent = '';
  successEl.textContent = '';

  setPending(btn, noticeEl, true, 'Verificar cuenta');
  try {
    const data = await postJSON('/auth/verify-otp', { email: pendingEmail, code });

    localStorage.setItem('lbm_token', data.token);
    localStorage.setItem('lbm_user', JSON.stringify(data.user));
    successEl.textContent = '¡Cuenta verificada! Redirigiendo...';
    setTimeout(() => (window.location.href = '/chat.html'), 800);
  } catch (err) {
    errorEl.textContent = friendlyErrorMessage(err);
  } finally {
    setPending(btn, noticeEl, false);
  }
});

document.getElementById('resendOtp').addEventListener('click', async () => {
  const errorEl = document.getElementById('otpError');
  const successEl = document.getElementById('otpSuccess');
  const noticeEl = document.getElementById('otpNotice');
  const resendBtn = document.getElementById('resendOtp');
  errorEl.textContent = '';
  successEl.textContent = '';

  setPending(resendBtn, noticeEl, true, 'Reenviar código');
  try {
    await postJSON('/auth/resend-otp', { email: pendingEmail });
    successEl.textContent = 'Código reenviado a tu correo.';
  } catch (err) {
    errorEl.textContent = friendlyErrorMessage(err);
  } finally {
    setPending(resendBtn, noticeEl, false);
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const noticeEl = document.getElementById('loginNotice');
  const btn = document.getElementById('loginSubmitBtn');
  errorEl.textContent = '';

  setPending(btn, noticeEl, true, 'Conectarse');
  try {
    const data = await postJSON('/auth/login', { email, password });

    localStorage.setItem('lbm_token', data.token);
    localStorage.setItem('lbm_user', JSON.stringify(data.user));
    window.location.href = '/chat.html';
  } catch (err) {
    errorEl.textContent = friendlyErrorMessage(err);
    setPending(btn, noticeEl, false);
    return;
  }
  // En caso de éxito no se reactiva el botón: la página está redirigiendo.
});
