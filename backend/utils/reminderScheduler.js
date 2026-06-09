/**
 * reminderScheduler.js — Daily follow-up reminder cron.
 *
 * Runs every day at 9:00 AM IST (3:30 AM UTC).
 * Finds all leads with followUpDate = today and status = 'Follow Up'.
 * Sends push notification to the assigned telecaller (and director).
 *
 * Uses setInterval polling — no external cron dependency needed.
 * For production, replace with node-cron or a cloud scheduler.
 */

const { notify } = require('./pushService');
const Lead        = require('../models/Lead');
const User        = require('../models/User');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

// Get today's date range in IST
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
const msUntilNextRun = () => {
  const now    = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);

  const next9am = new Date(istNow);
  next9am.setUTCHours(3, 30, 0, 0); // 9:00 AM IST = 03:30 UTC
  if (next9am <= istNow) {
    next9am.setUTCDate(next9am.getUTCDate() + 1);
  }

  return next9am.getTime() - now.getTime();
};

// Main reminder dispatch
const sendFollowUpReminders = async () => {
  try {
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

    if (!leads.length) {
      console.log('[Reminder] No follow-ups due today');
      return;
    }

    let sent = 0;
    for (const lead of leads) {
      // Notify telecaller
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

      // Notify director if they also want follow-up reminders
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

// Schedule to run daily at 9 AM IST
const startReminderScheduler = () => {
  const delay = msUntilNextRun();
  console.log(`[Reminder] Next run in ${Math.round(delay / 1000 / 60)} minutes`);

  setTimeout(() => {
    sendFollowUpReminders();
    // Then run every 24 hours
    setInterval(sendFollowUpReminders, 24 * 60 * 60 * 1000);
  }, delay);
};

// Also export for manual trigger from API
module.exports = { startReminderScheduler, sendFollowUpReminders };
