/**
 * Returns a wa.me URL for the given phone number.
 * Rules:
 *   - 10 digits (Indian mobile) → prepend 91
 *   - already has country code (11+ digits) → use as-is
 *   - null/empty → return null
 */
export const getWhatsAppUrl = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
};
