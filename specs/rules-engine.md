# Rules engine

Requirements for `checkRules`, the pure function that compares parsed
requirements against reporter test results.

## REQ-009 — uncovered-requirement

**When** no test references a requirement's id anywhere in its name,
**the system shall** report an `uncovered-requirement` violation for that
requirement.

## REQ-010 — orphan-test

**When** a test's full name (including inherited describe titles) contains
no requirement id at all, **the system shall** report an `orphan-test`
violation for that test.

## REQ-011 — unknown-requirement

**When** a test references a requirement id that does not exist anywhere
in the parsed spec, **the system shall** report an `unknown-requirement`
violation naming that id.

## REQ-012 — skipped-coverage

**When** every test covering a requirement is skipped or todo, **the
system shall** report a `skipped-coverage` violation — a skipped or todo
test is not proof that the requirement holds.

## REQ-013 — failing-coverage

**When** at least one test covering a requirement has failed, **the
system shall** report a `failing-coverage` violation for that requirement.

## REQ-014 — duplicate-requirement

**When** the requirements passed into the rules engine contain the same
id more than once, **the system shall** report a `duplicate-requirement`
violation listing every location — independently of the spec parser's own
fatal error, so the engine stays correct even if its input comes from
somewhere else.

## REQ-015 — Ignored requirements produce no violations

**When** a requirement is flagged as ignored (via the spec-trace:ignore
marker) or listed in the config's `ignore` array, **the system shall**
skip every coverage check for that requirement and report no violation of
any kind for it.

## REQ-016 — Rule severities are configurable

**When** the caller supplies a severity override for a rule, **the system
shall** use that severity instead of the documented default, including
`off` to suppress the rule entirely.

## REQ-017 — Coverage counts correctly across mixed statuses and shared tests

**When** a requirement is covered by a mix of passing and skipped/todo
tests, **the system shall** treat it as adequately covered as long as at
least one covering test passed. **When** a single test's name references
more than one requirement id, **the system shall** count that test as
coverage for every id it references.

## REQ-034 — stale-results

**When** the caller supplies file-state information (which test files
`results.json` recorded versus which test files actually exist on disk
right now, each with a content hash), **the system shall** report a
`stale-results` violation for each of the following, independently:

- **deleted**: a file recorded in `results.json` no longer exists on disk.
- **modified**: a file recorded in `results.json` still exists, but its
  current content hash does not match the hash that was recorded.
- **never-ran**: a file on disk matches the test-file pattern but was
  never recorded in `results.json` at all.

`never-ran` is the one that matters most in practice — it's what catches
a test an agent wrote and never ran, or a test file that was deleted and
never re-run to prove the deletion didn't remove coverage. **When** no
file-state information is supplied, **the system shall** skip this rule
entirely rather than treat its absence as passing.

## REQ-045 — empty-suite

**When** the test results passed into the rules engine are an empty array,
**the system shall** report a single `empty-suite` violation, independent of
how many requirements exist — a suite that produced zero results proves
nothing, whether that's because no test files matched, `vitest run
--passWithNoTests` slipped through, or `results.json` was hand-crafted as
`{"tests":[]}`. This is the exact shape `spec-trace init` scaffolds on
first run, on purpose: an empty suite should be a visible violation from
the very first `verify`, not a silent pass.

## REQ-038 — idPattern controls which ids are recognized in test names

**When** the caller supplies a custom `idPattern` (default `REQ-\d+`),
**the system shall** use that pattern — not the hardcoded default — when
extracting requirement ids from a test's name for coverage, orphan-test,
and unknown-requirement purposes. A test name containing a token matching
the *default* pattern **shall not** be treated as referencing any
requirement when a different `idPattern` is configured.
