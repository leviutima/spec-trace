# Output formatting

Requirements for the pure formatters that turn violations into human,
JSON, and markdown output.

## REQ-027 — Human output shows rule, location, message, and counts

**When** violations are formatted for a human reader, **the system
shall** show each violation's severity, rule id, message, and location
(file and line, when known), followed by a summary line with the total
count of errors and warnings.

## REQ-028 — Markdown report lists requirement status and one actionable section per violation

**When** a markdown report is generated, **the system shall** include a
table listing every requirement with its coverage status (Covered,
Uncovered, Skipped only, Failing, or Ignored), followed by one section
per violation containing its severity, file and line, message, and a
one-sentence actionable instruction for what to do about it.
