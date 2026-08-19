// Parses a one-line quick-log entry: "1:30 fixed the sheets sync #bugfix @Koko".
//
// Every cheap status-bar host (osascript dialogs, Shortcuts "Ask for Input",
// Raycast script arguments) offers exactly one text field, so the whole entry
// has to fit on one line and the parsing has to live here rather than in the
// shell. Kept free of any database access so it can be unit-tested directly and
// so callers stay in charge of resolving the project name they get back.

const { parseDur } = require('../public/duration.js');

// The leading duration span, longest form first so "1h30m" isn't cut short at
// "1h". Anchored and required to end on a word boundary so the scanner can't
// reach into the description the way parseDur's free-form mode would.
const LEAD_DUR = new RegExp(
  '^\\s*('
  + '\\d+\\s*:\\s*\\d{1,2}\\s*(?:h|hrs?|hours?)?'          // 1:30, 1:30h
  + '|\\d+\\s*(?:h|hrs?|hours?)\\s*\\d{1,2}\\s*(?:m|mins?|minutes?)?' // 1h30, 1h30m, 2h 15m
  + '|\\d*\\.\\d+\\s*(?:h|hrs?|hours?)?'                   // 1.5, 1.5h
  + '|\\d+\\s*(?:h|hrs?|hours?|m|mins?|minutes?)'          // 2h, 90m
  + '|\\d+'                                                // 90 (bare = minutes)
  + ')(?=\\s|$)', 'i');

// A project mention, either @Name or @"Two Words". Must start the line or
// follow whitespace so an email address in the description stays a description.
const PROJECT = /(^|\s)@(?:"([^"]*)"|([^\s"]+))/;

function parseQuick(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return { error: 'text is empty' };

  const d = raw.match(LEAD_DUR);
  if (!d) return { error: 'no duration found — start with one, e.g. "1:30 fixed the sync"' };
  const minutes = parseDur(d[1]);
  if (!(minutes > 0)) return { error: `could not read "${d[1].trim()}" as a duration` };

  let rest = raw.slice(d[0].length);
  let project = null;
  const p = rest.match(PROJECT);
  if (p) {
    project = (p[2] !== undefined ? p[2] : p[3]).trim() || null;
    // Keep the leading whitespace the mention captured, so removing "@Koko"
    // from "fixed sync @Koko today" doesn't glue the words either side together.
    rest = rest.slice(0, p.index) + p[1] + rest.slice(p.index + p[0].length);
  }

  return { minutes, description: rest.replace(/\s+/g, ' ').trim(), project };
}

// Resolves the @name from parseQuick against a list of {id, name} projects.
// Tolerant about case, spaces and punctuation ("@koko-time" finds "Koko Time"),
// then falls back to a unique prefix so short mentions work.
function resolveProject(projects, token) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = norm(token);
  if (!t) return { error: `unknown project "${token}"` };

  const exact = projects.filter((p) => norm(p.name) === t);
  if (exact.length) return { project: exact[0] };

  const prefix = projects.filter((p) => norm(p.name).startsWith(t));
  if (prefix.length === 1) return { project: prefix[0] };
  if (prefix.length > 1) {
    return { error: `"${token}" matches several projects: ${prefix.map((p) => p.name).join(', ')}` };
  }
  return { error: `unknown project "${token}"` };
}

module.exports = { parseQuick, resolveProject };
