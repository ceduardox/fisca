const app = document.getElementById('app');

let state = {
  user: null,
  baseUrl: '',
  links: [],
  selectedLinkId: null,
  visits: [],
  phoneInput: null
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
  state.selectedLinkId = state.selectedLinkId || state.links[0]?.id || null;
  if (state.selectedLinkId) await loadVisits(state.selectedLinkId, false);
  renderDashboard();
}

async function loadVisits(linkId, rerender = true) {
  const data = await api(`/api/links/${linkId}/visits`);
  state.selectedLinkId = linkId;
  state.visits = data.visits;
  if (rerender) renderDashboard();
}

function renderDashboard() {
  const selected = state.links.find((link) => link.id === state.selectedLinkId) || state.links[0];
  app.innerHTML = `
    <main class="dashboard">
      <aside class="sidebar">
        <div class="brand-row">
          <div class="ghost-icon">G</div>
          <strong>GHOST</strong>
        </div>
        <nav>
          <button class="nav-btn active">Panel</button>
          <button class="nav-btn" id="logoutBtn">Salir</button>
        </nav>
      </aside>
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
                <p class="eyebrow">Telefono base</p>
                <h2>Numero principal</h2>
              </div>
              <span class="pill">${state.user.phoneCountry || 'sin pais'}</span>
            </div>
            <form id="phoneForm" class="phone-form">
              <input id="phoneInput" type="tel" value="${escapeAttr(state.user.phoneNumber)}">
              <button class="primary-btn" type="submit">Guardar numero</button>
            </form>
            <p class="hint">Solo se guarda un numero base por usuario. Puedes reemplazarlo cuando quieras.</p>
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
              ${state.visits.length ? state.visits.map(renderVisit).join('') : '<p class="empty">Aun no hay aperturas registradas.</p>'}
            </div>
          </article>
        </section>
      </section>
    </main>
  `;

  bindDashboard();
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

function renderVisit(visit) {
  const client = visit.client_data || {};
  const screen = client.screen || {};
  const connection = client.connection || {};
  const highEntropy = client.highEntropy || {};
  const detectedModel = highEntropy.model || visit.device_model || '';
  const detectedPlatform = [highEntropy.platform || visit.os_name, highEntropy.platformVersion || visit.os_version].filter(Boolean).join(' ');
  const browserVersions = Array.isArray(highEntropy.fullVersionList)
    ? highEntropy.fullVersionList.map((item) => `${item.brand} ${item.version}`).join(', ')
    : '';
  return `
    <details class="visit" open>
      <summary>
        <span>
          <strong>${escapeHtml(visit.os_name || 'Sistema desconocido')} ${escapeHtml(visit.os_version || '')}</strong>
          <small>${formatDate(visit.created_at)} - ${escapeHtml(visit.ip || 'sin IP')}</small>
        </span>
        <b>${escapeHtml(visit.device_type || 'desktop')}</b>
      </summary>
      <div class="visit-grid">
        <p><span>Navegador</span>${escapeHtml(browserVersions || `${visit.browser_name || ''} ${visit.browser_version || ''}`)}</p>
        <p><span>Marca / modelo</span>${escapeHtml([visit.device_vendor, detectedModel].filter(Boolean).join(' ') || 'No expuesto')}</p>
        <p><span>Plataforma</span>${escapeHtml(detectedPlatform || client.platform || 'No expuesto')}</p>
        <p><span>Pantalla</span>${screen.width || '-'} x ${screen.height || '-'} @ ${screen.devicePixelRatio || 1}</p>
        <p><span>Idioma</span>${escapeHtml(client.language || visit.accept_language || '')}</p>
        <p><span>Zona horaria</span>${escapeHtml(client.timezone || '')}</p>
        <p><span>CPU / memoria</span>${client.hardwareConcurrency || '-'} nucleos - ${client.deviceMemory || '-'} GB</p>
        <p><span>Conexion</span>${escapeHtml(connection.effectiveType || 'No expuesto')}</p>
        <p><span>Referer</span>${escapeHtml(visit.referer || 'Directo')}</p>
      </div>
    </details>
  `;
}

function bindDashboard() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    state = { user: null, baseUrl: '', links: [], selectedLinkId: null, visits: [], phoneInput: null };
    renderLogin();
  });

  document.getElementById('refreshBtn').addEventListener('click', loadDashboard);

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

  setupPhone();
}

function setupPhone() {
  const input = document.getElementById('phoneInput');
  const iti = window.intlTelInput(input, {
    initialCountry: state.user.phoneCountry || 'bo',
    separateDialCode: true,
    nationalMode: false,
    utilsScript: 'https://cdn.jsdelivr.net/npm/intl-tel-input@23.8.1/build/js/utils.js'
  });

  document.getElementById('phoneForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const country = iti.getSelectedCountryData();
    const e164 = iti.getNumber();
    if (!iti.isValidNumber()) {
      showToast('Numero invalido para el pais seleccionado.');
      return;
    }

    const result = await api('/api/phone', {
      method: 'PUT',
      body: {
        country: country.iso2,
        dialCode: `+${country.dialCode}`,
        phoneNumber: input.value,
        e164
      }
    });
    state.user = result.user;
    renderDashboard();
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
