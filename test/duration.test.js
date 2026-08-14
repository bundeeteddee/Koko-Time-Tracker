const test = require('node:test');
const assert = require('node:assert');
const { parseDur, fmtDur, fmtH } = require('../public/duration.js');

function table(name, cases) {
  test(name, () => {
    for (const [input, expected] of cases) {
      assert.strictEqual(parseDur(input), expected, `parseDur(${JSON.stringify(input)})`);
    }
  });
}

table('h:mm is hours and minutes', [
  ['0:30', 30],
  ['1:30', 90],
  ['1:05', 65],
  ['2:00', 120],
  ['8:15', 495],
  ['10:30', 630],
  ['0:00', 0],
  ['1:9', 69],
]);

// The bug this suite was written for: the trailing "h" used to knock the value
// out of the h:mm branch, and the free-form scanner then read "1:30h" as 30h.
table('h:mm tolerates a redundant hour suffix', [
  ['1:30h', 90],
  ['1:30 h', 90],
  ['1:30hr', 90],
  ['1:30hrs', 90],
  ['1:30hour', 90],
  ['1:30 hours', 90],
  ['7:45h', 465],
  ['1 : 30', 90],
]);

table('hours only', [
  ['2h', 120],
  ['2 h', 120],
  ['2hr', 120],
  ['2hrs', 120],
  ['2 hours', 120],
  ['1h', 60],
  ['12h', 720],
]);

table('minutes only', [
  ['30m', 30],
  ['30 m', 30],
  ['30min', 30],
  ['30 mins', 30],
  ['45 minutes', 45],
  ['90m', 90],
  ['90', 90],
  ['5', 5],
]);

table('hours and minutes combined', [
  ['1h30', 90],
  ['1h30m', 90],
  ['1h 30m', 90],
  ['1 h 30 m', 90],
  ['1hr30min', 90],
  ['2h05', 125],
  ['2h05m', 125],
  ['10h05', 605],
  ['8h15m', 495],
]);

table('decimal hours', [
  ['1.5', 90],
  ['1.5h', 90],
  ['1.5 hours', 90],
  ['0.5', 30],
  ['.5', 30],
  ['.5h', 30],
  ['2.25h', 135],
  ['0.1h', 6],
  ['1.75', 105],
  // Rounds to the nearest whole minute rather than truncating.
  ['0.01h', 1],
  ['1.33h', 80],
]);

table('whitespace and case are insensitive', [
  ['  1:30  ', 90],
  ['1:30H', 90],
  ['2H', 120],
  ['1H30M', 90],
  ['  90m ', 90],
]);

table('unparseable input is rejected as 0', [
  ['', 0],
  ['   ', 0],
  [null, 0],
  [undefined, 0],
  ['abc', 0],
  ['h', 0],
  ['-30', 0], // negatives are rejected outright, never silently made positive
  ['-1:30', 0],
  [':30', 0],
  ['1:', 0],
  ['1:30:00', 0],
  ['1:2:3', 0],
  ['1:300', 0],
]);

test('fmtDur renders minutes back to a compact label', () => {
  const cases = [[0, '0m'], [5, '5m'], [30, '30m'], [59, '59m'], [60, '1h'],
    [65, '1h05'], [90, '1h30'], [120, '2h'], [125, '2h05'], [605, '10h05'], [495, '8h15']];
  for (const [mins, expected] of cases) {
    assert.strictEqual(fmtDur(mins), expected, `fmtDur(${mins})`);
  }
});

// The edit dialog pre-fills its duration field with fmtDur(entry.minutes), so
// every string fmtDur can emit must survive a re-parse unchanged.
test('fmtDur output round-trips through parseDur', () => {
  for (let mins = 1; mins <= 24 * 60; mins++) {
    assert.strictEqual(parseDur(fmtDur(mins)), mins, `round trip at ${mins} (${fmtDur(mins)})`);
  }
});

test('fmtH renders minutes as decimal hours to one place', () => {
  const cases = [[0, '0h'], [30, '0.5h'], [60, '1h'], [90, '1.5h'], [125, '2.1h'], [480, '8h']];
  for (const [mins, expected] of cases) {
    assert.strictEqual(fmtH(mins), expected, `fmtH(${mins})`);
  }
});
