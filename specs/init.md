# init command

Requirements for `spec-trace init`, the one-command scaffold that adopts
spec-trace into a project. Detection and planning are pure (`detect`,
`buildPlan`); only `applyPlan` touches the filesystem, and only when
`--dry-run` is not given.

## REQ-050 — init requires an existing package.json

**When** `spec-trace init` runs in a directory with no `package.json`,
**the system shall** raise a distinct, catchable error telling the caller
to run `npm init` (or equivalent) first, instead of scaffolding files into
a directory that isn't an npm project.

## REQ-051 — The generated vitest config's extension depends on module type

**When** no vitest config file exists yet and the project's `package.json`
has no `"type": "module"` field (a CommonJS project), **the system shall**
generate `vitest.config.mts`, not `vitest.config.ts` — a `.ts` file in a
CommonJS package is loaded via `require()`, which breaks against the
ESM-only `@leviutima/spec-trace/reporter` import. **When** the project's
`package.json` has `"type": "module"`, **the system shall** generate
`vitest.config.ts` instead. Both generated configs wire up
`SpecTraceReporter` in the `reporters` array.

## REQ-052 — init generates the minimum scaffold verify needs to run

**When** `spec-trace init` runs, **the system shall** ensure the following
exist: `specs/AGENTS.md` (the agent manual, in the resolved language),
`specs/README.md` (one line pointing to `AGENTS.md`), `test/.gitkeep`, and
`.spec-trace/results.json` containing `{"tests":[]}` — the exact shape a
first `verify` needs to run without a `ResultsFileNotFoundError`, and the
exact shape that trips the `empty-suite` rule on purpose, so the very first
`verify` is a visible, actionable violation instead of a crash.

## REQ-053 — Re-running init is non-destructive

**When** `spec-trace init` runs and a file it would generate already
exists, **the system shall** leave that file untouched and report it as
skipped, rather than overwriting or duplicating its content. Running
`init` twice in a row **shall** produce no filesystem changes on the
second run.

## REQ-054 — --force overwrites only init's own generated files

**When** `--force` is passed, **the system shall** overwrite
`specs/AGENTS.md`, `specs/README.md`, the generated vitest config, and
`.spec-trace/results.json` if they exist — and **shall not** overwrite,
touch, or delete any other file, including any other `specs/*.md` file,
regardless of its name.

## REQ-055 — --dry-run performs no filesystem writes

**When** `--dry-run` is passed, **the system shall** compute and print the
full plan — every file that would be created, appended to, or left
alone — without creating, modifying, or deleting anything on disk.

## REQ-056 — Missing npm scripts are added without clobbering existing ones

**When** `spec-trace init` runs, **the system shall** add `verify`,
`report`, and `check` entries to `package.json`'s `scripts` for whichever
of the three are not already present, and **shall not** modify or remove
any existing script, including an existing `verify`/`report`/`check` the
project already defines for its own purposes. The generated `check` script
**shall** run Vitest with `--passWithNoTests` before `spec-trace verify` —
without it, a project with no test files yet would make Vitest itself
exit 1 before spec-trace ever runs, instead of letting the `empty-suite`
rule report the same problem as an actionable violation.

## REQ-057 — .gitignore is appended, not replaced

**When** `spec-trace init` runs, **the system shall** ensure `.gitignore`
contains a `.spec-trace/` entry — creating `.gitignore` if it does not
exist, appending the entry if the file exists but lacks it, and leaving
the file alone if the entry is already present.

## REQ-058 — Language resolves from an explicit flag, then the environment, then English

**When** `--lang` is given, **the system shall** use it. **When** it is
not given, **the system shall** derive the language from the environment's
locale (via `Intl.DateTimeFormat().resolvedOptions().locale`, which works
on Windows unlike `$LANG`) — any locale beginning with `pt` resolves to
`pt-BR`, everything else to `en`, which is also the default when no locale
can be determined at all.

## REQ-059 — An existing root AGENTS.md or CLAUDE.md gets a pointer

**When** `AGENTS.md` or `CLAUDE.md` exists at the project root and does not
already reference `specs/AGENTS.md`, **the system shall** append a one-line
pointer to it. **When** the file already references `specs/AGENTS.md`,
**the system shall** leave it alone. **When** neither file exists,
**the system shall not** create one — it only suggests doing so in its
output.

## REQ-060 — An existing vitest config is never rewritten

**When** a vitest config file already exists, **the system shall not**
generate or overwrite it. **When** that config does not yet reference
`@leviutima/spec-trace/reporter`, **the system shall** print the exact
snippet to add instead of editing the file. **When** it already does,
**the system shall** report that nothing needs to change.
