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
