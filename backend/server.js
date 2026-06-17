require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const crypto  = require('crypto');
const { spawn } = require('child_process');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const app         = express();
const PORT        = 3001;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const USERS_FILE  = path.join(__dirname, 'users.json');
const MAX_FILES   = 10;
const JWT_SECRET  = process.env.JWT_SECRET;

if (!JWT_SECRET) { console.error('JWT_SECRET not set in .env'); process.exit(1); }
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(USERS_FILE))  fs.writeFileSync(USERS_FILE, '[]');

// ── Users helpers ──────────────────────────────────────────
function loadUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function saveUsers(u) { fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2)); }

// Create super-admin on first run (reads from .env, never from code)
;(function initSuperAdmin() {
  const users = loadUsers();
  if (users.length > 0) return;
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) {
    console.warn('No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
    return;
  }
  saveUsers([{ id: 1, email, password: bcrypt.hashSync(password, 12), role: 'superadmin', createdAt: new Date().toISOString() }]);
  console.log(`✓ Super-admin created: ${email}`);
})();

// ── Middleware ─────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/files', express.static(UPLOADS_DIR)); // public for drag-to-OS feature

// ── Auth middleware ────────────────────────────────────────
function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

// ── Auth routes ────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = loadUsers().find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.get('/api/auth/users', requireSuperAdmin, (_req, res) =>
  res.json(loadUsers().map(({ id, email, role, createdAt }) => ({ id, email, role, createdAt })))
);

app.post('/api/auth/users', requireSuperAdmin, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const users = loadUsers();
  if (users.find(u => u.email === email)) return res.status(409).json({ error: 'User already exists' });
  const nu = { id: Date.now(), email, password: bcrypt.hashSync(password, 12), role: 'user', createdAt: new Date().toISOString() };
  users.push(nu);
  saveUsers(users);
  res.status(201).json({ id: nu.id, email: nu.email, role: nu.role });
});

app.delete('/api/auth/users/:id', requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  const users = loadUsers();
  const target = users.find(u => u.id === id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'superadmin') return res.status(403).json({ error: 'Cannot delete super-admin' });
  saveUsers(users.filter(u => u.id !== id));
  res.json({ ok: true });
});

// ── File routes (auth required) ────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename:    (_req, file, cb) => cb(null, file.originalname),
  }),
});

// In-memory upload for decrypt (never touches UPLOADS_DIR)
const memUpload = multer({ storage: multer.memoryStorage() });

// Decrypt an encrypted/restricted PDF with qpdf, return clean bytes
app.post('/api/decrypt', requireAuth, memUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const id     = crypto.randomBytes(8).toString('hex');
  const tmpIn  = path.join(os.tmpdir(), `dec-${id}-in.pdf`);
  const tmpOut = path.join(os.tmpdir(), `dec-${id}-out.pdf`);
  const cleanup = () => { for (const f of [tmpIn, tmpOut]) { try { fs.unlinkSync(f); } catch (_) {} } };

  try {
    fs.writeFileSync(tmpIn, req.file.buffer);
  } catch (e) {
    cleanup();
    return res.status(500).json({ error: 'Could not stage file' });
  }

  const qpdf = spawn('qpdf', ['--decrypt', '--compress-streams=y', '--object-streams=generate', tmpIn, tmpOut]);
  qpdf.on('error', () => { cleanup(); res.status(500).json({ error: 'qpdf is not available' }); });
  qpdf.on('close', (code) => {
    // qpdf: 0 = success, 3 = success with warnings
    if (code === 0 || code === 3) {
      try {
        const out = fs.readFileSync(tmpOut);
        res.type('application/pdf').send(out);
      } catch (e) {
        res.status(500).json({ error: 'Decrypt produced no output' });
      }
    } else {
      res.status(500).json({ error: 'Decrypt failed' });
    }
    cleanup();
  });
});

function cleanupOldFiles() {
  const entries = fs.readdirSync(UPLOADS_DIR)
    .filter(n => n.endsWith('.pdf'))
    .map(n => ({ name: n, mtime: fs.statSync(path.join(UPLOADS_DIR, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  entries.slice(MAX_FILES).forEach(({ name }) => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, name)); } catch (_) {}
  });
}

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  cleanupOldFiles();
  res.json({ filename: req.file.filename });
});

app.get('/api/files', requireAuth, (_req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(n => n.endsWith('.pdf'))
    .map(n => ({ name: n, mtime: fs.statSync(path.join(UPLOADS_DIR, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(f => f.name);
  res.json(files);
});

app.delete('/api/files/:filename', requireAuth, (req, res) => {
  const name = path.basename(req.params.filename); // prevent path traversal
  if (!name.endsWith('.pdf')) return res.status(400).json({ error: 'Invalid filename' });
  const fullPath = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(fullPath);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
