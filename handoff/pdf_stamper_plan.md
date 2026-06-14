# PDF Order Stamper — Coder Handoff

## Goal
Build a fullstack internal tool: React+Vite frontend + Express backend.
Users drag a PDF in, type an order number, drag the text label to the correct position on the PDF preview canvas, then click Save. pdf-lib burns the text at the correct coordinates, the file is renamed to `{order_number}.pdf`, uploaded to the server, and appears in the right-panel archive (max 10 files; oldest auto-deleted).

---

## Directory structure to create

```
/Users/sviat/orders_pdf/
├── backend/
│   ├── package.json
│   └── server.js
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── index.css
        └── App.jsx
```

---

## Step 1 — `backend/package.json`

```json
{
  "name": "orders-pdf-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

## Step 2 — `backend/server.js`

Full content:

```js
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
```

---

## Step 3 — `frontend/package.json`

```json
{
  "name": "orders-pdf-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^4.4.168",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.4.9"
  }
}
```

---

## Step 4 — `frontend/vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
  },
});
```

---

## Step 5 — `frontend/tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
```

---

## Step 6 — `frontend/postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## Step 7 — `frontend/index.html`

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Order Stamper</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

## Step 8 — `frontend/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #111827;
  color: #f9fafb;
  min-height: 100vh;
  overflow: hidden;
}
```

---

## Step 9 — `frontend/src/main.jsx`

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## Step 10 — `frontend/src/App.jsx` (the entire application)

Write the complete file. Here is a precise specification:

### Imports (top of file)
```js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const API = 'http://localhost:3001';
```

### State inside `export default function App()`
```js
const [pdfBytes, setPdfBytes]       = useState(null);     // ArrayBuffer
const [textLabel, setTextLabel]     = useState('');
const [activeLabel, setActiveLabel] = useState(null);     // string on canvas
const [textPos, setTextPos]         = useState({ x: 50, y: 50 });
const [isDragging, setIsDragging]   = useState(false);
const [dragOffset, setDragOffset]   = useState({ x: 0, y: 0 });
const [viewport, setViewport]       = useState(null);
const [files, setFiles]             = useState([]);
const [saving, setSaving]           = useState(false);
const [dragOver, setDragOver]       = useState(false);    // drop zone highlight

const canvasRef   = useRef(null);
const overlayRef  = useRef(null);
const fileInputRef = useRef(null);
```

### `fetchFiles` and useEffect
```js
const fetchFiles = useCallback(async () => {
  try {
    const res = await fetch(`${API}/api/files`);
    const data = await res.json();
    setFiles(data);
  } catch (e) { console.error(e); }
}, []);

useEffect(() => { fetchFiles(); }, [fetchFiles]);
```

### `loadAndRenderPDF(file: File)`
```js
async function loadAndRenderPDF(file) {
  const ab = await file.arrayBuffer();
  setPdfBytes(ab);
  setActiveLabel(null);

  const typedArray = new Uint8Array(ab);
  const pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
  const page   = await pdfDoc.getPage(1);

  const containerEl = canvasRef.current.parentElement;
  const availWidth  = containerEl.clientWidth - 2; // account for border
  const baseVp      = page.getViewport({ scale: 1 });
  const scale       = Math.min(availWidth / baseVp.width, 1.8);
  const vp          = page.getViewport({ scale });

  const canvas = canvasRef.current;
  canvas.width  = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  setViewport(vp);
}
```

### Drop zone handlers
```js
function handleDragOver(e) { e.preventDefault(); setDragOver(true); }
function handleDragLeave()  { setDragOver(false); }
function handleDrop(e) {
  e.preventDefault();
  setDragOver(false);
  const file = e.dataTransfer.files[0];
  if (file?.type === 'application/pdf') loadAndRenderPDF(file);
}
function handleFileInput(e) {
  const file = e.target.files[0];
  if (file) loadAndRenderPDF(file);
}
```

### Add text handler
```js
function handleAddText() {
  if (!textLabel.trim() || !viewport) return;
  setActiveLabel(textLabel.trim());
  setTextPos({ x: 50, y: 50 });
}
```

### Label drag handlers
```js
function handleLabelMouseDown(e) {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(true);
  const labelRect = e.currentTarget.getBoundingClientRect();
  setDragOffset({ x: e.clientX - labelRect.left, y: e.clientY - labelRect.top });
}

function handleMouseMove(e) {
  if (!isDragging || !overlayRef.current) return;
  const rect = overlayRef.current.getBoundingClientRect();
  const canvas = canvasRef.current;
  const newX = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, canvas.width - 10));
  const newY = Math.max(0, Math.min(e.clientY - rect.top  - dragOffset.y, canvas.height - 10));
  setTextPos({ x: newX, y: newY });
}

function handleMouseUp() { setIsDragging(false); }
```

### Save handler (most critical)
```js
async function handleSave() {
  if (!pdfBytes || !activeLabel || !viewport) return;
  setSaving(true);
  try {
    // Coordinate mapping: canvas pixels (top-left origin) → PDF points (bottom-left origin)
    const pdfX = textPos.x / viewport.scale;
    const pdfY = (viewport.height - textPos.y) / viewport.scale;

    const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
    const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page   = pdfDoc.getPages()[0];

    page.drawText(activeLabel, {
      x: pdfX,
      y: pdfY,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });

    const modifiedBytes = await pdfDoc.save();
    const safeName = activeLabel.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const newFile  = new File([modifiedBytes], `${safeName}.pdf`, { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('file', newFile);
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Upload failed');

    // Reset working zone
    setPdfBytes(null);
    setActiveLabel(null);
    setTextLabel('');
    setViewport(null);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width  = 0;
      canvasRef.current.height = 0;
    }
    await fetchFiles();
  } catch (err) {
    console.error(err);
    alert('Save failed: ' + err.message);
  } finally {
    setSaving(false);
  }
}
```

### JSX — complete return

The layout is `flex h-screen`. Left panel is `w-[70%]`, right panel is `w-[30%]`.

**Left panel structure:**
- A top controls bar (only shown when `pdfBytes` is set): 
  - `<input type="text">` for order number (Tailwind: `bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white flex-1`)
  - Button "Add text" (`bg-indigo-600 hover:bg-indigo-500`)
  - Button "Save & Upload" (`bg-emerald-600 hover:bg-emerald-500`, disabled when saving)
- When `!pdfBytes`: a centered drop zone div filling the remaining space with dashed border, dark background, drag highlight on dragOver
- When `pdfBytes`: the overlay div `ref={overlayRef}` with `position: relative overflow-auto`, containing:
  - `<canvas ref={canvasRef} className="block" />`
  - When `activeLabel`: a label div positioned absolutely at `{ left: textPos.x, top: textPos.y }` with `cursor: isDragging ? 'grabbing' : 'grab'`, `userSelect: 'none'`, `position: absolute`, `whiteSpace: 'nowrap'`, styled as yellow pill: `bg-yellow-300 text-gray-900 text-sm font-bold px-2 py-0.5 rounded shadow-lg`

**Right panel structure:**
- Header: "Recent Files" + a small "(max 10)" subtitle in gray
- Empty state text if `files.length === 0`
- Scrollable list of file entries. Each entry is a dark card `bg-gray-800 rounded-lg p-3 flex flex-col gap-2`:
  - Filename text (truncated)
  - Button row with three links:
    - Download: `<a href=... download=filename>` styled as blue button
    - Open: `<a href=... target="_blank">` styled as gray button  
    - Drag: `<a href=... download=filename draggable="true" data-downloadurl={...}>` styled as green button, title "Drag to Finder or messenger"

The `data-downloadurl` value: `` `application/pdf:${filename}:${API}/files/${encodeURIComponent(filename)}` ``

### Full JSX example for the file entry row:
```jsx
{files.map(filename => (
  <div key={filename} className="bg-gray-800 rounded-lg p-3 flex flex-col gap-2 border border-gray-700">
    <span className="text-sm text-gray-200 truncate" title={filename}>{filename}</span>
    <div className="flex gap-2">
      <a
        href={`${API}/files/${encodeURIComponent(filename)}`}
        download={filename}
        className="flex-1 text-center text-xs py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-white font-medium transition-colors"
      >
        ↓ Download
      </a>
      <a
        href={`${API}/files/${encodeURIComponent(filename)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-center text-xs py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-white font-medium transition-colors"
      >
        ↗ Open
      </a>
      <a
        href={`${API}/files/${encodeURIComponent(filename)}`}
        download={filename}
        draggable="true"
        data-downloadurl={`application/pdf:${filename}:${API}/files/${encodeURIComponent(filename)}`}
        title="Drag to Finder, Telegram, or any app"
        className="flex-1 text-center text-xs py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-white font-medium transition-colors cursor-grab"
      >
        ⠿ Drag
      </a>
    </div>
  </div>
))}
```

---

## Checklist
- [x] backend/package.json
- [x] backend/server.js
- [x] frontend/package.json
- [x] frontend/vite.config.js
- [x] frontend/tailwind.config.js
- [x] frontend/postcss.config.js
- [x] frontend/index.html
- [x] frontend/src/index.css
- [x] frontend/src/main.jsx
- [x] frontend/src/App.jsx
- [x] Install backend deps: `cd backend && npm install`
- [x] Install frontend deps: `cd frontend && npm install`
