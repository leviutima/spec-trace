# Working on spec-trace

This file is for AI agents (and humans) working in this repository. It's
also a template: the block under "For projects that use spec-trace" is
meant to be copied into the `AGENTS.md` / `CLAUDE.md` of a project that
depends on `@leviutima/spec-trace`.

## This repository specifically

- Every code fix or new behavior starts with a new `REQ-<n>` in `specs/`,
  then a failing test, then the implementation. A change with no
  requirement behind it doesn't go in.
- `npm test` builds first, then runs the suite (`pretest` triggers the
  build) and produces this repo's own `.spec-trace/results.json`.
- `npm run verify` runs the built CLI against this repo's own specs. It
  should report `0 errors, 0 warnings` before you're done — this repo
  dogfoods itself, and CI runs the same check on every push.
- Don't run `npx vitest run test/<one-file>.test.ts` and then stop:
  partial runs overwrite `.spec-trace/results.json` with only that
  subset, and the next `npm run verify` will report every other test
  file as `stale-results: never-ran`. Run the full `npm test` before
  checking `verify`.

## Definition of done

A task in this repo isn't done until:

1. `npm run typecheck && npm run lint` pass.
2. `npm test` passes — the full suite, not a filtered subset.
3. `npm run verify` reports `0 errors, 0 warnings`.
4. Every new/changed behavior has a `REQ-<n>` in `specs/` and a test
   tagged with that id.

## For projects that use spec-trace

Copy this into your own `AGENTS.md` / `CLAUDE.md`:

```md
## Definition of done

A task is only done when:

1. `npm test` runs the full suite (produces `.spec-trace/results.json`)
2. `npx spec-trace report` writes `.spec-trace/report.md`
3. You've read `.spec-trace/report.md` and fixed everything until
   `npx spec-trace verify` is clean

Never mark a task complete with open violations.
Never silence `weak-test` with `spec-trace-disable-next-line` just to
close the gate — only silence it when you can explain why the test is
actually strong despite the heuristic flagging it.
```
