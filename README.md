# spec-trace

[![npm version](https://img.shields.io/npm/v/%40leviutima%2Fspec-trace.svg)](https://www.npmjs.com/package/@leviutima/spec-trace)
[![license](https://img.shields.io/npm/l/%40leviutima%2Fspec-trace.svg)](./LICENSE)

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

- **Not a scaffolder.** It doesn't generate a project or an app folder
  structure, and there's no `init` that dumps an app template.
- **Not a test framework.** It runs on top of Vitest; it doesn't replace it.
- **Not an agent, and it doesn't call an LLM.** No AI SDK dependency.
  Deterministic: same input, same output, every time.
- **Not a competitor to GitHub Spec Kit.** It complements it. A project
  using `specify` should be able to plug in `spec-trace` without changing
  anything about its spec layout.
- **Doesn't impose a proprietary spec format.** It only requires that
  requirements have a stable id.

## Install

```sh
npm install --save-dev @leviutima/spec-trace vitest
```

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

Wire up the reporter in `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'

export default defineConfig({
  test: {
    reporters: ['default', new SpecTraceReporter()],
  },
})
```

Run your suite once to produce `.spec-trace/results.json`, then ask the
external judge:

```sh
$ npx spec-trace verify
[warn] weak-test Test "REQ-014: cart quantity validation > rejects a non-positive quantity" looks weak: non-discriminant-assertions (test/cart.test.ts:5)

0 errors, 1 warning
```

Green tests, wrong code, and `spec-trace` is the only thing in the loop
that noticed.

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
as coverage.** A requirement covered only by `it.skip` is uncovered.

## CLI

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

Flags: `--json`, `--markdown <path>`, `--reporter <human\|json>`,
`--config <path>`, `--fail-on <error\|warn>`.

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
  rules: {
    'orphan-test': 'warn',
    'weak-test': 'warn',
  },
  ignore: ['REQ-001'],
})
```

## Roadmap

- **Mutation testing (`spec-trace mutate`).** Phase 2. Instead of guessing
  whether a test is weak from its shape, mutate the implementation and
  check whether the test actually fails. This is where "does this test
  prove anything" gets an answer instead of a heuristic.

## Development

This repository dogfoods itself: [`specs/`](./specs) contains spec-trace's
own requirements, every test in [`test/`](./test) is tagged with the
requirement id(s) it proves, and CI runs `spec-trace verify` against this
repo on every push.

```sh
npm install
npm run typecheck
npm run lint
npm test        # builds first, then runs the suite (produces .spec-trace/results.json)
npm run verify  # runs the built CLI against this repo's own specs
```

## License

MIT — see [LICENSE](./LICENSE).
