/**
 * ocrEngine.js — Tesseract.js wrapper for lead extraction.
 *
 * INTERNATIONAL PHONE SUPPORT (updated):
 *   Previously extracted only Indian 10-digit numbers (starting 6-9).
 *   Now extracts international numbers in E.164 / common formats:
 *
 *   Formats captured:
 *     +country_code number   e.g. +1 202 555 0123, +44 20 7946 0001
 *     Plain digits           e.g. 9876543210, 02072346789
 *     With separators        e.g. 079-4600-0100, 800.555.1234
 *     WhatsApp 5+5           e.g. 79046 54620
 *
 *   Validation: 6–15 digits after stripping separators (ITU-T E.164 max
 *   is 15 digits including country code; 6 is the minimum for any real
 *   subscriber number globally).
 *
 * PHASE 11C — Blacklist + name validation:
 *   Unchanged — NAME_BLACKLIST, isLikelyName(), NO_NAME fallback preserved.
 */

import Tesseract from 'tesseract.js';

// ── OCR ──────────────────────────────────────────────────────────
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

// ── Phone normalisation (international) ──────────────────────────
// Returns a cleaned phone string suitable for storage and dedup, or
// null if the raw text doesn't look like a real phone number.
//
// Rules:
//   1. Preserve a leading + (E.164 country-code prefix).
//   2. Strip all non-digit characters.
//   3. Accept 6–15 digits (ITU-T E.164 max; 6 for shortest real numbers).
//   4. Never truncate or strip country codes — store full number.
const normalisePhone = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  const hasPlus = s.startsWith('+');
  const digits  = s.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return hasPlus ? `+${digits}` : digits;
};

// ── Phone regex — international numbers ──────────────────────────
// Matches:
//   Optional + followed by 1–3 digit country code
//   Then 6–14 digits with optional separators (space / dash / dot)
//
// The regex is intentionally broad — normalisePhone() applies the
// strict 6–15 digit gate AFTER the regex matches, filtering out
// false positives (prices, dates, zip codes, etc.).
//
// Why not use a tighter regex? OCR output has inconsistent spacing
// and separators, making it more reliable to capture liberally and
// validate strictly on the digit count.
const PHONE_REGEX = new RegExp(
  // Optional international prefix: +, 00, or country-code digits
  '(?:\\+|00)?'  +
  // Core: 6–15 digits with optional separators between groups
  '(?:\\d[\\s\\-\\.]?){5,14}\\d',
  'g'
);

// ── Fallback name when no valid name line is found ────────────────
export const NO_NAME = 'No Name';

// ── Name blacklist — UI chrome words from Android contact cards ───
// Exact match, case-insensitive, after trimming whitespace.
export const NAME_BLACKLIST = [
  'Settings', 'Edit', 'Share', 'Contacts', 'Unknown', 'Back', 'Done',
  'Cancel', 'More', 'Search', 'Call', 'Message', 'Add', 'Menu',
  'Recent', 'Home', 'Chats', 'Status', 'Calls', 'WhatsApp', 'Telegram',
  'Truecaller',
];

const NAME_BLACKLIST_PHRASES = [
  'add contact',
  'block & report spam',
  'block and report spam',
  'help & feedback',
  'help and feedback',
  'contact info from phone',
  'lookup',
];

const BLACKLIST_SET = new Set(NAME_BLACKLIST.map((w) => w.toLowerCase()));

// ── Name validation (Phase 11C rules) ────────────────────────────
// Exported for test access.
export const isLikelyName = (line) => {
  const t = (line || '').trim();
  if (t.length < 2 || t.length > 50) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (/^[^a-zA-Z0-9]+$/.test(t)) return false;
  if (/https?:|www\.|@/.test(t)) return false;
  const lower = t.toLowerCase();
  if (BLACKLIST_SET.has(lower)) return false;
  if (NAME_BLACKLIST_PHRASES.includes(lower)) return false;
  if (/\b(call|whatsapp|contact|no\.|number|ph|mobile|msg|search|showing)\b/i.test(t)) return false;
  if (/^[^a-zA-Z]/.test(t) && t.length < 4) return false;
  return true;
};

const cleanName = (raw) =>
  raw
    .trim()
    .replace(/[^\w\s.'\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ── Main extractor ────────────────────────────────────────────────
export const extractLeads = (rawText) => {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const phoneMatches = [];

  lines.forEach((line, lineIdx) => {
    PHONE_REGEX.lastIndex = 0;
    const matches = [...line.matchAll(PHONE_REGEX)];
    matches.forEach((m) => {
      const norm = normalisePhone(m[0]);
      if (norm) {
        phoneMatches.push({ raw: m[0], phone: norm, lineIdx });
      }
    });
  });

  if (phoneMatches.length === 0) return [];

  const usedPhones = new Set();
  const leads = [];

  phoneMatches.forEach(({ phone, lineIdx }) => {
    // Dedupe by digits-only key so "+919876543210" and "9876543210"
    // don't produce two leads from the same OCR image.
    const dedupeKey = phone.replace(/\D/g, '');
    if (usedPhones.has(dedupeKey)) return;
    usedPhones.add(dedupeKey);

    // Remove phone pattern from its own line to get potential name
    PHONE_REGEX.lastIndex = 0;
    const ownLine = lines[lineIdx].replace(PHONE_REGEX, '').trim();

    let name = '';
    if (isLikelyName(ownLine)) {
      name = cleanName(ownLine);
    } else if (lineIdx > 0 && isLikelyName(lines[lineIdx - 1])) {
      name = cleanName(lines[lineIdx - 1]);
    } else if (lineIdx < lines.length - 1 && isLikelyName(lines[lineIdx + 1])) {
      name = cleanName(lines[lineIdx + 1]);
    }

    if (name && BLACKLIST_SET.has(name.toLowerCase())) name = '';
    if (!name) name = NO_NAME;

    // Extra context for notes
    PHONE_REGEX.lastIndex = 0;
    const context = [
      lineIdx > 1 ? lines[lineIdx - 2] : '',
      lineIdx > 0 ? lines[lineIdx - 1] : '',
      ownLine,
      lineIdx < lines.length - 1 ? lines[lineIdx + 1] : '',
    ]
      .filter(Boolean)
      .filter((l) => {
        PHONE_REGEX.lastIndex = 0;
        if (PHONE_REGEX.test(l)) return false;
        if (l === name) return false;
        const lc = l.trim().toLowerCase();
        if (BLACKLIST_SET.has(lc) || NAME_BLACKLIST_PHRASES.includes(lc)) return false;
        return true;
      })
      .join(' | ')
      .slice(0, 120);

    leads.push({
      id:       `ocr-${dedupeKey}`,
      name,
      phone,
      extra:    context || '',
      selected: true,
    });
  });

  return leads;
};

// ── Image pre-processor ───────────────────────────────────────────
export const prepareImage = (file) => {
  return new Promise((resolve) => {
    if (file.size < 300 * 1024) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW  = 1600;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'grayscale(1) contrast(1.4)';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};