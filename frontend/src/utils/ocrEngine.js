/**
 * ocrEngine.js — Tesseract.js wrapper for lead extraction.
 *
 * Phone extraction supports ALL Indian mobile formats:
 *   - Plain 10 digits:      9876543210
 *   - 5+5 split:            79046 54620  ← WhatsApp format
 *   - 3+3+4 split:          981 234 5678
 *   - 4+6 split:            9876-543210
 *   - With +91/91/0 prefix: +91 79046 54620
 *   - Separators: space, dash, dot
 *
 * PHASE 11C — Blacklist + name validation:
 *   Android contact-card screenshots include UI chrome lines like
 *   "Settings", "Add contact", "Call", "Message", "Block & report spam"
 *   adjacent to the actual contact name/phone. These were sometimes
 *   picked up as the lead's name. Now filtered via NAME_BLACKLIST +
 *   stricter isLikelyName() validation. If no valid name line is found
 *   near a phone match, the lead's name is set to the literal string
 *   "No Name" (per spec) instead of incorrect UI text.
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
  let digits = raw.replace(/\D/g, '');
  // Strip country code
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0')  && digits.length === 11) digits = digits.slice(1);
  // Must be exactly 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
};

// ── Phone regex — covers ALL Indian mobile number formats ─────
// Handles: plain, 5+5, 3+3+4, 4+6, 4+3+3, with any separator (space/dash/dot)
// and optional +91 / 91 / 0 prefix
const SEP = '[\\s\\-\\.]';
const PHONE_REGEX = new RegExp(
  '(?:(?:\\+91|91|0)' + SEP + '?)?' +
  '(?:' +
    '[6-9]\\d{4}' + SEP + '\\d{5}' +           // 5+5  e.g. 79046 54620
  '|' +
    '[6-9]\\d{2}' + SEP + '\\d{3}' + SEP + '\\d{4}' + // 3+3+4 e.g. 981 234 5678
  '|' +
    '[6-9]\\d{3}' + SEP + '\\d{3}' + SEP + '\\d{3}' + // 4+3+3 e.g. 9876 543 210
  '|' +
    '[6-9]\\d{4}' + SEP + '\\d{3}' + SEP + '\\d{2}' + // 5+3+2
  '|' +
    '[6-9]\\d{3}' + SEP + '\\d{6}' +           // 4+6  e.g. 9876-543210
  '|' +
    '[6-9]\\d{9}' +                             // plain 10 digits, no separator
  ')',
  'g'
);

// ── Fallback name when no valid name line is found ────────────
export const NO_NAME = 'No Name';

// ── Name blacklist — UI chrome words from Android contact cards ─
// Exact match, case-insensitive, after trimming whitespace.
// Exported so backend can apply the same defensive check.
export const NAME_BLACKLIST = [
  'Settings', 'Edit', 'Share', 'Contacts', 'Unknown', 'Back', 'Done',
  'Cancel', 'More', 'Search', 'Call', 'Message', 'Add', 'Menu',
  'Recent', 'Home', 'Chats', 'Status', 'Calls', 'WhatsApp', 'Telegram',
  'Truecaller',
];

// Multi-word UI phrases that also need blacklisting (not single tokens,
// so they don't fit a simple exact-match-on-one-word list, but appear
// verbatim as full lines in contact-card screenshots).
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

// ── Name validation (Phase 11C rules) ──────────────────────────
// A line is a likely name if:
//   - 2–50 characters (after trim)
//   - contains at least one letter
//   - not numbers-only
//   - not symbols-only
//   - not an exact blacklist match (single word or known UI phrase)
//   - doesn't match existing call/whatsapp/contact noise patterns
const isLikelyName = (line) => {
  const t = (line || '').trim();

  if (t.length < 2 || t.length > 50) return false;

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(t)) return false;

  // Not numbers-only (redundant with above, but explicit per spec)
  if (/^\d+$/.test(t)) return false;

  // Not symbols-only (no letters/digits at all)
  if (/^[^a-zA-Z0-9]+$/.test(t)) return false;

  // URLs / emails are never names
  if (/https?:|www\.|@/.test(t)) return false;

  const lower = t.toLowerCase();

  // Exact blacklist match (single-word UI chrome)
  if (BLACKLIST_SET.has(lower)) return false;

  // Exact blacklist phrase match (multi-word UI chrome)
  if (NAME_BLACKLIST_PHRASES.includes(lower)) return false;

  // Existing noise-word heuristic (call/whatsapp/contact/etc as part of a line)
  if (/\b(call|whatsapp|contact|no\.|number|ph|mobile|msg|search|showing)\b/i.test(t)) return false;

  // Single short non-letter-leading token (e.g. "1", "+", "—") already
  // covered by length check above, but guard short symbol-prefixed
  // junk like ">1" etc.
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

// ── Main extractor ────────────────────────────────────────────
export const extractLeads = (rawText) => {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const leads = [];
  const phoneMatches = [];

  lines.forEach((line, lineIdx) => {
    // Reset lastIndex for global regex on each line
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

  phoneMatches.forEach(({ phone, lineIdx }) => {
    if (usedPhones.has(phone)) return;
    usedPhones.add(phone);

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

    // Final guard: if cleanName() somehow produced a blacklisted result
    // (e.g. case variations not caught above), discard it too.
    if (name && BLACKLIST_SET.has(name.toLowerCase())) {
      name = '';
    }

    // Fallback: no valid name line found near this phone → "No Name"
    if (!name) {
      name = NO_NAME;
    }

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
        // Strip blacklisted UI chrome lines from context too
        const lc = l.trim().toLowerCase();
        if (BLACKLIST_SET.has(lc) || NAME_BLACKLIST_PHRASES.includes(lc)) return false;
        return true;
      })
      .join(' | ')
      .slice(0, 120);

    leads.push({
      id:       `ocr-${phone}`,
      name,
      phone,
      extra:    context || '',
      selected: true,
    });
  });

  return leads;
};

// ── Image pre-processor ───────────────────────────────────────
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