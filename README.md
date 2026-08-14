# spec-trace

[![npm version](https://img.shields.io/npm/v/%40leviutima%2Fspec-trace.svg)](https://www.npmjs.com/package/@leviutima/spec-trace)
[![license](https://img.shields.io/npm/l/%40leviutima%2Fspec-trace.svg)](./LICENSE)

🇺🇸 English | 🇧🇷 [Português](./README.pt-BR.md)

**The agent can't be the judge of its own test.**

AI agents today write both the code and the tests that prove that code is
correct. That breaks the one guarantee TDD used to offer: the test as an
independent oracle. The agent optimizes for green, because that's literally
what it was asked to do — and it converges on tests that pass without
proving anything (`expect(x).toBeDefined()`, mocking the very module under
test, assertions that just mirror the implementation).

The result isn't broken code, which would be visible. It's **green and
wrong** code, which only shows up in production.

`spec-trace` is the external judge. It doesn't write tests and it doesn't
write code. It answers three questions, in a way a machine can verify:

1. Does every requirement in the spec have a test that covers it?
2. Does every test point back to some requirement?
3. Do those tests actually prove anything, or are they decorative?

## What this is not

- **Not an app scaffolder.** `init` only wires spec-trace itself into a
  project you already have — `specs/`, a vitest config, a couple of npm
  scripts. It doesn't generate application code, and there's nothing that
  dumps a project template.
- **Not a test framework.** It runs on top of Vitest; it doesn't replace it.
- **Not an agent, and it doesn't call an LLM.** No AI SDK dependency.
  Deterministic: same input, same output, every time.
- **Not a competitor to GitHub Spec Kit.** It complements it. A project
  using `specify` should be able to plug in `spec-trace` without changing
  anything about its spec layout.
- **Doesn't impose a proprietary spec format.** It only requires that
  requirements have a stable id.

## Quick start

```sh
npm install --save-dev @leviutima/spec-trace vitest
npx spec-trace init
```

`typescript` is an optional peerDependency, used only for the `weak-test`
AST analysis. Most projects already have it; if yours doesn't,
`verify`/`report` still work — they just skip `weak-test` with a one-line
warning telling you how to enable it.

`init` detects whether your project is ESM or CommonJS, whether Vitest is
already configured, and what language to write in, then scaffolds exactly
what's missing: `specs/AGENTS.md` (the agent manual), a vitest config with
the reporter wired in if you don't already have one, `.spec-trace/`, the
`verify`/`report`/`check` npm scripts, and a `.gitignore` entry. It never
overwrites anything you already have — see [`spec-trace init`](#spec-trace-init)
below for the flags and exact guarantees.

It does not run `npm install` for you or write application code — the two
lines above are the whole setup.

## The flow

1. **Write the requirement first.** A new `REQ-<n>` heading goes into
   `specs/*.md` before any code — that's the first approval gate: does the
   requirement say what you actually mean?
2. **Write a test that declares the id**, in its `describe` or `it` name,
   then implement the behavior. That's the second gate: `spec-trace verify`
   checks that the id you just wrote is real, and that the test isn't
   decorative.
3. Run the suite, then `npx spec-trace report` and `npx spec-trace verify`
   until it's clean.

This is spelled out in full, with the exact "definition of done" block to
copy into your own `AGENTS.md`/`CLAUDE.md`, in
[`specs/AGENTS.md`](./specs/AGENTS.md) once `init` has generated it for your
project. (This repository's own equivalent — the rules spec-trace's own
development follows — lives at [`AGENTS.md`](./AGENTS.md) at the repo root;
`specs/AGENTS.md` is the name `init` gives that manual *inside* a project
that adopts spec-trace.)

## End-to-end example

Start with a requirement:

```md
<!-- specs/cart.md -->

## REQ-014 — Cart rejects non-positive quantity

**When** the user submits a quantity less than or equal to zero,
**the system shall** reject the item and return the error code `INVALID_QUANTITY`.
```

An agent implements it, and writes a test that references the requirement
by id in its `describe`:

```ts
// test/cart.test.ts
import { describe, expect, it } from 'vitest'
import { addItem } from '../src/cart'

describe('REQ-014: cart quantity validation', () => {
  it('rejects a non-positive quantity', () => {
    const result = addItem({ quantity: 0 })
    expect(result).toBeDefined()
  })
})
```

The implementation doesn't actually reject anything, and the test doesn't
actually check for the `INVALID_QUANTITY` error — it just checks that
*something* came back. Vitest is green:

```
✓ test/cart.test.ts (1 test)
```

`weak-test` is `warn` by default since it's a heuristic (more on that
below) — `--fail-on warn` is what makes it actually gate:

```sh
$ npx spec-trace verify --fail-on warn
[warn] weak-test Test "REQ-014: cart quantity validation > rejects a non-positive quantity" looks weak: non-discriminant-assertions (test/cart.test.ts:5)

0 errors, 1 warning
1 requirements | 1 covered (100%) | 0 uncovered | 1 weak
$ echo $?
1
```

Green tests, wrong code, and `spec-trace` is the only thing in the loop
that noticed — and with `--fail-on warn`, the only thing that actually
stopped it from merging.

## How it works

### Specs

Any markdown heading (`##` through `######`) that starts with an id
matching `REQ-\d+` is a requirement:

```md
## REQ-014 — Cart rejects non-positive quantity

**When** the user submits a quantity less than or equal to zero,
**the system shall** reject the item and return the error code `INVALID_QUANTITY`.
```

- The id is the first token after the heading markers.
- Everything after the id on that line is the title.
- The body is everything up to the next heading of the same or higher
  level — nested subheadings stay part of the body.
- A duplicate id anywhere in the spec directory is a fatal error listing
  every location.
- Mark a requirement as out of scope with `<!-- spec-trace:ignore -->`
  anywhere in its body.

### Tests declare coverage by name

A test declares which requirement it proves by putting the id in its own
name or in any ancestor `describe`:

```ts
describe('REQ-014: cart quantity validation', () => {
  it('rejects a non-positive quantity', () => { /* ... */ })
})

// or directly on the it
it('[REQ-014] rejects a negative quantity', () => { /* ... */ })
```

Names, not runner metadata, on purpose: it's greppable, survives
refactors, doesn't depend on any particular runner's API, and works with
whatever test runner shows up next. A test can cover more than one
requirement, and ids declared on a `describe` are inherited by every test
inside it.

### Collection

A custom Vitest reporter (`@leviutima/spec-trace/reporter`) writes
`.spec-trace/results.json` while your suite runs, recording real state —
`passed`, `failed`, `skipped`, or `todo`. **A skipped test does not count
as coverage.** A requirement covered only by `it.skip` is uncovered. **A
suite that produced zero results is a violation, not a clean pass** — see
`empty-suite` below, which is exactly what catches `vitest run
--passWithNoTests` slipping a green build through with nothing proven.

## CLI

### `spec-trace init`

Scaffolds spec-trace into the current project — see [Quick start](#quick-start).
Detects your module type (`"type": "module"` in `package.json`) and
whether Vitest is already configured, and generates only what's missing.

Flags: `--lang <en|pt-BR>` (defaults to your environment's locale, then
English), `--dry-run` (print the plan, write nothing), `--force`
(overwrite files `init` previously generated — never any other
`specs/*.md`), `--verbose`.

Guarantees: **idempotent** — running it twice makes no changes the second
time. **Non-destructive** — it only ever creates or appends, never deletes,
and `--force` is scoped to the exact set of files `init` itself generates.
If a vitest config already exists, it's never rewritten; if it's missing
the reporter, `init` prints the snippet to add instead of editing your
config for you.

### `spec-trace verify`

The main command. Fast, meant to run on every commit. Compares `specs/`
against `.spec-trace/results.json` and applies these rules:

| Rule | What it catches | Default |
| --- | --- | --- |
| `uncovered-requirement` | A requirement with no test pointing to it | error |
| `orphan-test` | A test with no `REQ-` anywhere in its name or ancestors | warn |
| `unknown-requirement` | A test points to an id that doesn't exist in the spec | error |
| `skipped-coverage` | A requirement covered only by skipped/todo tests | error |
| `failing-coverage` | A requirement whose covering test(s) are failing | error |
| `duplicate-requirement` | The same id declared more than once | error |
| `weak-test` | A test that matches one of the heuristics below | warn |
| `stale-results` | `results.json` doesn't match the test files actually on disk | error |
| `empty-suite` | The suite produced zero test results — proves nothing | error |

Flags: `--json`, `--markdown <path>`, `--reporter <human\|json>`,
`--config <path>`, `--fail-on <error\|warn>`, `--baseline`, `--verbose`.

Every run — human or `--json` — ends with a quantitative summary:

```
27 requirements | 0 covered (0%) | 27 uncovered | 0 weak
```

`--json` returns `{ "requirements": { ...those same counts }, "violations": [...] }`.

Exits 1 if any violation is at or above the `--fail-on` level (default:
`error`).

### `spec-trace report`

Writes an agent-readable `.spec-trace/report.md` — a requirements table
plus one section per violation with the file, the line, and a one-sentence
actionable instruction, written for an agent to act on next turn. Never
sets a failing exit code; it's not a CI gate.

### `spec-trace mutate`

**Roadmap, not implemented yet.** See [Roadmap](#roadmap).

## weak-test: what it catches, and why it's a heuristic

Static AST analysis of the test file, nothing is executed. A test is
flagged if:

1. It has zero `expect` calls.
2. **Every** assertion is non-discriminant: `toBeDefined`, `toBeTruthy`,
   `toBeFalsy`, `not.toThrow`, or an isolated `toBeInstanceOf`.
3. The module under test is mocked — the target of a `vi.mock()` call
   matches a module the test imports and exercises.
4. An assertion compares identical literal values on both sides
   (`expect(2).toBe(2)`).

**This is a heuristic, and it will have false positives.** That's why it
defaults to `warn`, not `error`, and can be silenced line by line:

```ts
// spec-trace-disable-next-line weak-test
it('a test spec-trace misjudges', () => { /* ... */ })
```

`weak-test` is a smell detector, not proof. Real proof — knowing that an
assertion would actually fail if the implementation were wrong — is what
mutation testing gives you, and that's the roadmap item below.

## Configuration

`spec-trace.config.ts` is optional; every default below works with no
config file at all.

```ts
import { defineConfig } from '@leviutima/spec-trace'

export default defineConfig({
  specDir: 'specs',
  resultsFile: '.spec-trace/results.json',
  idPattern: 'REQ-\\d+',
  testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
  testIgnore: [],
  rules: {
    'orphan-test': 'warn',
    'weak-test': 'warn',
  },
  ignore: ['REQ-001'],
})
```

`testIgnore` is a plain path-prefix exclusion (not a glob) for directories
that legitimately contain `*.test.ts`-named files never meant to run
directly — this project's own `test/fixtures/` is exactly that case.

## Setup in a CommonJS project

If your `package.json` has no `"type": "module"` field, a plain
`vitest.config.ts` gets loaded via `require()` — which breaks against
`@leviutima/spec-trace/reporter`, an ESM-only import, with an unhelpful
"This package is ESM only" error. The fix is a `.mts` extension instead of
`.ts`: Vitest's config loader always evaluates a `.mts` file as ESM
regardless of the package's own `"type"` field.

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'

export default defineConfig({
  test: {
    reporters: ['default', new SpecTraceReporter()],
  },
})
```

`spec-trace init` does this automatically — it's the whole reason `init`
inspects `package.json`'s `"type"` field before deciding which extension to
generate. If you're wiring the reporter into an existing CommonJS config by
hand instead, renaming it to `.mts` is the fix.

## Adopting spec-trace in an existing project

Dropping `verify` into a project with months of untested history means the
first run reports every uncovered requirement at once — which is accurate,
but not something you can fix in one sitting, and "just turn every rule to
warn" is how a coverage tool quietly stops mattering.

```sh
npx spec-trace verify --baseline
```

This records the current violations in `.spec-trace/baseline.json` and
always exits 0 — establishing a baseline isn't itself a failure. From then
on, a plain `spec-trace verify` only reports and fails on violations that
are **new** since the baseline was recorded; everything already in the
baseline is filtered out of both the output and the exit code. Existing
debt stays visible in `.spec-trace/report.md` (which never gates) without
blocking unrelated work, and shrinks only when someone deliberately fixes
something and re-runs `--baseline` to move the line forward.

## Agent integration

spec-trace is passive by default: something has to remember to call it.
The point lands when it's in the loop the agent already follows on every
task. `spec-trace init` writes this for you at `specs/AGENTS.md`; the block
it generates is:

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

If `AGENTS.md` or `CLAUDE.md` already exists at your project's root,
`init` appends a one-line pointer to `specs/AGENTS.md` into it; if neither
exists, it just suggests adding one.

## Roadmap

- **Mutation testing (`spec-trace mutate`).** Phase 2. Instead of guessing
  whether a test is weak from its shape, mutate the implementation and
  check whether the test actually fails. This is where "does this test
  prove anything" gets an answer instead of a heuristic.

## Development

This repository dogfoods itself: [`specs/`](./specs) contains spec-trace's
own requirements, every test in [`test/`](./test) is tagged with the
requirement id(s) it proves, and CI runs `spec-trace verify` against this
repo — on Linux and Windows — on every push.

```sh
npm install
npm run typecheck
npm run lint
npm test        # builds first, then runs the suite (produces .spec-trace/results.json)
npm run verify  # runs the built CLI against this repo's own specs
```

## License

MIT — see [LICENSE](./LICENSE).
