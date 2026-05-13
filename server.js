require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const { customAlphabet } = require('nanoid');
const UAParser = require('ua-parser-js');

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const slugId = customAlphabet('23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 9);
const defaultRedirectUrl = process.env.DEFAULT_REDIRECT_URL || 'https://news.google.com/';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not configured. Ghost will return 503 until PostgreSQL is connected.');
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false
    })
  : null;

app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('Accept-CH', 'Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Bitness');
  res.setHeader('Critical-CH', 'Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version');
  res.setHeader('Permissions-Policy', 'ch-ua-model=*, ch-ua-platform=*, ch-ua-platform-version=*, ch-ua-full-version-list=*, ch-ua-arch=*, ch-ua-bitness=*');
  next();
});
app.use(express.json({ limit: '150kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(
  session({
    store: pool ? new PgSession({ pool, createTableIfMissing: true }) : undefined,
    name: 'ghost.sid',
    secret: process.env.SESSION_SECRET || 'ghost-local-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', requireDatabase);

app.get('/health', async (req, res) => {
  if (!pool) {
    return res.status(503).json({ ok: false, error: 'DATABASE_URL is missing' });
  }

  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.session.userId);
  res.json({ user: publicUser(user), baseUrl: publicBaseUrl(req) });
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contrasena son obligatorios.' });
  }

  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user), baseUrl: publicBaseUrl(req) });
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.put('/api/phone', requireAuth, async (req, res) => {
  const country = cleanText(req.body.country, 12);
  const dialCode = cleanText(req.body.dialCode, 8);
  const phoneNumber = cleanText(req.body.phoneNumber, 32);
  const e164 = cleanText(req.body.e164, 32);

  if (!dialCode || !phoneNumber || !e164) {
    return res.status(400).json({ error: 'Guarda un numero valido con codigo de pais.' });
  }

  const result = await pool.query(
    `UPDATE users
     SET phone_country = $1, phone_dial_code = $2, phone_number = $3, phone_e164 = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [country, dialCode, phoneNumber, e164, req.session.userId]
  );
  res.json({ user: publicUser(result.rows[0]) });
});

app.get('/api/links', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT l.*,
            COUNT(v.id)::int AS visit_count,
            MAX(v.created_at) AS last_visit_at
     FROM links l
     LEFT JOIN visits v ON v.link_id = l.id
     WHERE l.user_id = $1
     GROUP BY l.id
     ORDER BY l.created_at DESC`,
    [req.session.userId]
  );

  res.json({
    links: result.rows.map((link) => ({
      ...link,
      share_url: `${publicBaseUrl(req)}/g/${link.slug}`
    }))
  });
});

app.post('/api/links', requireAuth, async (req, res) => {
  const title = cleanText(req.body.title, 80) || 'Ghost link';
  const destination = cleanUrl(req.body.destinationUrl);
  const slug = slugId();

  const result = await pool.query(
    `INSERT INTO links (user_id, slug, title, destination_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.session.userId, slug, title, destination]
  );

  res.status(201).json({ link: { ...result.rows[0], share_url: `${publicBaseUrl(req)}/g/${slug}` } });
});

app.get('/api/links/:id/visits', requireAuth, async (req, res) => {
  const linkId = Number(req.params.id);
  const owns = await pool.query('SELECT id FROM links WHERE id = $1 AND user_id = $2', [linkId, req.session.userId]);
  if (!owns.rows[0]) {
    return res.status(404).json({ error: 'Link no encontrado.' });
  }

  const result = await pool.query(
    `SELECT *
     FROM visits
     WHERE link_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [linkId]
  );
  res.json({ visits: result.rows });
});

app.get('/g/:slug', async (req, res) => {
  if (!pool) {
    return res.status(503).send('Ghost necesita DATABASE_URL para registrar visitas.');
  }

  const result = await pool.query('SELECT id, slug, title, destination_url FROM links WHERE slug = $1', [req.params.slug]);
  const link = result.rows[0];
  if (!link) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'not-found.html'));
  }

  res.send(renderTrackPage(link));
});

app.post('/api/track/:slug', async (req, res) => {
  const result = await pool.query('SELECT * FROM links WHERE slug = $1', [req.params.slug]);
  const link = result.rows[0];
  if (!link) {
    return res.status(404).json({ error: 'Link no encontrado.' });
  }

  const parsed = UAParser(req.get('user-agent') || '');
  const clientData = typeof req.body.clientData === 'object' && req.body.clientData ? req.body.clientData : {};
  const highEntropy = clientData.highEntropy || {};
  const hintedPlatform = cleanText(highEntropy.platform, 80);
  const hintedModel = cleanText(highEntropy.model, 120);
  const hintedArch = cleanText(highEntropy.architecture, 40);

  await pool.query(
    `INSERT INTO visits (
      link_id, ip, method, user_agent, referer, accept_language,
      browser_name, browser_version, os_name, os_version,
      device_type, device_vendor, device_model, cpu_architecture, client_data
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14, $15
    )`,
    [
      link.id,
      getClientIp(req),
      req.method,
      req.get('user-agent') || '',
      req.get('referer') || '',
      req.get('accept-language') || '',
      parsed.browser.name || '',
      parsed.browser.version || '',
      hintedPlatform || parsed.os.name || '',
      parsed.os.version || '',
      parsed.device.type || 'desktop',
      parsed.device.vendor || '',
      hintedModel || parsed.device.model || '',
      hintedArch || parsed.cpu.architecture || '',
      JSON.stringify(clientData)
    ]
  );

  res.json({ ok: true, destinationUrl: link.destination_url || defaultRedirectUrl });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

init().then(() => {
  app.listen(port, () => {
    console.log(`Ghost running on port ${port}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

async function init() {
  if (!pool) return;

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  const username = process.env.GHOST_ADMIN_USER || 'admin';
  const password = process.env.GHOST_ADMIN_PASSWORD || 'ghost12345';
  const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (!exists.rows[0]) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [username, hash]);
    console.log(`Created Ghost admin user: ${username}`);
  }
}

function shouldUseSsl() {
  if (process.env.DB_SSLMODE === 'disable') return false;
  return isProduction || process.env.DB_SSLMODE === 'require' || /railway/i.test(process.env.DATABASE_URL || '');
}

function requireDatabase(req, res, next) {
  if (!pool) {
    return res.status(503).json({ error: 'Configura DATABASE_URL para usar Ghost.' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Inicia sesion.' });
  }
  next();
}

async function getUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0];
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    phoneCountry: user.phone_country || '',
    phoneDialCode: user.phone_dial_code || '',
    phoneNumber: user.phone_number || '',
    phoneE164: user.phone_e164 || ''
  };
}

function publicBaseUrl(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '';
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanUrl(value) {
  const raw = cleanText(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderTrackPage(link) {
  const payload = JSON.stringify({
    slug: link.slug,
    title: link.title,
    destinationUrl: link.destination_url || defaultRedirectUrl
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(link.title)} | Ghost</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="track-body">
  <main class="track-shell">
    <div class="ghost-mark">GHOST</div>
    <h1>Abriendo enlace seguro</h1>
    <p>Estamos preparando el acceso.</p>
    <div class="loader"></div>
  </main>
  <script>window.GHOST_LINK = ${payload};</script>
  <script src="/track.js"></script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
