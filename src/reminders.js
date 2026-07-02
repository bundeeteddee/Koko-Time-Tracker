const { execFile } = require('node:child_process');
const { db, getSettings, setSetting } = require('./db');

function localToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function localHHMM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function fmtH(mins) { return (Math.round(mins / 60 * 10) / 10) + 'h'; }

function notify(message) {
  const script = `display notification ${JSON.stringify(message)} with title "Time Keeping"`;
  execFile('/usr/bin/osascript', ['-e', script], (err) => {
    if (err) console.error('notification failed:', err.message);
  });
}

// Reminder times are inclusive-late: if the server was asleep at 12:30 we still
// fire when a later tick sees now >= reminder time (same day, not fired yet).
function check() {
  const settings = getSettings();
  if (settings.reminders_enabled !== '1') return;

  const today = localToday();
  const now = localHHMM();
  const workdays = settings.workdays.split(',').filter(Boolean).map(Number);
  if (!workdays.includes(new Date().getDay())) return;

  const target = Number(settings.daily_target_minutes);
  const fired = settings.reminder_last_fired ? settings.reminder_last_fired.split('|') : [];
  const firedToday = (slot) => fired.includes(today + ':' + slot);
  const markFired = (slot) => setSetting('reminder_last_fired',
    fired.filter((f) => f.startsWith(today + ':')).concat(today + ':' + slot).join('|'));

  const logged = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM entries WHERE entry_date = ?').get(today).m;

  if (!firedToday('midday') && now >= settings.reminder_midday && now < settings.reminder_eod && logged < target * 0.5) {
    notify(`Logged ${fmtH(logged)} of ${fmtH(target)} so far today.`);
    markFired('midday');
  } else if (!firedToday('eod') && now >= settings.reminder_eod && logged < target) {
    notify(`Logged ${fmtH(logged)} of ${fmtH(target)} today — ${fmtH(target - logged)} untracked.`);
    markFired('eod');
  }
}

function start() {
  setInterval(check, 60 * 1000);
}

module.exports = { start, notify, check };
