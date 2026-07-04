const API = (window.LBM_API_BASE || '') + '/api';
const token = localStorage.getItem('lbm_token');
const me = JSON.parse(localStorage.getItem('lbm_user') || 'null');

if (!token || !me) window.location.href = '/index.html';

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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Control de acceso ----------
if (!['admin', 'superadmin'].includes(me.role)) {
  document.getElementById('adminContent').classList.add('hidden');
  document.getElementById('accessDenied').classList.remove('hidden');
} else {
  if (me.role === 'superadmin') {
    document.getElementById('createRoomBox').classList.remove('hidden');
  }
  init();
}

// ---------- Tabs ----------
document.querySelectorAll('.sidebar-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['reports', 'users', 'rooms'].forEach((t) => {
      document.getElementById(`${t}Tab`).classList.toggle('hidden', t !== btn.dataset.tab);
    });
  });
});

async function init() {
  await Promise.all([loadReports(), loadUsers(), loadRooms()]);
}

// ---------- Reportes ----------
async function loadReports() {
  const { reports } = await api('/admin/reports');
  const body = document.getElementById('reportsBody');
  body.innerHTML = '';

  reports.forEach((r) => {
    const tr = document.createElement('tr');
    const date = new Date(r.createdAt).toLocaleString('es-CL');
    tr.innerHTML = `
      <td>${date}</td>
      <td>${escapeHtml(r.messageContentSnapshot)}</td>
      <td>${escapeHtml(r.messageAuthor?.nickname || '—')}</td>
      <td>${escapeHtml(r.reportedBy?.nickname || '—')}</td>
      <td>${escapeHtml(r.reason)}</td>
      <td><span class="tag ${r.status}">${r.status}</span></td>
      <td class="row-actions"></td>
    `;
    const actionsCell = tr.querySelector('.row-actions');

    if (r.status === 'pending') {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.textContent = 'Eliminar mensaje';
      delBtn.onclick = async () => {
        await api(`/admin/reports/${r._id}/delete-message`, { method: 'POST' });
        await loadReports();
      };

      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn secondary';
      dismissBtn.textContent = 'Descartar';
      dismissBtn.onclick = async () => {
        await api(`/admin/reports/${r._id}/dismiss`, { method: 'POST' });
        await loadReports();
      };

      const banBtn = document.createElement('button');
      banBtn.className = 'btn';
      banBtn.textContent = 'Banear autor';
      banBtn.onclick = async () => {
        if (!confirm(`¿Suspender a ${r.messageAuthor?.nickname}?`)) return;
        await api(`/admin/users/${r.messageAuthor._id}/ban`, { method: 'POST' });
        await loadUsers();
        alert('Usuario suspendido.');
      };

      actionsCell.append(delBtn, dismissBtn, banBtn);
    }
    body.appendChild(tr);
  });
}

// ---------- Usuarios ----------
async function loadUsers() {
  const { users } = await api('/admin/users');
  const body = document.getElementById('usersBody');
  body.innerHTML = '';

  users.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.nickname)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.role}</td>
      <td>${u.isBanned ? '<span class="tag pending">Suspendido</span>' : '<span class="tag reviewed">Activo</span>'}</td>
      <td class="row-actions"></td>
    `;
    const actionsCell = tr.querySelector('.row-actions');

    const toggleBanBtn = document.createElement('button');
    toggleBanBtn.className = u.isBanned ? 'btn' : 'btn danger';
    toggleBanBtn.textContent = u.isBanned ? 'Reactivar' : 'Suspender';
    toggleBanBtn.onclick = async () => {
      await api(`/admin/users/${u._id}/${u.isBanned ? 'unban' : 'ban'}`, { method: 'POST' });
      await loadUsers();
    };
    actionsCell.appendChild(toggleBanBtn);

    if (me.role === 'superadmin' && u._id !== me.id && u._id !== me._id) {
      const roleBtn = document.createElement('button');
      roleBtn.className = 'btn secondary';
      roleBtn.textContent = u.role === 'admin' ? 'Quitar admin' : 'Hacer admin';
      roleBtn.onclick = async () => {
        await api(`/admin/users/${u._id}/${u.role === 'admin' ? 'demote' : 'promote'}`, { method: 'POST' });
        await loadUsers();
      };
      actionsCell.appendChild(roleBtn);
    }

    body.appendChild(tr);
  });
}

// ---------- Salas ----------
async function loadRooms() {
  const { rooms } = await api('/rooms');
  const body = document.getElementById('roomsBody');
  body.innerHTML = '';

  rooms.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.icon}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.description || '')}</td>
      <td>${r.isGlobal ? 'Chat global' : 'Sala temática'}</td>
      <td class="row-actions"></td>
    `;
    if (me.role === 'superadmin' && !r.isGlobal) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.textContent = 'Eliminar';
      delBtn.onclick = async () => {
        if (!confirm(`¿Eliminar la sala "${r.name}"?`)) return;
        await api(`/admin/rooms/${r._id}`, { method: 'DELETE' });
        await loadRooms();
      };
      tr.querySelector('.row-actions').appendChild(delBtn);
    }
    body.appendChild(tr);
  });
}

document.getElementById('createRoomBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('newRoomName').value.trim();
  const slug = document.getElementById('newRoomSlug').value.trim();
  const icon = document.getElementById('newRoomIcon').value.trim() || '💬';
  const description = document.getElementById('newRoomDesc').value.trim();

  if (!name || !slug) return alert('Nombre y slug son obligatorios.');

  try {
    await api('/admin/rooms', { method: 'POST', body: JSON.stringify({ name, slug, icon, description }) });
    document.getElementById('newRoomName').value = '';
    document.getElementById('newRoomSlug').value = '';
    document.getElementById('newRoomIcon').value = '';
    document.getElementById('newRoomDesc').value = '';
    await loadRooms();
  } catch (err) {
    alert(err.message);
  }
});
