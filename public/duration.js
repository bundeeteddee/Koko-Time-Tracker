// Duration parsing and formatting. Loaded as a plain script in the browser and
// required directly by test/duration.test.js — hence the guarded export at the
// bottom. No bundler involved.

// Accepted input: "90", "90m", "2h", "1:30", "1:30h", "1h30", "1h30m", "1.5", "1.5h".
// "h:mm" is always hours-and-minutes, so a trailing hour suffix on it is
// redundant rather than a second quantity — "1:30h" is 90 minutes, not 30 hours.
const DUR_HMM = /^(\d+)\s*:\s*(\d{1,2})\s*(?:h|hrs?|hours?)?$/;
const DUR_H_MM = /^(\d+)\s*(?:h|hrs?|hours?)\s*(\d{1,2})$/;
const DUR_DECIMAL = /^(\d*\.\d+)\s*(?:h|hrs?|hours?)?$/;
const DUR_BARE = /^(\d+)$/;

function parseDur(s) {
  s = (s || '').trim().toLowerCase();
  if (!s) return 0;
  let m;
  if ((m = s.match(DUR_HMM))) return (+m[1]) * 60 + (+m[2]);
  // Anything else containing a colon is malformed, not a unit-suffixed number:
  // without this, "1:30:00" would fall through to the scanner below as "30".
  if (s.includes(':')) return 0;
  if ((m = s.match(DUR_H_MM))) return (+m[1]) * 60 + (+m[2]);
  if ((m = s.match(DUR_DECIMAL))) return Math.round(parseFloat(m[1]) * 60);
  // Free-form scan: sums every unit-suffixed number it finds ("1h 30m", "2h").
  // A fresh literal each call, so the /g lastIndex never leaks between calls.
  const re = /(\d+)\s*(h|hrs?|hours?|m|mins?|minutes?)/g;
  let mins = 0, ok = false, r;
  while ((r = re.exec(s))) { ok = true; mins += r[2][0] === 'h' ? (+r[1]) * 60 : (+r[1]); }
  if (ok) return mins;
  if ((m = s.match(DUR_BARE))) return +m[1];
  return 0;
}

function fmtDur(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h && m) return h + 'h' + String(m).padStart(2, '0');
  if (h) return h + 'h';
  return m + 'm';
}
function fmtH(mins) { return (Math.round(mins / 60 * 10) / 10) + 'h'; }

if (typeof module !== 'undefined' && module.exports) module.exports = { parseDur, fmtDur, fmtH };
