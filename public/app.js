const app = document.getElementById('app');

let state = {
  user: null,
  view: 'panel',
  baseUrl: '',
  links: [],
  selectedLinkId: null,
  visits: [],
  visitPage: 1,
  visitsPerPage: 5,
  users: [],
  phoneInputs: {}
};

init();

async function init() {
  renderLogin(true);
  try {
    const session = await api('/api/me');
    state.user = session.user;
    state.baseUrl = session.baseUrl;
    await loadDashboard();
  } catch {
    renderLogin();
  }
}

function renderLogin(loading = false) {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-visual">
        <div class="logo-orbit">
          <span>G</span>
        </div>
        <p>Ghost</p>
        <h1>Panel oscuro para links inteligentes.</h1>
      </section>
      <section class="auth-card">
        <div class="brand-row">
          <div class="ghost-icon">G</div>
          <strong>GHOST</strong>
        </div>
        <h2>Ingresar</h2>
        <p class="muted">Usa tu usuario y contrasena para entrar al panel.</p>
        <form id="loginForm">
          <label>Usuario
            <input name="username" autocomplete="username" placeholder="admin" required>
          </label>
          <label>Contrasena
            <input name="password" type="password" autocomplete="current-password" placeholder="********" required>
          </label>
          <button class="primary-btn" type="submit">${loading ? 'Cargando...' : 'Entrar'}</button>
        </form>
        <div id="loginError" class="error"></div>
      </section>
    </main>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const session = await api('/api/login', {
        method: 'POST',
        body: {
          username: form.get('username'),
          password: form.get('password')
        }
      });
      state.user = session.user;
      state.baseUrl = session.baseUrl;
      await loadDashboard();
    } catch (error) {
      document.getElementById('loginError').textContent = error.message;
    }
  });
}

async function loadDashboard() {
  const data = await api('/api/links');
  state.links = data.links;
  if (state.user?.isAdmin) {
    const users = await api('/api/users');
    state.users = users.users;
  }
  state.selectedLinkId = state.selectedLinkId || state.links[0]?.id || null;
  if (state.selectedLinkId) await loadVisits(state.selectedLinkId, false);
  renderDashboard();
}

async function loadVisits(linkId, rerender = true) {
  const data = await api(`/api/links/${linkId}/visits`);
  if (state.selectedLinkId !== linkId) {
    state.visitPage = 1;
  }
  state.selectedLinkId = linkId;
  state.visits = data.visits;
  if (rerender) renderDashboard();
}

function renderDashboard() {
  if (state.view === 'conversations') {
    renderConversations();
    return;
  }

  const selected = state.links.find((link) => link.id === state.selectedLinkId) || state.links[0];
  const pagedVisits = getPagedVisits();
  app.innerHTML = `
    <main class="dashboard">
      ${renderSidebar('panel')}
      <section class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">Base activa</p>
            <h1>${state.user.phoneE164 || 'Configura tu numero Ghost'}</h1>
          </div>
          <button class="soft-btn" id="refreshBtn">Actualizar</button>
        </header>

        <section class="grid two">
          <article class="panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">WhatsApp asignado</p>
                <h2>Numero principal</h2>
              </div>
              <span class="pill">${state.user.phoneCountry || 'sin pais'}</span>
            </div>
            <div class="readonly-phone">
              <strong>${escapeHtml(state.user.phoneE164 || 'Sin numero asignado')}</strong>
              <span>El administrador gestiona este numero.</span>
            </div>
            <p class="hint">Este numero es el WhatsApp base asignado a tu usuario.</p>
          </article>

          <article class="panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Generador</p>
                <h2>Crear link</h2>
              </div>
            </div>
            <form id="linkForm" class="stack">
              <label>Titulo
                <input name="title" placeholder="Acceso Ghost" required>
              </label>
              <label>Destino opcional
                <input name="destinationUrl" type="url" placeholder="https://...">
              </label>
              <button class="primary-btn" type="submit">Generar link</button>
            </form>
          </article>

          ${state.user.isAdmin ? renderUsersPanel() : ''}
        </section>

        <section class="grid split">
          <article class="panel links-panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Links</p>
                <h2>Compartibles</h2>
              </div>
            </div>
            <div class="link-list">
              ${state.links.length ? state.links.map(renderLinkItem).join('') : '<p class="empty">Todavia no hay links.</p>'}
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <div>
                <p class="eyebrow">Lecturas</p>
                <h2>${selected ? selected.title : 'Sin link seleccionado'}</h2>
              </div>
              ${selected ? `<span class="pill">${selected.visit_count || 0} visitas</span>` : ''}
            </div>
            <div class="visit-list">
              ${pagedVisits.length ? pagedVisits.map(renderVisit).join('') : '<p class="empty">Aun no hay aperturas registradas.</p>'}
            </div>
            ${renderVisitPagination()}
          </article>
        </section>
      </section>
    </main>
  `;

  bindDashboard();
}

function renderConversations() {
  app.innerHTML = `
    <main class="dashboard">
      ${renderSidebar('conversations')}
      <section class="workspace">
        <header class="topbar">
          <div>
            <p class="eyebrow">WhatsApp asignado</p>
            <h1>${escapeHtml(state.user.phoneE164 || 'Sin numero asignado')}</h1>
          </div>
          <button class="soft-btn" id="refreshBtn">Actualizar</button>
        </header>

        <section class="phone-preview">
          <div class="wa-frame">
            <div class="wa-head">
              <div>
                <p>WhatsApp</p>
                <span>${escapeHtml(state.user.phoneE164 || 'Esperando asignacion')}</span>
              </div>
              <div class="wa-actions">
                <span></span>
                <span></span>
              </div>
            </div>
            <div class="wa-tabs">
              <strong>Chats</strong>
              <span>Llamadas</span>
              <span>Novedades</span>
            </div>
            <div class="wa-sync">
              <span></span>
              <b>Sincronizando conversaciones</b>
            </div>
            <div class="wa-list">
              ${renderConversationRows()}
            </div>
          </div>
        </section>
      </section>
    </main>
  `;

  bindDashboard();
}

function renderSidebar(activeView) {
  return `
    <aside class="sidebar">
      <div class="brand-row">
        <div class="ghost-icon">G</div>
        <strong>GHOST</strong>
      </div>
      <nav>
        <button class="nav-btn ${activeView === 'panel' ? 'active' : ''}" data-view="panel">Panel</button>
        <button class="nav-btn ${activeView === 'conversations' ? 'active' : ''}" data-view="conversations">Conversaciones</button>
        <button class="nav-btn" id="logoutBtn">Salir</button>
      </nav>
    </aside>
  `;
}

function renderConversationRows() {
  const rows = [
    { name: '+591 70513023', date: '27/4/2026', type: 'call', color: '#163f2c' },
    { name: '+591 77045416', date: '27/4/2026', type: 'call', color: '#493321' },
    { name: '+591 73196786', date: '27/4/2026', type: 'call', color: '#0b3155' },
    { name: '+591 68007182', date: '24/4/2026', type: 'missed', color: '#2b2f34', unread: 1 },
    { name: 'Pet Servi', date: '23/4/2026', type: 'message', color: '#0d58c7' },
    { name: '+591 71681920', date: '23/4/2026', type: 'image', color: '#064b2e' },
    { name: 'Mami Hermosa', date: '21/4/2026', type: 'photo', color: '#461329' }
  ];

  return rows.map((row, index) => `
    <div class="wa-row">
      <div class="wa-avatar" style="--avatar-color:${row.color}">
        <span>${escapeHtml(row.name.replace('+591 ', '').trim().charAt(0))}</span>
        <i></i>
      </div>
      <div class="wa-copy">
        <strong>${escapeHtml(row.name)} ${index < 2 ? '<span class="wa-dot"></span>' : ''}</strong>
        <p>${renderConversationPreview(row.type)}</p>
      </div>
      <div class="wa-meta">
        <span>${row.date}</span>
        ${row.unread ? '<b>1</b>' : ''}
      </div>
    </div>
  `).join('');
}

function renderConversationPreview(type) {
  const previews = {
    call: 'Llamada',
    missed: 'Llamada perdida',
    message: 'Buenos dias, como le va? somos un...',
    image: 'tenemos este en 260 bs.',
    photo: 'Foto'
  };
  return `<span class="wa-loader"></span>${escapeHtml(previews[type] || 'Cargando mensaje')}`;
}

function renderLinkItem(link) {
  const active = link.id === state.selectedLinkId ? 'active' : '';
  return `
    <button class="link-item ${active}" data-link-id="${link.id}">
      <span>
        <strong>${escapeHtml(link.title)}</strong>
        <small>${escapeHtml(link.share_url)}</small>
      </span>
      <em>${link.visit_count || 0}</em>
    </button>
    <button class="copy-btn" data-copy="${escapeAttr(link.share_url)}">Copiar link</button>
  `;
}

function renderUsersPanel() {
  return `
    <article class="panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Admin</p>
          <h2>Crear acceso</h2>
        </div>
        <span class="pill">${state.users.length} usuarios</span>
      </div>
      <form id="userForm" class="stack">
        <label>Usuario
          <input name="username" autocomplete="off" placeholder="nuevo.usuario" required>
        </label>
        <label>Contrasena
          <input name="password" type="password" autocomplete="new-password" placeholder="minimo 8 caracteres" required>
        </label>
        <label class="check-row">
          <input name="isAdmin" type="checkbox">
          <span>Permitir que tambien cree usuarios</span>
        </label>
        <button class="primary-btn" type="submit">Crear usuario</button>
      </form>
      <div class="user-list">
        ${state.users.map(renderUserItem).join('')}
      </div>
    </article>
  `;
}

function renderUserItem(user) {
  return `
    <div class="user-item">
      <span>
        <strong>${escapeHtml(user.username)}</strong>
        <small>${escapeHtml(user.phoneE164 || 'Sin numero base')}</small>
      </span>
      <em>${user.isAdmin ? 'admin' : 'usuario'}</em>
      <form class="user-phone-form" data-phone-form="${user.id}">
        <input data-phone-user-id="${user.id}" type="tel" value="${escapeAttr(user.phoneNumber || '')}">
        <button class="soft-btn" type="submit">Asignar WhatsApp</button>
      </form>
    </div>
  `;
}

function renderVisit(visit) {
  const client = visit.client_data || {};
  const screen = client.screen || {};
  const connection = client.connection || {};
  const highEntropy = client.highEntropy || {};
  const deviceGuess = client.deviceGuess || {};
  const detectedModel = highEntropy.model || visit.device_model || '';
  const modelDisplay = chooseModelDisplay(detectedModel, deviceGuess);
  const specialStatus = renderSpecialDeviceStatus(modelDisplay, visit.created_at);
  const detectedPlatform = [highEntropy.platform || visit.os_name, highEntropy.platformVersion || visit.os_version].filter(Boolean).join(' ');
  const browserVersions = Array.isArray(highEntropy.fullVersionList)
    ? highEntropy.fullVersionList.map((item) => `${item.brand} ${item.version}`).join(', ')
    : '';
  return `
    <details class="visit">
      <summary>
        <span>
          <strong>${escapeHtml(visit.os_name || 'Sistema desconocido')} ${escapeHtml(visit.os_version || '')}</strong>
          <small>${formatDate(visit.created_at)} - ${escapeHtml(visit.ip || 'sin IP')}</small>
        </span>
        <b>${escapeHtml(visit.device_type || 'desktop')}</b>
      </summary>
      <div class="visit-grid">
        <p><span>Navegador</span>${escapeHtml(browserVersions || `${visit.browser_name || ''} ${visit.browser_version || ''}`)}</p>
        <p><span>Marca / modelo</span>${escapeHtml(formatDeviceName(visit.device_vendor || deviceGuess.family, modelDisplay) || 'No expuesto')}</p>
        <p><span>Metodo modelo</span>${escapeHtml(deviceGuess.method ? `${deviceGuess.method} (${deviceGuess.confidence})` : 'Directo del navegador')}</p>
        <p><span>Plataforma</span>${escapeHtml(detectedPlatform || client.platform || 'No expuesto')}</p>
        <p><span>Pantalla</span>${screen.width || '-'} x ${screen.height || '-'} @ ${screen.devicePixelRatio || 1}</p>
        <p><span>Idioma</span>${escapeHtml(client.language || visit.accept_language || '')}</p>
        <p><span>Zona horaria</span>${escapeHtml(client.timezone || '')}</p>
        <p><span>CPU / memoria</span>${client.hardwareConcurrency || '-'} nucleos - ${client.deviceMemory || '-'} GB</p>
        <p><span>Conexion</span>${escapeHtml(connection.effectiveType || 'No expuesto')}</p>
        <p><span>Referer</span>${escapeHtml(visit.referer || 'Directo')}</p>
      </div>
      ${specialStatus}
    </details>
  `;
}

function chooseModelDisplay(detectedModel, deviceGuess) {
  const model = String(detectedModel || '').trim();
  const guessed = String(deviceGuess.inferredModel || '').trim();
  if (guessed && /^(iphone|ipad|apple touch device)$/i.test(model)) return guessed;
  return model || guessed;
}

function getPagedVisits() {
  const totalPages = Math.max(1, Math.ceil(state.visits.length / state.visitsPerPage));
  state.visitPage = Math.min(Math.max(1, state.visitPage), totalPages);
  const start = (state.visitPage - 1) * state.visitsPerPage;
  return state.visits.slice(start, start + state.visitsPerPage);
}

function renderVisitPagination() {
  if (state.visits.length <= state.visitsPerPage) return '';
  const totalPages = Math.ceil(state.visits.length / state.visitsPerPage);
  return `
    <div class="pager">
      <button class="soft-btn" data-page-action="prev" ${state.visitPage <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Pagina ${state.visitPage} de ${totalPages}</span>
      <button class="soft-btn" data-page-action="next" ${state.visitPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
    </div>
  `;
}

function renderSpecialDeviceStatus(modelDisplay, createdAt) {
  if (!/iPhone 15 Pro Max/i.test(modelDisplay || '')) return '';

  const created = new Date(createdAt).getTime();
  const expiresAt = created + (1000 * 60 * 60 * 24 * 3);
  const expired = Date.now() >= expiresAt;

  if (expired) {
    return `
      <div class="device-status denied">
        <span></span>
        <strong>Sin permiso concedido</strong>
      </div>
    `;
  }

  return `
    <div class="device-status working">
      <span></span>
      <strong>Trabajando</strong>
    </div>
  `;
}

function bindDashboard() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    state = { user: null, view: 'panel', baseUrl: '', links: [], selectedLinkId: null, visits: [], visitPage: 1, visitsPerPage: 5, users: [], phoneInputs: {} };
    renderLogin();
  });

  document.getElementById('refreshBtn').addEventListener('click', loadDashboard);

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      renderDashboard();
    });
  });

  document.querySelectorAll('.link-item').forEach((button) => {
    button.addEventListener('click', () => loadVisits(Number(button.dataset.linkId)));
  });

  document.querySelectorAll('.copy-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copiado';
      setTimeout(() => button.textContent = 'Copiar link', 1200);
    });
  });

  document.querySelectorAll('[data-page-action]').forEach((button) => {
    button.addEventListener('click', () => {
      state.visitPage += button.dataset.pageAction === 'next' ? 1 : -1;
      renderDashboard();
    });
  });

  document.getElementById('linkForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/api/links', {
      method: 'POST',
      body: {
        title: form.get('title'),
        destinationUrl: form.get('destinationUrl')
      }
    });
    await loadDashboard();
  });

  const userForm = document.getElementById('userForm');
  if (userForm) {
    userForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api('/api/users', {
        method: 'POST',
        body: {
          username: form.get('username'),
          password: form.get('password'),
          isAdmin: form.get('isAdmin') === 'on'
        }
      });
      showToast('Usuario creado.');
      await loadDashboard();
    });
  }

  setupAdminPhones();
}

function setupAdminPhones() {
  document.querySelectorAll('[data-phone-user-id]').forEach((input) => {
    const userId = Number(input.dataset.phoneUserId);
    const user = state.users.find((item) => item.id === userId);
    const iti = window.intlTelInput(input, {
      initialCountry: user?.phoneCountry || 'bo',
      separateDialCode: true,
      nationalMode: false,
      utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@23.8.1/build/js/utils.js'
    });
    state.phoneInputs[userId] = iti;
  });

  document.querySelectorAll('[data-phone-form]').forEach((formEl) => {
    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      const userId = Number(formEl.dataset.phoneForm);
      const input = formEl.querySelector('[data-phone-user-id]');
      const iti = state.phoneInputs[userId];
      const country = iti.getSelectedCountryData();
      const e164 = iti.getNumber();
      if (!iti.isValidNumber()) {
        showToast('Numero invalido para el pais seleccionado.');
        return;
      }

      await api(`/api/users/${userId}/phone`, {
        method: 'PUT',
        body: {
          country: country.iso2,
          dialCode: `+${country.dialCode}`,
          phoneNumber: input.value,
          e164
        }
      });
      showToast('Numero asignado.');
      await loadDashboard();
    });
  });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de servidor');
  return data;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDeviceName(brand, model) {
  const cleanBrand = String(brand || '').trim();
  const cleanModel = String(model || '').trim();
  if (!cleanBrand) return cleanModel;
  if (!cleanModel) return cleanBrand;
  if (cleanModel.toLowerCase().startsWith(cleanBrand.toLowerCase())) return cleanModel;
  return `${cleanBrand} ${cleanModel}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
