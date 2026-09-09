/**
 * reminderScheduler.js — Daily follow-up reminder scheduler.
 *
 * Runs every day at 9:00 AM IST (3:30 AM UTC).
 * Finds all leads with followUpDate = today and status = 'Follow Up'.
 * Sends push notification to the assigned telecaller (and director).
 *
 * G.2 FIX (P2-002): crash-safe via AppState.lastReminderDate.
 * On startup the scheduler checks whether today's reminders have
 * already fired (persisted to DB). If the server crashed between
 * midnight and 9 AM IST and restarts after 9 AM IST, the missed
 * reminders are dispatched immediately without waiting 24 hours.
 */

const { notify }  = require('./pushService');
const Lead        = require('../models/Lead');
const AppState    = require('../models/AppState');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

// Return today's date string 'YYYY-MM-DD' in IST
const getTodayISTString = () => {
  const now    = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.toISOString().slice(0, 10);
};

// Get today's follow-up date range in IST (midnight-to-midnight)
const getTodayRange = () => {
  const now     = new Date();
  const istNow  = new Date(now.getTime() + IST_OFFSET_MS);

  const start = new Date(istNow);
  start.setUTCHours(0, 0, 0, 0);
  const startUTC = new Date(start.getTime() - IST_OFFSET_MS);

  const end = new Date(startUTC);
  end.setUTCHours(23, 59, 59, 999);

  return { start: startUTC, end };
};

// Compute ms until next 9:00 AM IST
const msUntilNext9amIST = () => {
  const now    = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  const next9am = new Date(istNow);
  next9am.setUTCHours(3, 30, 0, 0); // 9:00 AM IST = 03:30 UTC
  if (next9am <= istNow) {
    next9am.setUTCDate(next9am.getUTCDate() + 1);
  }

  return next9am.getTime() - now.getTime();
};

// Whether current IST time is 9:00 AM or later.
// After adding IST_OFFSET_MS the getUTCHours() value equals the IST hour
// directly (e.g. now=03:30 UTC → istNow=09:00 → getUTCHours()=9).
const isPast9amIST = (now = new Date()) => {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  return istNow.getUTCHours() >= 9;
};

// Main reminder dispatch — persists the fired date so crash recovery
// knows not to fire again for the same calendar day.
const sendFollowUpReminders = async () => {
  try {
    const todayStr = getTodayISTString();
    const state    = await AppState.getOrCreate();

    // Idempotency guard: don't double-fire on the same IST day
    if (state.lastReminderDate === todayStr) {
      console.log(`[Reminder] Already sent reminders for ${todayStr} — skipping`);
      return;
    }

    console.log('[Reminder] Running follow-up reminders at', new Date().toISOString());
    const { start, end } = getTodayRange();

    const leads = await Lead.find({
      status: 'Follow Up',
      followUpDate: { $gte: start, $lte: end },
      $or: [
        { assignedTelecaller: { $ne: null } },
        { assignedDirector:   { $ne: null } },
      ],
    })
      .populate('assignedTelecaller', 'name notificationPrefs')
      .populate('assignedDirector',   'name notificationPrefs')
      .lean();

    // Persist the fired date BEFORE sending to avoid duplicate sends
    // on a crash-during-send scenario; partial sends are preferred over
    // duplicate sends.
    state.lastReminderDate = todayStr;
    await state.save();

    if (!leads.length) {
      console.log('[Reminder] No follow-ups due today');
      return;
    }

    let sent = 0;
    for (const lead of leads) {
      if (
        lead.assignedTelecaller &&
        lead.assignedTelecaller.notificationPrefs?.followUpReminder !== false
      ) {
        await notify.followUpReminder(
          lead.assignedTelecaller._id,
          lead.name,
          lead.phone,
        );
        sent++;
      }

      if (
        lead.assignedDirector &&
        lead.assignedDirector.notificationPrefs?.followUpReminder &&
        String(lead.assignedDirector._id) !== String(lead.assignedTelecaller?._id)
      ) {
        await notify.followUpReminder(
          lead.assignedDirector._id,
          lead.name,
          lead.phone,
        );
        sent++;
      }
    }

    console.log(`[Reminder] Sent ${sent} reminder(s) for ${leads.length} lead(s)`);
  } catch (err) {
    console.error('[Reminder] Error:', err.message);
  }
};

// G.2 crash-safe startup:
//   1. Check DB for lastReminderDate
//   2. If today's reminders haven't fired AND it's already past 9 AM IST:
//      fire immediately, then schedule next run for tomorrow 9 AM IST
//   3. Otherwise: schedule for today (or tomorrow) at 9 AM IST
const startReminderScheduler = async () => {
  try {
    const state    = await AppState.getOrCreate();
    const todayStr = getTodayISTString();
    const alreadyRan = state.lastReminderDate === todayStr;
    const now        = new Date();

    if (!alreadyRan && isPast9amIST(now)) {
      // Server restarted after 9 AM IST without having sent today's reminders
      console.log('[Reminder] Missed 9 AM run detected — dispatching reminders now');
      await sendFollowUpReminders();
      // Schedule for tomorrow
      const delay = msUntilNext9amIST();
      console.log(`[Reminder] Next run in ${Math.round(delay / 60000)} minutes`);
      setTimeout(() => {
        sendFollowUpReminders();
        setInterval(sendFollowUpReminders, 24 * 60 * 60 * 1000);
      }, delay);
    } else {
      const delay = msUntilNext9amIST();
      console.log(`[Reminder] Next run in ${Math.round(delay / 60000)} minutes`);
      setTimeout(() => {
        sendFollowUpReminders();
        setInterval(sendFollowUpReminders, 24 * 60 * 60 * 1000);
      }, delay);
    }
  } catch (err) {
    // Non-fatal — fall back to the original timer-only approach
    console.error('[Reminder] Startup check failed, falling back to timer:', err.message);
    const delay = msUntilNext9amIST();
    setTimeout(() => {
      sendFollowUpReminders();
      setInterval(sendFollowUpReminders, 24 * 60 * 60 * 1000);
    }, delay);
  }
};

// Also export for manual trigger from API
module.exports = { startReminderScheduler, sendFollowUpReminders };
