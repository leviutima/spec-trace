# CLI

Requirements for the `verify` and `report` commands, and the pipeline that
feeds them.

## REQ-029 — verify fails clearly on a missing spec directory or results file

**When** the configured results file does not exist on disk, **the
system shall** raise a distinct, catchable error whose message tells the
user to run their test suite with the spec-trace reporter configured,
instead of crashing with an unrelated file-system error. **When** the
configured spec directory does not exist at all — the state of a
genuinely clean project, per the acceptance criteria — **the system
shall** likewise raise a distinct, catchable error with a message
telling the user to create it, instead of letting a raw `ENOENT` escape
to the terminal.

### Note: the three states of `results.json`

`gatherResults` distinguishes three states, each with its own mechanism —
this note ties them together in one place rather than duplicating the logic
description across specs. **Absent:** the suite never ran with the reporter
configured — `ResultsFileNotFoundError` (REQ-029). **Present, zero tests:**
the suite ran but produced nothing — the `empty-suite` rule (REQ-045), a
violation, not a neutral or clean state. **Present, with tests:** the normal
coverage-checking flow below.

## REQ-030 — Rule violations and weak-test findings are combined, respecting the on/off toggle

**When** gathering results for a project, **the system shall** combine
the rules engine's violations with weak-test findings collected by
statically reading every test source file that produced a result.
**When** the `weak-test` rule is set to `off`, **the system shall** skip
reading and analyzing those test files entirely.

## REQ-042 — Exactly one weak-test-unavailable violation, not one per file

**When** `detectWeakTests` reports that typescript is unavailable, **the
system shall** emit exactly one `weak-test` violation for the whole
run — not one per test file — and stop scanning further files, since
every subsequent file would fail the same way for the same reason.

## REQ-031 — verify's exit code respects violations and --fail-on

**When** `spec-trace verify` runs, **the system shall** exit 0 if no
violation meets the `--fail-on` threshold (`error` by default), and exit
1 otherwise. **When** `--fail-on warn` is given, **the system shall**
also fail on warning-severity violations, not just errors.

## REQ-032 — report writes an agent-readable file and never fails the build

**When** `spec-trace report` runs, **the system shall** write a markdown
report to `.spec-trace/report.md` and exit 0 regardless of how many
violations it found — the report is meant to be read by an agent on the
next turn, not to gate CI.

## REQ-046 — verify prints a quantitative coverage summary

**When** `spec-trace verify` finishes gathering requirements and violations,
**the system shall** append a summary counting the total number of
requirements, how many are covered and what percentage that is, how many
are uncovered, and how many `weak-test` violations were found — in both the
human output (as a trailing summary line) and the `--json` output (as a
`requirements` object alongside `violations`), so a reader gets the scale
of the problem at a glance instead of having to count violation lines.

## REQ-047 — --baseline snapshots the current violations and always exits 0

**When** `spec-trace verify --baseline` runs, **the system shall** compute
violations as normal, write a fingerprint of each one to
`.spec-trace/baseline.json`, print them exactly as an unbaselined run
would, and exit 0 regardless of severity — establishing a baseline is not
itself a failure, so a project can adopt spec-trace against existing,
uncorrected violations without an immediate red CI run.

## REQ-048 — A plain verify filters out violations already in the baseline

**When** `.spec-trace/baseline.json` exists and `spec-trace verify` runs
without `--baseline`, **the system shall** filter every violation matching
a baseline fingerprint out of the violation set before computing the
summary, the markdown report, and the exit code — only violations that are
new since the baseline was recorded can fail the run or appear in output.
A fingerprint is derived from a violation's rule, requirement id, file, and
message, deliberately excluding its line number, so an unrelated edit a few
lines above a baselined violation does not silently un-baseline it.

## REQ-049 — No baseline file means no filtering

**When** `.spec-trace/baseline.json` does not exist, **the system shall**
report every violation exactly as it would with no baseline feature at
all — baselining is opt-in and inert until `--baseline` has been run once.

## REQ-035 — Gathering results discovers the real test files on disk

**Before** evaluating `stale-results`, **the system shall** walk the
project directory (excluding `node_modules`, `dist`, `.git`,
`.spec-trace`, and `coverage`) and compute a content fingerprint for
every file whose name matches one of the configured `testMatch`
patterns, then pass both that on-disk file state and the file state
recorded in `results.json` into the rules engine. This is plain
filesystem I/O with no third-party glob dependency — `testMatch`
patterns are limited to the `**/<suffix>` shape (e.g. `**/*.test.ts`),
matched against each file's own name, not a general glob engine.

**When** `results.json` has a `tests` entry whose file has no matching
entry in `files` at all — an old-format results file predating this
fingerprinting, or one an agent hand-crafted to fake a clean run — **the
system shall** treat that file as recorded with a hash that can never
match real content, so it still surfaces as a `stale-results` violation
instead of silently passing.

## REQ-043 — Expected CLI errors print a short message and hint, never a raw stack

**When** `gatherOrExit` catches an error that is a `CliError` (every expected
failure mode — missing results file, missing spec directory, malformed spec,
invalid `idPattern`, unavailable typescript peerDependency, unparsable
results.json — is one), **the system shall** print that error's `message`
and, if present, its `hint`, to stderr in red, and **shall not** print the
error's stack trace. **When** `--verbose` is passed to `verify` or `report`,
or the `DEBUG` environment variable is exactly `spec-trace`, **the system
shall** also print the full stack trace. **When** an error is not a
`CliError` — a genuine bug in spec-trace itself — **the system shall** let
it propagate uncaught rather than swallowing or reformatting it.

## REQ-044 — results.json is parsed BOM-tolerantly, with a clear error otherwise

**When** `results.json` begins with a UTF-8 byte-order-mark, **the system
shall** strip it before parsing, since PowerShell's default file encoding on
Windows commonly adds one. **When** the file's content still cannot be
parsed as JSON after that, **the system shall** raise a distinct, catchable
error naming the absolute path and citing a BOM or manual hand-editing as
the likely cause, instead of letting a raw `SyntaxError` and its stack
trace escape to the terminal.

## REQ-036 — testIgnore excludes directories the disk walker should not treat as tests

**When** the config's `testIgnore` array (default: empty) contains a
directory prefix, **the system shall** skip any file on disk whose path
relative to the project root starts with that prefix when discovering
test files for `stale-results` — a project can legitimately have
`*.test.ts`-named fixture files that are never meant to run directly
(this project's own `test/fixtures/` is exactly that case; without
`testIgnore` its own dogfooding run flags every fixture test file as
`never-ran`). This is a plain path-prefix match, not a glob pattern.
