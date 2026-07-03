/**
 * phoneUtils.js — Shared phone normalization for international numbers.
 *
 * Used by: ocrController.js, leadsController.js (importCSV), importCSV
 *
 * STRATEGY:
 *   1. Strip visual separators (spaces, dashes, dots, parens, en-dash).
 *   2. Preserve a leading + if present (international prefix marker).
 *   3. Validate: must be 6–20 digits after stripping separators.
 *      - 6 digits: shortest real country codes + number (e.g. +1 212 = 7, but
 *        some test/micro-state numbers are 6 digits total after country code;
 *        being slightly permissive is better than rejecting legitimate numbers).
 *      - 20 digits: ITU-T E.164 max is 15 digits, but OCR can add noise;
 *        20 gives headroom while rejecting obvious garbage.
 *   4. Returns the cleaned string (e.g. "+919876543210", "9876543210",
 *      "+12025550123", "0044207946001") — never truncates.
 *   5. Returns null for strings that don't look like phone numbers at all.
 *
 * DUPLICATE DETECTION KEY:
 *   normaliseForDedupe() strips the + and leading zeros for DB comparison so
 *   "+91 98765 43210" and "9876543210" both produce the same key "9198765 43210"
 *   → actually we strip all separators and leading zeros of the country-code
 *   prefix to produce a canonical digits-only string for matching.
 */

/**
 * Clean a raw phone string for storage.
 * Returns null if it doesn't look like a real phone number.
 */
const normalisePhone = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();

  // Preserve leading + (international dialing prefix)
  const hasPlus = s.startsWith('+');

  // Strip all non-digit characters
  const digits = s.replace(/\D/g, '');

  // Must be 6–20 digits
  if (digits.length < 6 || digits.length > 20) return null;

  return hasPlus ? `+${digits}` : digits;
};

/**
 * Produce a canonical key for duplicate detection.
 * Strips +, leading zeros, spaces — reduces to raw digits.
 * "+91 98765 43210" and "9876543210" and "09876543210" all
 * produce different keys (we can't know if 91 is a country code or
 * part of the number without a full country-code database), so
 * dedupe is still digit-only but we keep the full string for storage.
 *
 * For the common Indian case (+91 prefix → 91 + 10 digits), two
 * representations of the same number WILL produce different keys
 * ("+919876543210" vs "9876543210"). This is an acceptable tradeoff:
 * we no longer strip country codes (which was India-specific), so
 * cross-format dedup is now the admin's responsibility when importing.
 * The old India-specific dedup was more precise for that one country
 * but completely wrong for all others.
 */
const normaliseForDedupe = (raw) => {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '');
};

module.exports = { normalisePhone, normaliseForDedupe };