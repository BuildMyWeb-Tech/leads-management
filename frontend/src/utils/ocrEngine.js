/**
 * ocrEngine.js — Tesseract.js wrapper for lead extraction.
 *
 * Flow:
 *   1. runOCR(imageFile)  →  raw text string
 *   2. extractLeads(text) →  [{ name, phone, extra }]
 *   3. dedupeByPhone()    →  (done in component after API check)
 *
 * Phone extraction rules:
 *   - 10-digit Indian mobiles starting 6-9
 *   - Handles spaces, dashes, dots between digits
 *   - Strips +91 / 91 prefix
 *   - Minimum 10 significant digits
 *
 * Name extraction rules:
 *   - Line immediately before or after a phone number
 *   - Not a number-only line, not a URL, not very short
 *   - Capitalise first letter of each word
 */

import Tesseract from 'tesseract.js';

// ── OCR ──────────────────────────────────────────────────────
export const runOCR = async (imageFile, onProgress) => {
  const result = await Tesseract.recognize(imageFile, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  return result.data.text;
};

// ── Phone normalisation ───────────────────────────────────────
const normalisePhone = (raw) => {
  // Remove all non-digits
  let digits = raw.replace(/\D/g, '');
  // Strip country codes
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0')  && digits.length === 11) digits = digits.slice(1);
  // Must be exactly 10 digits, starting 6-9
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
};

// Regex: phone-like patterns (10 digits with optional separators)
const PHONE_REGEX = /(?:\+91[\s\-.]?)?(?:91[\s\-.]?)?[6-9]\d[\s\-.]?\d{4}[\s\-.]?\d{4}/g;

// ── Name cleaning ─────────────────────────────────────────────
const isLikelyName = (line) => {
  const t = line.trim();
  if (!t || t.length < 2 || t.length > 60)       return false;
  if (/^\d+$/.test(t))                            return false; // all digits
  if (/https?:|www\.|@/.test(t))                  return false; // URL / email
  if (/^[^a-zA-Z]/.test(t) && t.length < 4)      return false; // starts non-alpha, short
  if (/\b(call|whatsapp|contact|no\.|number|ph|mobile|msg)\b/i.test(t)) return false;
  return true;
};

const cleanName = (raw) =>
  raw
    .trim()
    .replace(/[^\w\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ── Main extractor ────────────────────────────────────────────
export const extractLeads = (rawText) => {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const leads = [];

  // Pass 1: find all phone numbers and their line indices
  const phoneMatches = []; // { phone, lineIdx, charIdx }

  lines.forEach((line, lineIdx) => {
    const matches = [...line.matchAll(PHONE_REGEX)];
    matches.forEach((m) => {
      const norm = normalisePhone(m[0]);
      if (norm) {
        phoneMatches.push({ raw: m[0], phone: norm, lineIdx });
      }
    });
  });

  if (phoneMatches.length === 0) return [];

  // Pass 2: for each phone, look for a name on the surrounding lines
  const usedPhones = new Set();

  phoneMatches.forEach(({ phone, lineIdx }) => {
    if (usedPhones.has(phone)) return;
    usedPhones.add(phone);

    // Remove the phone from its own line to get potential inline name
    const ownLine = lines[lineIdx].replace(PHONE_REGEX, '').trim();

    let name = '';

    // Prefer inline name (same line, after removing phone)
    if (isLikelyName(ownLine)) {
      name = cleanName(ownLine);
    }
    // Try line above
    else if (lineIdx > 0 && isLikelyName(lines[lineIdx - 1])) {
      name = cleanName(lines[lineIdx - 1]);
    }
    // Try line below
    else if (lineIdx < lines.length - 1 && isLikelyName(lines[lineIdx + 1])) {
      name = cleanName(lines[lineIdx + 1]);
    }

    // Collect extra context (notes) from surrounding lines
    const context = [
      lineIdx > 1   ? lines[lineIdx - 2] : '',
      lineIdx > 0   ? lines[lineIdx - 1] : '',
      ownLine,
      lineIdx < lines.length - 1 ? lines[lineIdx + 1] : '',
    ]
      .filter(Boolean)
      .filter((l) => !PHONE_REGEX.test(l) && l !== name)
      .join(' | ')
      .slice(0, 120);

    leads.push({
      id:    `ocr-${phone}`,
      name:  name || '',
      phone,
      extra: context || '',
      selected: true,
    });
  });

  return leads;
};

// ── Image pre-processor (canvas resize for faster OCR) ────────
export const prepareImage = (file) => {
  return new Promise((resolve) => {
    // If already small, skip resize
    if (file.size < 300 * 1024) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 1600;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      // Greyscale + contrast boost for better OCR
      ctx.filter = 'grayscale(1) contrast(1.4)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};
