import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import LoginPage from './LoginPage.jsx';
import UserManager from './UserManager.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const API = 'http://localhost:3001';

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch { return null; }
}

export default function App() {
  // ── Auth ───────────────────────────────────────────────────
  const [token, setToken]           = useState(() => localStorage.getItem('auth_token'));
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [showUserMgr, setShowUserMgr] = useState(false);

  function handleLogin(user, newToken) {
    setToken(newToken);
    setCurrentUser(user);
  }

  function handleLogout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setCurrentUser(null);
    setPdfBytes(null); setPdfBytesToRender(null);
    pdfDocRef.current = null;
    setActiveLabel(null); setViewport(null);
    setCurrentPage(1); setTotalPages(0);
    setFiles([]);
  }

  const authH = token ? { Authorization: `Bearer ${token}` } : {};

  // ── PDF ────────────────────────────────────────────────────
  const [pdfBytes, setPdfBytes]                 = useState(null);
  const [pdfBytesToRender, setPdfBytesToRender] = useState(null);
  const [currentPage, setCurrentPage]           = useState(1);
  const [totalPages, setTotalPages]             = useState(0);

  // ── Label ──────────────────────────────────────────────────
  const [textLabel, setTextLabel]     = useState('');
  const [activeLabel, setActiveLabel] = useState(null);
  const [textPos, setTextPos]         = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging]   = useState(false);
  const [dragOffset, setDragOffset]   = useState({ x: 0, y: 0 });
  const [viewport, setViewport]       = useState(null);

  // ── Style (persisted) ──────────────────────────────────────
  const [fontSize, setFontSize]   = useState(() => Number(localStorage.getItem('stamp_fontSize') || 16));
  const [textColor, setTextColor] = useState(() => localStorage.getItem('stamp_textColor') || '#000000');
  const [showBg, setShowBg]       = useState(() => (localStorage.getItem('stamp_showBg') ?? 'true') === 'true');
  const [bgColor, setBgColor]     = useState(() => localStorage.getItem('stamp_bgColor') || '#ffff00');

  // ── UI ─────────────────────────────────────────────────────
  const [files, setFiles]       = useState([]);
  const [saving, setSaving]     = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── Refs ───────────────────────────────────────────────────
  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null);
  const fileInputRef = useRef(null);
  const pdfDocRef    = useRef(null);

  // ── Archive ────────────────────────────────────────────────
  const fetchFiles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/files`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { handleLogout(); return; }
      setFiles(await res.json());
    } catch (e) { console.error(e); }
  }, [token]);

  useEffect(() => { if (currentUser) fetchFiles(); }, [fetchFiles, currentUser]);

  // ── Persist style ──────────────────────────────────────────
  useEffect(() => localStorage.setItem('stamp_fontSize', fontSize), [fontSize]);
  useEffect(() => localStorage.setItem('stamp_textColor', textColor), [textColor]);
  useEffect(() => localStorage.setItem('stamp_showBg', showBg), [showBg]);
  useEffect(() => localStorage.setItem('stamp_bgColor', bgColor), [bgColor]);

  // ── PDF rendering ──────────────────────────────────────────
  async function renderPageOnCanvas(pdfDoc, pageNum) {
    if (!canvasRef.current) return null;
    const page = await pdfDoc.getPage(pageNum);
    const canvas = canvasRef.current;
    const availWidth = canvas.parentElement.clientWidth - 2;
    const baseVp = page.getViewport({ scale: 1 });
    const scale  = Math.min(availWidth / baseVp.width, 1.8);
    const vp     = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    setViewport(vp);
    return vp;
  }

  useEffect(() => {
    if (!pdfBytesToRender || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytesToRender) }).promise;
      if (cancelled) return;
      pdfDocRef.current = pdfDoc;
      setTotalPages(pdfDoc.numPages);
      setCurrentPage(1);
      await renderPageOnCanvas(pdfDoc, 1);
    })();
    return () => { cancelled = true; };
  }, [pdfBytesToRender]);

  async function loadAndRenderPDF(file) {
    const ab = await file.arrayBuffer();
    setPdfBytes(ab);
    setPdfBytesToRender(ab.slice(0));
    setActiveLabel(null);
  }

  // ── Drop zone ──────────────────────────────────────────────
  function handleDragOver(e) { e.preventDefault(); setDragOver(true); }
  function handleDragLeave()  { setDragOver(false); }
  function handleDrop(e) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')))
      loadAndRenderPDF(file);
  }
  function handleFileInput(e) {
    const file = e.target.files[0];
    if (file) loadAndRenderPDF(file);
    e.target.value = '';
  }

  // ── Page navigation (text label persists) ─────────────────
  async function goToPage(n) {
    if (!pdfDocRef.current || n < 1 || n > totalPages) return;
    setCurrentPage(n);
    await renderPageOnCanvas(pdfDocRef.current, n);
  }

  // ── Label drag ─────────────────────────────────────────────
  function handleAddText() {
    if (!textLabel.trim() || !viewport) return;
    setActiveLabel(textLabel.trim());
    setTextPos({ x: 50, y: 50 });
  }

  function handleLabelMouseDown(e) {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(true);
    const r = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - r.left, y: e.clientY - r.top });
  }

  function handleMouseMove(e) {
    if (!isDragging || !overlayRef.current) return;
    const r = overlayRef.current.getBoundingClientRect();
    const c = canvasRef.current;
    setTextPos({
      x: Math.max(0, Math.min(e.clientX - r.left - dragOffset.x, c.offsetWidth  - 10)),
      y: Math.max(0, Math.min(e.clientY - r.top  - dragOffset.y, c.offsetHeight - 10)),
    });
  }

  function handleMouseUp() { setIsDragging(false); }

  // ── Save ───────────────────────────────────────────────────
  function hexToRgb01(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  async function handleSave() {
    if (!pdfBytes || !activeLabel || !viewport) return;
    setSaving(true);
    try {
      const pdfX = textPos.x / viewport.scale;
      const pdfY = (viewport.height - textPos.y) / viewport.scale;

      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
      const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const page   = pdfDoc.getPages()[currentPage - 1];

      if (showBg) {
        const tw = font.widthOfTextAtSize(activeLabel, fontSize);
        page.drawRectangle({
          x: pdfX - 2, y: pdfY - fontSize * 0.2,
          width: tw + 4, height: fontSize * 1.3,
          color: hexToRgb01(bgColor), borderWidth: 0,
        });
      }
      page.drawText(activeLabel, { x: pdfX, y: pdfY, size: fontSize, font, color: hexToRgb01(textColor) });

      const bytes   = await pdfDoc.save();
      const safeName = activeLabel.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
      const newFile  = new File([bytes], `${safeName}.pdf`, { type: 'application/pdf' });

      const fd = new FormData();
      fd.append('file', newFile);
      const res = await fetch(`${API}/api/upload`, { method: 'POST', headers: authH, body: fd });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) throw new Error('Upload failed');

      setPdfBytes(null); setPdfBytesToRender(null);
      pdfDocRef.current = null;
      setActiveLabel(null); setTextLabel(''); setViewport(null);
      setCurrentPage(1); setTotalPages(0);
      await fetchFiles();
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    } finally { setSaving(false); }
  }

  // ── Download (fetch → blob, cross-origin safe) ─────────────
  async function handleDownload(filename) {
    try {
      const res  = await fetch(`${API}/files/${encodeURIComponent(filename)}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { console.error('Download failed:', err); }
  }

  // ── Delete saved file ──────────────────────────────────────
  async function handleDeleteFile(filename) {
    const res = await fetch(`${API}/api/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE', headers: authH,
    });
    if (res.ok) fetchFiles();
  }

  // ── Auth gate ──────────────────────────────────────────────
  if (!token || !currentUser) return <LoginPage onLogin={handleLogin} />;

  // ── JSX ────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">

      {/* ═══ Left panel (70%) ═══ */}
      <div className="flex flex-col w-[70%] border-r border-gray-700 min-w-0">

        {pdfBytes && (
          <div className="flex flex-col gap-2 p-3 border-b border-gray-700 bg-gray-800 shrink-0">
            {/* Row 1 */}
            <div className="flex items-center gap-3">
              <input type="text" value={textLabel}
                onChange={e => setTextLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddText()}
                placeholder="Order number…"
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white flex-1 focus:outline-none focus:border-indigo-500" />
              <button onClick={handleAddText}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-medium transition-colors whitespace-nowrap">
                Add text
              </button>
              <button onClick={handleSave} disabled={saving || !activeLabel}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-colors whitespace-nowrap">
                {saving ? 'Saving…' : 'Save & Upload'}
              </button>
            </div>
            {/* Row 2: style + page nav */}
            <div className="flex items-center gap-4 flex-wrap text-sm">
              <label className="flex items-center gap-2">
                <span className="text-gray-400">Size</span>
                <input type="range" min="8" max="72" value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  className="w-24 accent-indigo-500" />
                <span className="w-7 text-center text-white font-mono text-xs">{fontSize}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-gray-400">Text</span>
                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={showBg} onChange={e => setShowBg(e.target.checked)}
                  className="accent-indigo-500 w-4 h-4" />
                <span className="text-gray-400">Background</span>
              </label>
              {showBg && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-gray-400">BG</span>
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
                </label>
              )}
              {totalPages > 1 && (
                <div className="flex items-center gap-2 ml-auto">
                  <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
                    className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded font-bold">
                    ‹
                  </button>
                  <span className="text-gray-400 text-xs tabular-nums">{currentPage} / {totalPages}</span>
                  <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}
                    className="w-7 h-7 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded font-bold">
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden relative">
          {!pdfBytes ? (
            <div className={`flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg m-4 transition-colors cursor-pointer ${
              dragOver ? 'border-indigo-400 bg-indigo-900/20' : 'border-gray-600 bg-gray-800/30'
            }`}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}>
              <svg className="w-16 h-16 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-300 text-lg font-medium mb-1">Drop a PDF here</p>
              <p className="text-gray-500 text-sm">or click to browse</p>
              <input ref={fileInputRef} type="file" accept="application/pdf,.pdf"
                className="hidden" onChange={handleFileInput} />
            </div>
          ) : (
            <div ref={overlayRef} style={{ position: 'relative', overflow: 'auto' }} className="h-full"
              onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
              <canvas ref={canvasRef} className="block" />
              {activeLabel && (
                <div onMouseDown={handleLabelMouseDown}
                  style={{
                    position: 'absolute', left: textPos.x, top: textPos.y,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none', whiteSpace: 'nowrap',
                    fontSize: `${fontSize}px`, lineHeight: 1.3, color: textColor,
                    backgroundColor: showBg ? bgColor : 'rgba(0,0,0,0)',
                    padding: showBg ? '1px 4px' : '0',
                    borderRadius: showBg ? '3px' : '0',
                  }}>
                  {activeLabel}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right panel (30%) ═══ */}
      <div className="flex flex-col w-[30%] bg-gray-900 min-w-0">
        <div className="p-4 border-b border-gray-700 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent Files</h2>
            <p className="text-xs text-gray-500">max 10 · drag card to desktop</p>
          </div>
          <div className="flex items-center gap-2">
            {currentUser?.role === 'superadmin' && (
              <button onClick={() => setShowUserMgr(true)} title="Manage users"
                className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </button>
            )}
            <button onClick={handleLogout} title="Sign out"
              className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-700 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {files.length === 0 ? (
            <p className="text-gray-500 text-sm text-center mt-8">No files yet</p>
          ) : files.map(filename => (
            <div key={filename}
              draggable="true"
              onDragStart={e => e.dataTransfer.setData(
                'DownloadURL',
                `application/pdf:${filename}:${API}/files/${encodeURIComponent(filename)}`
              )}
              className="bg-gray-800 rounded-lg p-3 flex flex-col gap-2 border border-gray-700 cursor-grab active:cursor-grabbing"
              title="Drag to desktop, Finder, or any app">
              <div className="flex items-center gap-2 pointer-events-none select-none">
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
                  <path d="M14 2v6h6" fill="none" stroke="white" strokeWidth="1.5"/>
                </svg>
                <span className="text-sm text-gray-100 truncate flex-1" title={filename}>{filename}</span>
                <svg className="w-4 h-4 text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/>
                  <circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                </svg>
              </div>
              <div className="flex gap-1.5" draggable="false" onDragStart={e => e.stopPropagation()}>
                <button draggable="false"
                  onClick={e => { e.stopPropagation(); handleDownload(filename); }}
                  className="flex-1 text-xs py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-white font-medium transition-colors">
                  ↓ Download
                </button>
                <a href={`${API}/files/${encodeURIComponent(filename)}`}
                  target="_blank" rel="noopener noreferrer"
                  draggable="false" onClick={e => e.stopPropagation()}
                  className="flex-1 text-center text-xs py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-white font-medium transition-colors">
                  ↗ Open
                </a>
                <button draggable="false"
                  onClick={e => { e.stopPropagation(); handleDeleteFile(filename); }}
                  className="text-xs py-1.5 px-2.5 bg-red-900/60 hover:bg-red-800 rounded text-red-300 font-medium transition-colors">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showUserMgr && <UserManager token={token} onClose={() => setShowUserMgr(false)} />}
    </div>
  );
}
