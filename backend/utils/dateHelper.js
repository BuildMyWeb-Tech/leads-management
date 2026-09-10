const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

/**
 * Returns the start of the IST calendar day for `now` as a UTC Date.
 * e.g. 2026-09-10 00:00 IST → 2026-09-09T18:30:00.000Z
 */
const getISTMidnightUTC = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const istMidnight = new Date(istNow);
  istMidnight.setUTCHours(0, 0, 0, 0);
  return new Date(istMidnight.getTime() - IST_OFFSET_MS);
};

/**
 * Returns { start, end } UTC Date bounds for the IST calendar day of `now`.
 *   start = IST midnight (UTC)
 *   end   = IST next midnight (UTC)
 * Use as: { $gte: start, $lt: end }
 */
const getISTDayBounds = (now = new Date()) => {
  const start = getISTMidnightUTC(now);
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

module.exports = { getISTMidnightUTC, getISTDayBounds };
