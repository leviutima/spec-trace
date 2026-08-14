# Working with spec-trace

This project uses [spec-trace](https://github.com/leviutima/spec-trace) as
an external judge: it checks whether tests actually prove the requirements
in `specs/`, not just that they pass.

## The flow

1. Write (or update) a requirement in `specs/*.md` as a heading that starts
   with a stable id (`REQ-<n>` by default) — before writing any code.
2. Write a test whose `describe`/`it` name includes that id, then implement
   the behavior the requirement describes.
3. Run the full test suite (with the spec-trace reporter configured, see
   `vitest.config`) so `.spec-trace/results.json` reflects every test file,
   not a filtered subset.
4. Run `npx spec-trace report` — it writes `.spec-trace/report.md`, an
   agent-readable table of every requirement's status plus one actionable
   section per violation.
5. Read `.spec-trace/report.md` and fix everything it flags until
   `npx spec-trace verify` reports `0 errors, 0 warnings`.

## Definition of done

A task is only done when:

1. `npm test` (or your project's equivalent) runs the full suite and
   produces `.spec-trace/results.json`.
2. `npx spec-trace report` writes `.spec-trace/report.md`.
3. You've read `.spec-trace/report.md` and fixed everything until
   `npx spec-trace verify` is clean.

Never mark a task complete with open violations. Never silence `weak-test`
with `// spec-trace-disable-next-line weak-test` just to close the gate —
only silence it when you can explain why the test is actually strong
despite the heuristic flagging it.

## Adopting spec-trace against an existing codebase

If `verify` reports a wall of pre-existing violations, that's expected —
run `npx spec-trace verify --baseline` once to record the current state.
After that, a plain `verify` only fails on violations that are new since
the baseline, so existing debt doesn't block work that isn't touching it.
