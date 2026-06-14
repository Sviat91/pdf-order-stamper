const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app         = express();
const PORT        = 3001;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILES   = 10;

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use('/files', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

function cleanupOldFiles() {
  const entries = fs.readdirSync(UPLOADS_DIR)
    .filter(n => n.endsWith('.pdf'))
    .map(n => ({ name: n, mtime: fs.statSync(path.join(UPLOADS_DIR, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  entries.slice(MAX_FILES).forEach(({ name }) => {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, name)); } catch (_) {}
  });
}

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  cleanupOldFiles();
  res.json({ filename: req.file.filename });
});

app.get('/api/files', (_req, res) => {
  const files = fs.readdirSync(UPLOADS_DIR)
    .filter(n => n.endsWith('.pdf'))
    .map(n => ({ name: n, mtime: fs.statSync(path.join(UPLOADS_DIR, n)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(f => f.name);
  res.json(files);
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
