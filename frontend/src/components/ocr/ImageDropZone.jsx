import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * ImageDropZone — drag-and-drop + click-to-upload + paste from clipboard.
 *
 * Mobile behaviour:
 *   - NO capture= attribute → Android shows "Camera / Gallery" choice sheet
 *   - accept="image/*" lets both camera and gallery work
 *   - Two buttons: one for gallery, one explicitly for camera
 */
export default function ImageDropZone({ onFile, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const galleryRef = useRef(null); // opens gallery / file picker
  const cameraRef  = useRef(null); // opens camera directly

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WEBP)');
      return;
    }
    onFile(file);
  }, [onFile]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onPaste = useCallback((e) => {
    const items   = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find((i) => i.type.startsWith('image/'));
    if (imgItem) handleFile(imgItem.getAsFile());
  }, [handleFile]);

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

      {/* Gallery / file picker — NO capture attribute → shows system file picker */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={disabled}
      />

      {/* Camera input — capture="environment" forces back camera only */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
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
          {dragOver ? 'Drop image here' : 'Upload screenshot or image'}
        </p>
        <p className="text-xs text-gray-400 mt-1 hidden sm:block">
          Drag & drop, click a button below, or{' '}
          <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono">
            Ctrl+V
          </kbd>{' '}
          to paste
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PNG · JPG · WEBP · Screenshots · WhatsApp contacts
        </p>
      </div>

      {/* Action buttons — explicit gallery vs camera */}
      <div className="flex gap-3 flex-wrap justify-center">
        {/* Gallery button — main action, opens system file picker */}
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

        {/* Camera button — directly opens camera */}
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
        or drag & drop an image anywhere above
      </p>
    </div>
  );
}