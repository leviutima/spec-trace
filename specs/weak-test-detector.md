# Weak test detector

Requirements for `detectWeakTests`, the static AST analyzer that flags
tests matching one of four heuristics. This rule is heuristic by nature —
it defaults to `warn`, not `error`, and every finding can be silenced.

## REQ-018 — no-assertions heuristic

**When** a test's body contains zero `expect(...)` calls, **the system
shall** flag it with the `no-assertions` reason.

## REQ-019 — non-discriminant-assertions heuristic

**When** every assertion in a test uses a non-discriminant matcher
(`toBeDefined`, `toBeTruthy`, `toBeFalsy`, `toBeInstanceOf`, or
`not.toThrow`), **the system shall** flag it with the
`non-discriminant-assertions` reason. **When** a test mixes a
non-discriminant assertion with at least one other kind of assertion,
**the system shall not** flag it for this reason.

## REQ-020 — target-module-mocked heuristic

**When** a test references an identifier imported from a module that the
same file also passes to `vi.mock(...)`, **the system shall** flag it
with the `target-module-mocked` reason.

## REQ-021 — tautological-assertion heuristic

**When** an assertion's subject and expected value are both literal values
of identical text (for example `expect(2).toBe(2)`), **the system shall**
flag it with the `tautological-assertion` reason. **When** the subject
comes from a real computation instead of a literal, **the system shall
not** flag it, even if the values happen to match.

## REQ-022 — Findings report location and can be silenced

**When** a finding is produced, **the system shall** include the full
describe/it name chain, the source file, and the 1-based line number of
the `it`/`test` call. **When** a `// spec-trace-disable-next-line
weak-test` comment appears on the line directly above an `it`/`test`
call, **the system shall** suppress any finding for that test.
