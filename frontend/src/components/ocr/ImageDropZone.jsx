import { useState, useRef, useCallback } from 'react';

/**
 * ImageDropZone — drag-and-drop + click-to-upload + paste from clipboard.
 * Accepts images only. Calls onFile(File) when ready.
 */
export default function ImageDropZone({ onFile, disabled }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

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
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find((i) => i.type.startsWith('image/'));
    if (imgItem) handleFile(imgItem.getAsFile());
  }, [handleFile]);

  // Listen for paste globally
  useState(() => {
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        relative border-2 border-dashed rounded-2xl p-10
        flex flex-col items-center justify-center gap-4
        cursor-pointer transition-all select-none
        ${dragOver
          ? 'border-blue-500 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={disabled}
      />

      {/* Icon */}
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
        ${dragOver ? 'bg-blue-100' : 'bg-white border border-gray-200 shadow-sm'}`}>
        <svg className={`w-8 h-8 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">
          {dragOver ? 'Drop image here' : 'Upload screenshot or image'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Drag & drop, click to browse, or <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl+V</kbd> to paste
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PNG · JPG · WEBP · Screenshots · WhatsApp contacts
        </p>
      </div>

      {/* Input methods badges */}
      <div className="flex gap-2 flex-wrap justify-center">
        {['Contact card', 'WhatsApp screenshot', 'Ad image', 'Multiple contacts'].map((t) => (
          <span key={t} className="text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1 text-gray-500">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
