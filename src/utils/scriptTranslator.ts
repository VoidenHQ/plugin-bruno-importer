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
// what RegExpMatchArray returns. `.to.match(regex)` is handled separately
// (translateMatchStatement below), not through this map — confirmed against
// voiden-scripting's actual runtime (scriptEngine.ts's evaluateAssertion):
// the "matches" operator does `new RegExp(String(expected)).test(String(actual))`,
// so `expected` must be the regex's plain source text (no `/.../ ` delimiters,
// no flags), not a RegExp object.
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

/**
 * Translate one bare `expect(EXPR).to.MATCHER(ARG)` / `.to.be.true`
 * statement. Returns null if unrecognized. `testName` is the enclosing
 * `test("...", ...)`'s description, if any — carried through as
 * `voiden.assert`'s message argument so it isn't silently lost.
 */
function translateExpectStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();

  for (const [matcher, op] of Object.entries(CHAI_PROPERTY_MATCHERS)) {
    const re = new RegExp(`^expect\\((.+)\\)\\s*\\.to\\.${matcher.replace(/\./g, '\\.')}\\s*;?$`);
    const m = trimmed.match(re);
    if (m) {
      if (hasForeignToken(m[1])) return null;
      const messageArg = testName !== null ? `, undefined, ${JSON.stringify(testName)}` : '';
      return `voiden.assert(${m[1]}, "${op}"${messageArg});`;
    }
  }

  const callRe = new RegExp(`^expect\\((.+?)\\)\\s*\\.to\\.(not\\.)?(${MATCHER_ALTERNATION})\\((.*)\\)\\s*;?$`);
  const m = trimmed.match(callRe);
  if (!m) return null;
  const [, actual, notPrefix, matcher, arg] = m;
  const op = notPrefix ? CHAI_NOT_MATCHER_MAP[matcher] : CHAI_MATCHER_MAP[matcher];
  if (!op) return null;
  if (hasForeignToken(actual) || hasForeignToken(arg)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert(${actual}, "${op}", ${arg}${messageArg});`;
}

/**
 * `expect(EXPR).to.(not.)have.property(ARG)` — Chai's property-existence
 * matcher. Approximated via voiden.assert's "truthy"/"falsy" on a bracket
 * access, since there's no dedicated "has property" operator. Not a perfect
 * equivalent — a property present but holding a falsy value (`0`, `""`,
 * `false`) would read as "missing" here — but it's the right call for the
 * overwhelmingly common case (checking a key exists on a JSON body).
 */
function translatePropertyStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.(not\.)?have\.property\((.+?)\)\s*;?$/);
  if (!m) return null;
  const [, actual, notPrefix, arg] = m;
  if (hasForeignToken(actual) || hasForeignToken(arg)) return null;
  const op = notPrefix ? 'falsy' : 'truthy';
  const messageArg = testName !== null ? `, undefined, ${JSON.stringify(testName)}` : '';
  return `voiden.assert((${actual})[${arg}], "${op}"${messageArg});`;
}

/**
 * `expect(EXPR).to.be.within(MIN, MAX)` — Chai's inclusive-range matcher.
 * There's no single `voiden.assert` operator for "between", so this expands
 * into two calls (`>=` MIN and `<=` MAX) that must both pass — equivalent to
 * the original range check. The negated form (`.to.not.within(...)`) isn't
 * handled: that's an OR of two conditions, which can't be expressed as two
 * independent `voiden.assert` calls that both need to pass, so it correctly
 * falls through to the unrecognized-construct path instead.
 */
function translateWithinStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.be\.within\((.+?),\s*(.+?)\)\s*;?$/);
  if (!m) return null;
  const [, actual, min, max] = m;
  if (hasForeignToken(actual) || hasForeignToken(min) || hasForeignToken(max)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert(${actual}, ">=", ${min}${messageArg});\nvoiden.assert(${actual}, "<=", ${max}${messageArg});`;
}

/**
 * `expect(EXPR).to.match(/pattern/)` — Chai's regex-match matcher. Only a
 * literal, flag-less regex argument translates — voiden.assert's "matches"
 * operator does `new RegExp(String(expected)).test(String(actual))`, which
 * can't carry regex flags through, and `String(aRegexObject)` would include
 * the `/.../ ` delimiters, corrupting the pattern.
 */
function translateMatchStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.match\(\s*\/(.+)\/\s*\)\s*;?$/);
  if (!m) return null;
  const [, actual, pattern] = m;
  if (hasForeignToken(actual)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert(${actual}, "matches", ${JSON.stringify(pattern)}${messageArg});`;
}

/**
 * `expect(EXPR).to.(not.)be.null` / `.to.(not.)be.undefined` /
 * `.to.(not.)exist`. Chai's `.exist`/`.not.exist` check "not null AND not
 * undefined" — expressible exactly with voiden.assert's loose `!=`/`==`
 * against `null` (JS's loose equality treats `null == undefined` as true).
 * `.null`/`.undefined` are strict checks, so they use `===`/`!==`.
 */
function translateExistenceStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const patterns: Array<[RegExp, string, 'null' | 'undefined']> = [
    [/^expect\((.+?)\)\s*\.to\.not\.be\.null\s*;?$/, '!==', 'null'],
    [/^expect\((.+?)\)\s*\.to\.be\.null\s*;?$/, '===', 'null'],
    [/^expect\((.+?)\)\s*\.to\.not\.be\.undefined\s*;?$/, '!==', 'undefined'],
    [/^expect\((.+?)\)\s*\.to\.be\.undefined\s*;?$/, '===', 'undefined'],
    [/^expect\((.+?)\)\s*\.to\.not\.exist\s*;?$/, '==', 'null'],
    [/^expect\((.+?)\)\s*\.to\.exist\s*;?$/, '!=', 'null'],
  ];
  for (const [re, op, literal] of patterns) {
    const m = trimmed.match(re);
    if (!m) continue;
    if (hasForeignToken(m[1])) return null;
    const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
    return `voiden.assert(${m[1]}, "${op}", ${literal}${messageArg});`;
  }
  return null;
}

// typeof-safe type names only — "array"/"object"/"null"/"date" etc. can't be
// distinguished by `typeof` alone, so `.to.be.a("array")` etc. fall through
// to the unrecognized-construct fallback instead of risking a wrong check.
const TYPEOF_SAFE_TYPES = new Set(['string', 'number', 'boolean', 'function', 'undefined', 'bigint', 'symbol']);

/** `expect(EXPR).to.be.a("string")` / `.to.be.an("number")` — Chai's type matcher, typeof-safe subset only. */
function translateTypeofStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.be\.an?\(\s*(['"])(.+?)\2\s*\)\s*;?$/);
  if (!m) return null;
  const [, actual, , typeName] = m;
  if (hasForeignToken(actual)) return null;
  if (!TYPEOF_SAFE_TYPES.has(typeName)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert(typeof (${actual}), "==", ${JSON.stringify(typeName)}${messageArg});`;
}

/** `expect(EXPR).to.have.lengthOf(n)` — exact for both strings and arrays, both of which carry a real `.length`. */
function translateLengthOfStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.have\.lengthOf\((.+?)\)\s*;?$/);
  if (!m) return null;
  const [, actual, len] = m;
  if (hasForeignToken(actual) || hasForeignToken(len)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert((${actual}).length, "==", ${len}${messageArg});`;
}

/**
 * `expect(EXPR).to.be.oneOf([...])` — Chai's array-membership matcher.
 * voiden.assert's "contains" operator checks `actual.includes(expected)`
 * when `actual` is an array, so this translates by swapping which side is
 * "actual" — the options array becomes voiden.assert's `actual`, and the
 * value being checked becomes its `expected`.
 */
function translateOneOfStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.be\.oneOf\((.+?)\)\s*;?$/);
  if (!m) return null;
  const [, actual, options] = m;
  if (hasForeignToken(actual) || hasForeignToken(options)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert(${options}, "contains", ${actual}${messageArg});`;
}

/**
 * `expect(EXPR).to.be.closeTo(expected, delta)` — Chai's approximate-number
 * matcher. No single voiden.assert operator for "close to", so this expands
 * into the same two-sided range check `.within` uses, with the bounds
 * computed as arithmetic expressions in the *generated* code (not evaluated
 * here) — `expected - delta` and `expected + delta`.
 */
function translateCloseToStatement(line: string, testName: string | null): string | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^expect\((.+?)\)\s*\.to\.be\.closeTo\((.+?),\s*(.+?)\)\s*;?$/);
  if (!m) return null;
  const [, actual, expected, delta] = m;
  if (hasForeignToken(actual) || hasForeignToken(expected) || hasForeignToken(delta)) return null;
  const messageArg = testName !== null ? `, ${JSON.stringify(testName)}` : '';
  return `voiden.assert(${actual}, ">=", (${expected}) - (${delta})${messageArg});\nvoiden.assert(${actual}, "<=", (${expected}) + (${delta})${messageArg});`;
}

// Captures the test's description text (group 2) so callers can thread it
// through as each assertion's voiden.assert message argument.
const TEST_OPEN_RE = /^test\(\s*(['"])(.*?)\1\s*,\s*(function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{\s*$/;
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
  let currentTestName: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') { out.push(''); continue; }
    if (trimmed.startsWith('//')) { out.push(line); continue; }

    if (!inTestBlock) {
      const openMatch = trimmed.match(TEST_OPEN_RE);
      if (openMatch) { inTestBlock = true; currentTestName = openMatch[2]; continue; } // drop test(...) { wrapper, keep its name
    }
    if (inTestBlock && TEST_CLOSE_RE.test(trimmed)) { inTestBlock = false; currentTestName = null; continue; } // drop closing });

    const propertyLine = translatePropertyStatement(trimmed, currentTestName);
    if (propertyLine) { out.push(propertyLine); continue; }

    const withinLine = translateWithinStatement(trimmed, currentTestName);
    if (withinLine) { out.push(withinLine); continue; }

    const matchLine = translateMatchStatement(trimmed, currentTestName);
    if (matchLine) { out.push(matchLine); continue; }

    const existenceLine = translateExistenceStatement(trimmed, currentTestName);
    if (existenceLine) { out.push(existenceLine); continue; }

    const typeofLine = translateTypeofStatement(trimmed, currentTestName);
    if (typeofLine) { out.push(typeofLine); continue; }

    const lengthOfLine = translateLengthOfStatement(trimmed, currentTestName);
    if (lengthOfLine) { out.push(lengthOfLine); continue; }

    const oneOfLine = translateOneOfStatement(trimmed, currentTestName);
    if (oneOfLine) { out.push(oneOfLine); continue; }

    const closeToLine = translateCloseToStatement(trimmed, currentTestName);
    if (closeToLine) { out.push(closeToLine); continue; }

    const expectLine = translateExpectStatement(trimmed, currentTestName);
    if (expectLine) { out.push(expectLine); continue; }

    // Anything with no remaining foreign token (bru.*, req./res. calls not
    // covered above, an unresolved test(/expect() wrapper) is already fully
    // substituted plain JS / voiden.* — safe to keep as-is.
    // require(...)/import are left as-is deliberately: Voiden's JS scripting
    // engine runs each script in a real Node.js subprocess (see
    // voiden-scripting's scriptEngine.ts — spawned with `cwd: projectPath`,
    // a real require() passed into the script function), so a plain
    // `require('moment')`-style call is exactly as usable here as it is in
    // Bruno itself, resolving against the active Voiden project's own
    // node_modules. Whether that specific package is actually installed in
    // the project is a runtime concern for the user, not a translation-
    // safety concern for this module.
    if (!/\bbru\.\w|\breq\.\w|\bres\.\w|\btest\(|\bexpect\(/.test(trimmed)) { out.push(line); continue; }

    // Unrecognized construct — bail out for the whole script.
    return { body: rawScript, safe: false };
  }

  if (inTestBlock) return { body: rawScript, safe: false }; // unterminated block — regex mismatch, don't risk it

  return { body: out.join('\n'), safe: true };
}
