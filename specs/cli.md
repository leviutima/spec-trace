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

## REQ-030 — Rule violations and weak-test findings are combined, respecting the on/off toggle

**When** gathering results for a project, **the system shall** combine
the rules engine's violations with weak-test findings collected by
statically reading every test source file that produced a result.
**When** the `weak-test` rule is set to `off`, **the system shall** skip
reading and analyzing those test files entirely.

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
