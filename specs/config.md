# Configuration

Requirements for `defineConfig` and the config loader that resolves
`spec-trace.config.ts`/`.js`.

## REQ-023 — defineConfig is an identity passthrough

**When** a user calls `defineConfig(config)`, **the system shall** return
that same config object unchanged — its only purpose is to give the user
type inference and autocomplete in their config file.

## REQ-024 — Defaults apply with no config file present

**When** no `spec-trace.config.ts`/`.js` file exists in the working
directory and no explicit `--config` path is given, **the system shall**
use the built-in defaults (`specDir: 'specs'`,
`resultsFile: '.spec-trace/results.json'`, `idPattern: 'REQ-\\d+'`,
`testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx']`,
empty `testIgnore`, empty `rules`, empty `ignore`).

## REQ-025 — A discovered config file is merged with the defaults

**When** a `spec-trace.config.ts` or `spec-trace.config.js` file exists in
the working directory, **the system shall** load it and merge its values
on top of the defaults, including a deep merge of the `rules` object.

## REQ-026 — An explicit --config path is honored regardless of file name

**When** the caller supplies an explicit config file path, **the system
shall** load that file instead of searching for the default file names,
even if it does not follow the `spec-trace.config.*` naming convention.

## REQ-039 — An invalid idPattern is rejected at config-load time

**When** the configured `idPattern` is not a valid regular expression,
**the system shall** raise a distinct, catchable error naming the
invalid pattern and the underlying reason, instead of letting an
unrelated `SyntaxError` surface later from deep inside the parser or
rules engine the first time the pattern is actually compiled.

## REQ-041 — A .ts config without typescript installed fails clearly

**When** the resolved config file ends in `.ts` and `typescript` (an
optional peerDependency) cannot be loaded, **the system shall** raise a
distinct, catchable error naming the config file and telling the caller
to either install typescript or use a `.js`/`.mjs` config file instead,
rather than letting the underlying import failure surface as an opaque
module-resolution error.
