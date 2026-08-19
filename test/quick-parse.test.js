const test = require('node:test');
const assert = require('node:assert');
const { parseQuick, resolveProject } = require('../public/quick-parse.js');

function splits(name, cases) {
  test(name, () => {
    for (const [input, expected] of cases) {
      const got = parseQuick(input);
      assert.deepStrictEqual(
        { minutes: got.minutes, description: got.description, project: got.project },
        expected,
        `parseQuick(${JSON.stringify(input)})`);
    }
  });
}

splits('splits the leading duration off the description', [
  ['1:30 fixed the sheets sync', { minutes: 90, description: 'fixed the sheets sync', project: null }],
  ['2h standup', { minutes: 120, description: 'standup', project: null }],
  ['90m triage', { minutes: 90, description: 'triage', project: null }],
  ['1.5h wrote docs', { minutes: 90, description: 'wrote docs', project: null }],
  ['1h30 deep work', { minutes: 90, description: 'deep work', project: null }],
  ['1h30m deep work', { minutes: 90, description: 'deep work', project: null }],
  ['2h 15m code review', { minutes: 135, description: 'code review', project: null }],
  ['1:30h standup', { minutes: 90, description: 'standup', project: null }],
]);

splits('a bare leading number is minutes, and only the number is consumed', [
  ['90 emails', { minutes: 90, description: 'emails', project: null }],
  ['30 wrote 3 proposals', { minutes: 30, description: 'wrote 3 proposals', project: null }],
  // The description keeps its own durations — only the leading span is eaten.
  ['15m estimated the 2h migration', { minutes: 15, description: 'estimated the 2h migration', project: null }],
]);

splits('accepts a comma decimal and a comma after the duration', [
  ['1,5h deep work', { minutes: 90, description: 'deep work', project: null }],
  ['1,5 deep work', { minutes: 90, description: 'deep work', project: null }],
  ['90, wrote emails', { minutes: 90, description: 'wrote emails', project: null }],
  // Only the leading number is normalised — a comma decimal in prose survives.
  ['30m reviewed the 1,5 page draft', { minutes: 30, description: 'reviewed the 1,5 page draft', project: null }],
]);

splits('pulls out an @project mention from anywhere in the line', [
  ['1:30 sync work @Koko', { minutes: 90, description: 'sync work', project: 'Koko' }],
  ['1:30 @Koko sync work', { minutes: 90, description: 'sync work', project: 'Koko' }],
  ['1:30 sync @Koko work', { minutes: 90, description: 'sync work', project: 'Koko' }],
  ['1:30 sync @"Koko Time" work', { minutes: 90, description: 'sync work', project: 'Koko Time' }],
  // Only the first mention is a project; a later one stays in the description.
  ['1:30 @Koko asked @Sam', { minutes: 90, description: 'asked @Sam', project: 'Koko' }],
]);

splits('leaves tags and email addresses in the description', [
  ['1:30 fixed sync #bugfix #ops', { minutes: 90, description: 'fixed sync #bugfix #ops', project: null }],
  ['45m emailed foo@bar.com', { minutes: 45, description: 'emailed foo@bar.com', project: null }],
  ['45m emailed foo@bar.com @Koko', { minutes: 45, description: 'emailed foo@bar.com', project: 'Koko' }],
]);

test('rejects input with no usable duration', () => {
  for (const input of ['', '   ', 'fixed the sync', '#bugfix @Koko', 'h30 nonsense', '0 nothing', '0m nothing']) {
    assert.ok(parseQuick(input).error, `expected an error for ${JSON.stringify(input)}`);
  }
});

test('a duration on its own is a valid entry with an empty description', () => {
  assert.deepStrictEqual(parseQuick('2h'), { minutes: 120, description: '', project: null });
});

const PROJECTS = [{ id: 1, name: 'Koko Time' }, { id: 2, name: 'Klarna' }, { id: 3, name: 'Kobo' }];

test('resolveProject ignores case, spaces and punctuation', () => {
  for (const token of ['Koko Time', 'koko time', 'kokotime', 'koko-time', 'KOKOTIME']) {
    assert.strictEqual(resolveProject(PROJECTS, token).project.id, 1, token);
  }
});

test('resolveProject accepts a unique prefix', () => {
  assert.strictEqual(resolveProject(PROJECTS, 'koko').project.id, 1);
  assert.strictEqual(resolveProject(PROJECTS, 'klar').project.id, 2);
});

test('resolveProject reports ambiguous and unknown mentions rather than guessing', () => {
  const ambiguous = resolveProject(PROJECTS, 'ko');
  assert.match(ambiguous.error, /Koko Time/);
  assert.match(ambiguous.error, /Kobo/);
  assert.ok(!ambiguous.project);
  assert.ok(resolveProject(PROJECTS, 'nope').error);
});

test('an exact name wins over a project it is a prefix of', () => {
  const rows = [{ id: 1, name: 'Koko' }, { id: 2, name: 'Koko Time' }];
  assert.strictEqual(resolveProject(rows, 'Koko').project.id, 1);
});
