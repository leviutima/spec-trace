# Vitest reporter

Requirements for `SpecTraceReporter`, which writes `.spec-trace/results.json`
after a Vitest run.

## REQ-007 — Records the full describe/it name chain and a portable file path

**When** a test runs inside one or more nested `describe` blocks, **the
system shall** record that test's name as the full chain of ancestor
describe titles joined with the test's own title, so a requirement id
declared on an ancestor describe is preserved in the recorded name.
**The system shall** also record the test's file path relative to the
project root, using forward slashes even on Windows, rather than an
absolute path.

## REQ-008 — Records the real test status, never promoting skip/todo to covered

**When** a test's mode is `skip` or `todo`, **the system shall** record its
status as `skipped` or `todo` respectively, regardless of any result value
that might otherwise be present. **When** a test actually ran, **the
system shall** record `passed` or `failed` based on its real result.
