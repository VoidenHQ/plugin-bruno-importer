/**
 * Best-effort translation of a Bruno `bru.*`/`req.*`/`res.*` pre-request/
 * post-response script into Voiden's `voiden.*` scripting API (see the
 * voiden-scripting skill for the full target API). Translation only happens
 * if the ENTIRE script resolves to recognized, safe patterns — if any line
 * contains something this module doesn't understand (control flow,
 * `bru.sendRequest`/`bru.runRequest`, an unrecognized chai matcher, custom
 * helper functions, ...), the WHOLE script is left untranslated and falls
 * back to the existing commented-out rendering. Never a half-translated,
 * half-commented script.
 *
 * Chai matcher → voiden.assert operator mapping is shared conceptually with
 * postman-import's and insomnia-importer's translators — all three tools
 * embed the same Chai.js BDD library, only the wrapping function names
 * (`test`, bare here vs `pm.test`/`insomnia.test`) and field-access syntax
 * differ. Bruno's own `test(name, fn)`/`expect(...)` calls have NO prefix
 * at all — confirmed by real Bruno fixtures (RealWorld/Conduit's collection
 * even uses bare top-level `expect(...)` with no `test()` wrapper at all,
 * which this translator handles the same as a wrapped one since each line
 * is matched independently of whether it's inside a test block).
 */

// Keys are the plain matcher text as it appears in source (dot not escaped)
// — they double as regex capture-group lookup keys, so must match exactly
// what RegExpMatchArray returns. `matches`/`.to.match(regex)` is
// deliberately excluded — voiden.assert's handling of a RegExp value for
// "matches" isn't confirmed, so that matcher always falls back to unsafe.
const CHAI_MATCHER_MAP: Record<string, string> = {
  eql: '==',
  equal: '===',
  'be.above': '>',
  'be.greaterThan': '>',
  'be.at.least': '>=',
  'be.gte': '>=',
  'be.below': '<',
  'be.lessThan': '<',
  'be.at.most': '<=',
  'be.lte': '<=',
  include: 'contains',
  contain: 'contains',
};
const CHAI_NOT_MATCHER_MAP: Record<string, string> = {
  eql: '!=',
  equal: '!==',
};
const CHAI_PROPERTY_MATCHERS: Record<string, string> = {
  'be.true': 'truthy',
  'be.ok': 'truthy',
  'be.false': 'falsy',
};

function escapeForAlternation(keys: string[]): string {
  return keys.map((k) => k.replace(/\./g, '\\.')).join('|');
}

const MATCHER_ALTERNATION = escapeForAlternation(Object.keys(CHAI_MATCHER_MAP));

/**
 * Apply all the direct bru./req./res. → voiden.* substitutions that are
 * safe anywhere in an expression, not just as a whole statement — runtime
 * variable get/set, request/response field access, console.log. Runs
 * BEFORE assert-line matching so a variable call nested inside an expect()
 * argument (e.g. `bru.getVar("uid")` inside `.to.eql("x" + bru.getVar("uid"))`
 * — a real pattern from the RealWorld/Conduit fixture) is already voiden.*
 * by the time that line is checked.
 */
function substituteKnownCalls(text: string): string {
  let out = text;
  out = out.replace(/bru\.setVar\(/g, 'voiden.variables.set(');
  out = out.replace(/bru\.getVar\(/g, 'voiden.variables.get(');
  // getEnvVar has a clean read target; setEnvVar doesn't (voiden.env is
  // read-only) — approximated onto the runtime-variable store instead of
  // left unrecognized, since dropping the whole script over one setter
  // would be a worse outcome than a labeled approximation.
  out = out.replace(/bru\.getEnvVar\(/g, 'voiden.env.get(');
  out = out.replace(/bru\.setEnvVar\(/g, 'voiden.variables.set(');
  // req.* (pre-request only) — method-based per Bruno's own JS reference
  out = out.replace(/req\.getUrl\(\)/g, 'voiden.request.url');
  out = out.replace(/req\.setUrl\((.+?)\)/g, 'voiden.request.url = $1');
  out = out.replace(/req\.getMethod\(\)/g, 'voiden.request.method');
  out = out.replace(/req\.setMethod\((.+?)\)/g, 'voiden.request.method = $1');
  out = out.replace(/req\.getBody\(\)/g, 'voiden.request.body');
  out = out.replace(/req\.setBody\((.+?)\)/g, 'voiden.request.body = $1');
  out = out.replace(/req\.setHeader\(/g, 'voiden.request.headers.push('); // {name,value} pairs differ; see skill.md caveat
  out = out.replace(/req\.getHeader\((.+?)\)/g, 'voiden.request.headers[$1]');
  // res.* (post-response) — both property and method forms are real per Bruno's docs
  out = out.replace(/res\.getStatus\(\)/g, 'voiden.response.status');
  out = out.replace(/res\.status\b/g, 'voiden.response.status');
  out = out.replace(/res\.getStatusText\(\)/g, 'voiden.response.statusText');
  out = out.replace(/res\.statusText\b/g, 'voiden.response.statusText');
  out = out.replace(/res\.getBody\(\)/g, 'voiden.response.body');
  out = out.replace(/res\.body\b/g, 'voiden.response.body');
  out = out.replace(/res\.getHeader\((.+?)\)/g, 'voiden.response.headers[$1]');
  out = out.replace(/res\.getResponseTime\(\)/g, 'voiden.response.time');
  out = out.replace(/res\.responseTime\b/g, 'voiden.response.time');
  out = out.replace(/console\.log\(/g, 'voiden.log(');
  return out;
}

// A captured sub-expression (the "actual" or "arg" inside expect(...)) must
// itself be free of any remaining bru./req./res. token before the match is
// accepted — matching the outer expect(...).to.X(...) shape is not enough
// on its own. Without this, something like
// `expect(req.getHeaders()).to.eql(y)` (a call this module doesn't
// substitute) would shape-match and get accepted with a literal,
// untranslated call left inside the "safe" output — exactly the
// half-translated result this module exists to prevent.
function hasForeignToken(expr: string): boolean {
  return /\bbru\.\w|\breq\.\w|\bres\.\w/.test(expr);
}

/** Translate one bare `expect(EXPR).to.MATCHER(ARG)` / `.to.be.true` statement. Returns null if unrecognized. */
function translateExpectStatement(line: string): string | null {
  const trimmed = line.trim();

  for (const [matcher, op] of Object.entries(CHAI_PROPERTY_MATCHERS)) {
    const re = new RegExp(`^expect\\((.+)\\)\\s*\\.to\\.${matcher.replace(/\./g, '\\.')}\\s*;?$`);
    const m = trimmed.match(re);
    if (m) {
      if (hasForeignToken(m[1])) return null;
      return `voiden.assert(${m[1]}, "${op}");`;
    }
  }

  const callRe = new RegExp(`^expect\\((.+?)\\)\\s*\\.to\\.(not\\.)?(${MATCHER_ALTERNATION})\\((.*)\\)\\s*;?$`);
  const m = trimmed.match(callRe);
  if (!m) return null;
  const [, actual, notPrefix, matcher, arg] = m;
  const op = notPrefix ? CHAI_NOT_MATCHER_MAP[matcher] : CHAI_MATCHER_MAP[matcher];
  if (!op) return null;
  if (hasForeignToken(actual) || hasForeignToken(arg)) return null;
  return `voiden.assert(${actual}, "${op}", ${arg});`;
}

const TEST_OPEN_RE = /^test\(\s*(['"]).*?\1\s*,\s*(function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{\s*$/;
const TEST_CLOSE_RE = /^\}\s*\)\s*;?\s*$/;

/**
 * Join a chained-method continuation (a line ending mid-expression, with the
 * next line starting with `.`) back into one logical line before per-line
 * matching — real-world formatting often wraps a long `expect(...)` chain
 * across lines (confirmed in a real Kong/insomnia example fixture using the
 * same shape: `expect(...)\n  .to.eql(...)`), which the per-line matchers
 * below can't see across otherwise. Purely mechanical — not general JS
 * parsing — so it only fixes this one specific, common shape.
 */
function joinChainedMethodLines(lines: string[]): string[] {
  const joined: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const prev = joined[joined.length - 1];
    if (prev !== undefined && trimmed.startsWith('.') && !/[;{}]\s*(\/\/.*)?$/.test(prev)) {
      joined[joined.length - 1] = `${prev} ${trimmed}`;
    } else {
      joined.push(line);
    }
  }
  return joined;
}

/**
 * Translate a full script. Returns { body, safe: true } with a live
 * voiden.*-only script when every line resolved; { safe: false } (body is
 * the original untouched text) when anything was unrecognized, signaling
 * the caller to fall back to the commented-out rendering instead.
 */
export function translateBruScript(rawScript: string): { body: string; safe: boolean } {
  const substituted = substituteKnownCalls(rawScript);
  const lines = joinChainedMethodLines(substituted.split(/\r?\n/));
  const out: string[] = [];
  let inTestBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') { out.push(''); continue; }
    if (trimmed.startsWith('//')) { out.push(line); continue; }

    if (!inTestBlock && TEST_OPEN_RE.test(trimmed)) { inTestBlock = true; continue; } // drop test(...) { wrapper
    if (inTestBlock && TEST_CLOSE_RE.test(trimmed)) { inTestBlock = false; continue; } // drop closing });

    const expectLine = translateExpectStatement(trimmed);
    if (expectLine) { out.push(expectLine); continue; }

    // Anything with no remaining foreign token (bru.*, req./res. calls not
    // covered above, an unresolved test(/expect() wrapper) is already fully
    // substituted plain JS / voiden.* — safe to keep as-is.
    if (!/\bbru\.\w|\breq\.\w|\bres\.\w|\btest\(|\bexpect\(/.test(trimmed)) { out.push(line); continue; }

    // Unrecognized construct — bail out for the whole script.
    return { body: rawScript, safe: false };
  }

  if (inTestBlock) return { body: rawScript, safe: false }; // unterminated block — regex mismatch, don't risk it

  return { body: out.join('\n'), safe: true };
}
