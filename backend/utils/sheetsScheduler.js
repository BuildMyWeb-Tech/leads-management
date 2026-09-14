/**
 * sheetsScheduler.js — Monthly Google Sheets full-sync scheduler.
 *
 * Fires on the 1st of each month at 9:00 AM IST.
 * Crash-safe via AppState.lastMonthlySheetsSync ('YYYY-MM' in IST).
 * Non-fatal — Sheets failures are logged but never crash the server.
 */

const AppState  = require('../models/AppState');
const Lead      = require('../models/Lead');
const SheetSync = require('../models/SheetSync');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getISTMonthString = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.toISOString().slice(0, 7); // 'YYYY-MM'
};

const getISTDayOfMonth = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.getUTCDate();
};

const isPast9amIST = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.getUTCHours() >= 9;
};

// Compute milliseconds until next 1st-of-month at 9:00 AM IST
const msUntilNextFirstOf9amIST = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  // Start with first of next month at 09:00 IST = 03:30 UTC
  const next = new Date(Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth() + 1, // next month
    1,
    3, 30, 0, 0 // 9:00 AM IST = 03:30 UTC
  ));

  // If it's the 1st AND before 9 AM IST → fire today at 9 AM
  if (getISTDayOfMonth(now) === 1 && !isPast9amIST(now)) {
    const todayFirst = new Date(Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      1,
      3, 30, 0, 0
    ));
    if (todayFirst > now) return todayFirst.getTime() - now.getTime();
  }

  return next.getTime() - now.getTime();
};

// Execute the monthly sync using existing Sheets business logic directly
const runMonthlySync = async () => {
  const currentMonth = getISTMonthString();
  try {
    const state = await AppState.getOrCreate();

    // Idempotency guard
    if (state.lastMonthlySheetsSync === currentMonth) {
      console.log(`[SheetsScheduler] Already synced for ${currentMonth} — skipping`);
      return;
    }

    const cfg = await SheetSync.findOne();
    if (!cfg || !cfg.serviceAccountJson || !cfg.spreadsheetId) {
      console.log('[SheetsScheduler] Sheets not configured — skipping monthly sync');
      state.lastMonthlySheetsSync = currentMonth;
      await state.save();
      return;
    }

    console.log(`[SheetsScheduler] Running monthly sync for ${currentMonth}`);

    const { bulkSync, regenerateDirectorView } = require('./sheetsService');

    const leads = await Lead.find({})
      .populate('assignedDirector',   'name')
      .populate('assignedTelecaller', 'name')
      .sort({ createdAt: 1 })
      .lean();

    const activeCfg = { ...cfg.toObject(), isActive: true };

    const result   = await bulkSync(activeCfg, leads);
    const dvResult = await regenerateDirectorView(activeCfg, leads);

    cfg.totalSynced    = result.count;
    cfg.lastSyncAt     = new Date();
    cfg.lastSyncStatus = 'success';
    cfg.lastSyncError  = '';
    if (dvResult.success) cfg.lastDirectorViewSyncAt = new Date();
    await cfg.save();

    state.lastMonthlySheetsSync = currentMonth;
    await state.save();

    console.log(`[SheetsScheduler] Monthly sync complete: ${result.count} leads synced`);
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[SheetsScheduler] Monthly sync failed:', err.message);
    // Still record the attempt to avoid infinite retry loops this month
    try {
      const state = await AppState.getOrCreate();
      state.lastMonthlySheetsSync = currentMonth;
      await state.save();
    } catch (_) {}
  }
};

const scheduleNext = () => {
  const delay = msUntilNextFirstOf9amIST();
  const days  = Math.round(delay / (24 * 60 * 60 * 1000));
  console.log(`[SheetsScheduler] Next monthly sync in ~${days} day(s)`);
  setTimeout(() => {
    runMonthlySync();
    // After first fire, re-schedule for next month
    scheduleNext();
  }, delay);
};

const startSheetsScheduler = async () => {
  try {
    const now          = new Date();
    const state        = await AppState.getOrCreate();
    const currentMonth = getISTMonthString(now);
    const alreadyRan   = state.lastMonthlySheetsSync === currentMonth;

    // Fire immediately if: 1st of month + past 9 AM IST + not already run
    if (!alreadyRan && getISTDayOfMonth(now) === 1 && isPast9amIST(now)) {
      console.log('[SheetsScheduler] Missed 1st-of-month run detected — syncing now');
      await runMonthlySync();
    }

    scheduleNext();
  } catch (err) {
    console.error('[SheetsScheduler] Startup failed, falling back to timer:', err.message);
    scheduleNext();
  }
};

module.exports = {
  startSheetsScheduler,
  runMonthlySync,
  getISTMonthString,
  getISTDayOfMonth,
  isPast9amIST,
  msUntilNextFirstOf9amIST,
};
