# Spec parser

Requirements for `parseSpecs`, which extracts structured requirements from
markdown files in a spec directory.

## REQ-001 — Extracts id, title, body, file, and line for each requirement

**When** a markdown heading (level 2 to 6) starts with an id matching
`REQ-\d+`, **the system shall** record that id, the remaining heading text
as the title, the following content as the body, the source file path, and
the 1-based line number of the heading.

## REQ-002 — Nested headings stay part of the body

**When** a requirement's body contains a heading of a deeper level (more
`#` characters), **the system shall** keep that nested heading and its
content as part of the requirement's body, and only end the body at the
next heading whose level is the same as or higher than the requirement's
own heading.

## REQ-003 — Duplicate requirement ids are a fatal error

**When** the same requirement id appears more than once across any spec
files, **the system shall** raise a fatal error that lists every file and
line where the id was declared, instead of silently picking one.

## REQ-004 — An empty spec file yields no requirements

**When** a markdown file in the spec directory is empty or contains no
matching headings, **the system shall** return no requirements for that
file without raising an error.

## REQ-005 — Malformed ids are not parsed as requirements

**When** a heading's id does not match `REQ-\d+` exactly — for example
missing digits, or digits immediately followed by a letter — **the system
shall** skip that heading rather than treating it as a requirement.

## REQ-006 — The ignore marker flags a requirement as out of scope

**When** a requirement's body contains the ignore marker (an HTML comment
whose content is exactly `spec-trace` + `:ignore`), **the system shall**
still parse the requirement but flag it as ignored, so downstream rules
can exclude it from coverage checks.

Note for spec authors: this paragraph deliberately avoids spelling out
the marker's literal HTML-comment form, since doing so here would flag
this very requirement as ignored — a real bug this project's own
dogfooding run caught. See `test/fixtures/parser/ignore/requirements.md`
for the marker used verbatim.
