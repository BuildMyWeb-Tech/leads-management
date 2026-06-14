import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * ImageDropZone — drag-and-drop + click-to-upload + paste from clipboard.
 *
 * MULTI-FILE SUPPORT (Phase 11A):
 *   - Drag-and-drop: ALL dropped image files are collected and passed
 *     to onFile as an array (e.dataTransfer.files, not just [0]).
 *   - Clipboard paste: ALL pasted image items are collected and passed
 *     to onFile as an array (handles pasting multiple screenshots at once).
 *   - Gallery picker: <input multiple> — already supported, passes a
 *     FileList → converted to array.
 *   - Camera input: still single-file (capture="environment" — a device
 *     camera can only produce one photo per shot), passed as a single File.
 *
 * onFile signature: onFile(file | file[])
 *   Callers (OcrCapture) normalize via addFiles(), which already does
 *   `Array.isArray(files) ? files : [files]` — no caller-side changes
 *   needed beyond that existing normalization.
 *
 * Non-image files are filtered out silently when part of a multi-file
 * drop/paste (so e.g. dropping a screenshot + a PDF together still
 * imports the screenshot). A single non-image file (drag or paste of
 * exactly one non-image item) still shows the alert, preserving the
 * original single-file behaviour.
 *
 * Mobile behaviour unchanged:
 *   - NO capture= attribute on gallery input → Android shows
 *     "Camera / Gallery" choice sheet
 *   - accept="image/*" lets both camera and gallery work
 *   - Two buttons: one for gallery (multi), one explicitly for camera (single)
 */
export default function ImageDropZone({ onFile, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const galleryRef = useRef(null); // opens gallery / file picker (multi)
  const cameraRef  = useRef(null); // opens camera directly (single)

  // ── Single-file handler (camera input, single drop/paste) ────
  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WEBP)');
      return;
    }
    onFile(file);
  }, [onFile]);

  // ── Multi-file handler (gallery multi-select, multi drop/paste) ─
  // Filters to images only. If the result is a single file, still
  // passes it as a single File (not a 1-element array) so existing
  // single-file flows (e.g. preview thumbnail logic) keep working —
  // OcrCapture.addFiles() normalizes either shape anyway, but this
  // keeps behaviour identical to before for the single-file case.
  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));

    if (files.length === 0) {
      // Nothing valid — if exactly one non-image file was provided,
      // surface the same alert as the single-file path for parity.
      if (fileList && fileList.length === 1) {
        alert('Please upload an image file (PNG, JPG, WEBP)');
      }
      return;
    }

    if (files.length === 1) {
      onFile(files[0]);
    } else {
      onFile(files);
    }
  }, [onFile]);

  // ── Drag and drop — now collects ALL dropped files ────────────
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  // ── Clipboard paste — now collects ALL pasted image items ──────
  const onPaste = useCallback((e) => {
    if (disabled) return;
    const items  = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter(Boolean);

    if (images.length === 0) return;

    if (images.length === 1) {
      handleFile(images[0]);
    } else {
      onFile(images);
    }
  }, [disabled, handleFile, onFile]);

  useEffect(() => {
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onPaste]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`
        relative border-2 border-dashed rounded-2xl
        flex flex-col items-center justify-center gap-4
        transition-all select-none
        p-8 sm:p-10
        ${dragOver
          ? 'border-blue-500 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      {/* Hidden inputs */}

      {/* Gallery / file picker — multi-select, NO capture attribute
          → shows system file picker, supports selecting many images */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        disabled={disabled}
      />

      {/* Camera input — single shot, capture="environment" forces back camera */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
        disabled={disabled}
      />

      {/* Upload icon */}
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
        ${dragOver ? 'bg-blue-100' : 'bg-white border border-gray-200 shadow-sm'}`}>
        <svg className={`w-8 h-8 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Text */}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">
          {dragOver ? 'Drop image(s) here' : 'Upload screenshot or image'}
        </p>
        <p className="text-xs text-gray-400 mt-1 hidden sm:block">
          Drag & drop one or more images, click a button below, or{' '}
          <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono">
            Ctrl+V
          </kbd>{' '}
          to paste
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PNG · JPG · WEBP · Screenshots · WhatsApp contacts · Multiple files supported
        </p>
      </div>

      {/* Action buttons — explicit gallery (multi) vs camera (single) */}
      <div className="flex gap-3 flex-wrap justify-center">
        {/* Gallery button — main action, opens system file picker (multi-select) */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && galleryRef.current?.click()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700
                     text-white text-sm font-medium px-4 py-2.5 rounded-xl
                     transition-colors disabled:opacity-50 touch-manipulation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Choose from Gallery
        </button>

        {/* Camera button — directly opens camera (single shot) */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && cameraRef.current?.click()}
          className="flex items-center gap-2 bg-white hover:bg-gray-50
                     text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl
                     border border-gray-300 transition-colors
                     disabled:opacity-50 touch-manipulation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Take Photo
        </button>
      </div>

      {/* Desktop hint */}
      <p className="text-xs text-gray-300 hidden sm:block">
        or drag & drop one or more images anywhere above
      </p>
    </div>
  );
}