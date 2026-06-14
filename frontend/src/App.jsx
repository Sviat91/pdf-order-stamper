import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const API = 'http://localhost:3001';

export default function App() {
  const [pdfBytes, setPdfBytes]             = useState(null);
  const [pdfBytesToRender, setPdfBytesToRender] = useState(null); // triggers canvas render after mount
  const [textLabel, setTextLabel]           = useState('');
  const [activeLabel, setActiveLabel]       = useState(null);
  const [textPos, setTextPos]               = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging]         = useState(false);
  const [dragOffset, setDragOffset]         = useState({ x: 0, y: 0 });
  const [viewport, setViewport]             = useState(null);
  const [files, setFiles]                   = useState([]);
  const [saving, setSaving]                 = useState(false);
  const [dragOver, setDragOver]             = useState(false);
  const [fontSize, setFontSize]             = useState(() => Number(localStorage.getItem('stamp_fontSize') || 16));
  const [textColor, setTextColor]           = useState(() => localStorage.getItem('stamp_textColor') || '#000000');
  const [showBg, setShowBg]                 = useState(() => (localStorage.getItem('stamp_showBg') ?? 'true') === 'true');
  const [bgColor, setBgColor]               = useState(() => localStorage.getItem('stamp_bgColor') || '#ffff00');

  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null);
  const fileInputRef = useRef(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/files`);
      const data = await res.json();
      setFiles(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);
  useEffect(() => localStorage.setItem('stamp_fontSize', fontSize), [fontSize]);
  useEffect(() => localStorage.setItem('stamp_textColor', textColor), [textColor]);
  useEffect(() => localStorage.setItem('stamp_showBg', showBg), [showBg]);
  useEffect(() => localStorage.setItem('stamp_bgColor', bgColor), [bgColor]);

  async function loadAndRenderPDF(file) {
    const ab = await file.arrayBuffer();
    // Set pdfBytes first so the canvas branch mounts in the DOM,
    // then pdfBytesToRender triggers the useEffect below to render once canvasRef is valid.
    setPdfBytes(ab);
    setPdfBytesToRender(ab.slice(0)); // copy so pdfjs can transfer/detach without touching pdfBytes
    setActiveLabel(null);
  }

  useEffect(() => {
    if (!pdfBytesToRender || !canvasRef.current) return;
    let cancelled = false;

    async function renderPDF() {
      const typedArray = new Uint8Array(pdfBytesToRender);
      const pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
      const page   = await pdfDoc.getPage(1);
      if (cancelled) return;

      const canvas     = canvasRef.current;
      const availWidth = canvas.parentElement.clientWidth - 2;
      const baseVp     = page.getViewport({ scale: 1 });
      const scale      = Math.min(availWidth / baseVp.width, 1.8);
      const vp         = page.getViewport({ scale });

      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (!cancelled) setViewport(vp);
    }

    renderPDF();
    return () => { cancelled = true; };
  }, [pdfBytesToRender]);

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

  function handleAddText() {
    if (!textLabel.trim() || !viewport) return;
    setActiveLabel(textLabel.trim());
    setTextPos({ x: 50, y: 50 });
  }

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
    const newX = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, canvas.offsetWidth - 10));
    const newY = Math.max(0, Math.min(e.clientY - rect.top  - dragOffset.y, canvas.offsetHeight - 10));
    setTextPos({ x: newX, y: newY });
  }

  function handleMouseUp() { setIsDragging(false); }

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
      const page   = pdfDoc.getPages()[0];

      if (showBg) {
        const textWidth = font.widthOfTextAtSize(activeLabel, fontSize);
        page.drawRectangle({
          x: pdfX - 2,
          y: pdfY - fontSize * 0.2,
          width: textWidth + 4,
          height: fontSize * 1.3,
          color: hexToRgb01(bgColor),
          borderWidth: 0,
        });
      }
      page.drawText(activeLabel, {
        x: pdfX,
        y: pdfY,
        size: fontSize,
        font,
        color: hexToRgb01(textColor),
      });

      const modifiedBytes = await pdfDoc.save();
      const safeName = activeLabel.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
      const newFile  = new File([modifiedBytes], `${safeName}.pdf`, { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', newFile);
      const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      setPdfBytes(null);
      setPdfBytesToRender(null);
      setActiveLabel(null);
      setTextLabel('');
      setViewport(null);
      await fetchFiles();
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Left panel */}
      <div className="flex flex-col w-[70%] border-r border-gray-700">
        {/* Controls bar — only when PDF is loaded */}
        {pdfBytes && (
          <div className="flex flex-col gap-2 p-3 border-b border-gray-700 bg-gray-800 shrink-0">
            {/* Row 1: input + action buttons */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={textLabel}
                onChange={e => setTextLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddText()}
                placeholder="Order number…"
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white flex-1 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleAddText}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-medium transition-colors whitespace-nowrap"
              >
                Add text
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !activeLabel}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-colors whitespace-nowrap"
              >
                {saving ? 'Saving…' : 'Save & Upload'}
              </button>
            </div>
            {/* Row 2: style controls */}
            <div className="flex items-center gap-5 flex-wrap text-sm text-gray-300">
              {/* Font size */}
              <label className="flex items-center gap-2">
                <span className="text-gray-400">Size</span>
                <input
                  type="range" min="8" max="72" value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  className="w-24 accent-indigo-500"
                />
                <span className="w-8 text-center text-white font-mono">{fontSize}</span>
              </label>
              {/* Text color */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-gray-400">Text</span>
                <input
                  type="color" value={textColor}
                  onChange={e => setTextColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                />
              </label>
              {/* Background toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox" checked={showBg}
                  onChange={e => setShowBg(e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <span className="text-gray-400">Background</span>
              </label>
              {/* Background color — only when enabled */}
              {showBg && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-gray-400">BG</span>
                  <input
                    type="color" value={bgColor}
                    onChange={e => setBgColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Drop zone or PDF overlay */}
        <div className="flex-1 overflow-hidden relative">
          {!pdfBytes ? (
            <div
              className={`flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg m-4 transition-colors cursor-pointer ${
                dragOver
                  ? 'border-indigo-400 bg-indigo-900/20'
                  : 'border-gray-600 bg-gray-800/30'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="w-16 h-16 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-300 text-lg font-medium mb-1">Drop a PDF here</p>
              <p className="text-gray-500 text-sm">or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div
              ref={overlayRef}
              style={{ position: 'relative', overflow: 'auto' }}
              className="h-full"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <canvas ref={canvasRef} className="block" />
              {activeLabel && (
                <div
                  onMouseDown={handleLabelMouseDown}
                  style={{
                    position: 'absolute',
                    left: textPos.x,
                    top: textPos.y,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.3,
                    color: textColor,
                    backgroundColor: showBg ? bgColor : 'transparent',
                    padding: showBg ? '1px 4px' : '0',
                    borderRadius: '3px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                >
                  {activeLabel}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-col w-[30%] bg-gray-900">
        <div className="p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">Recent Files</h2>
          <p className="text-xs text-gray-500">(max 10)</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {files.length === 0 ? (
            <p className="text-gray-500 text-sm text-center mt-8">No files yet</p>
          ) : (
            files.map(filename => (
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
