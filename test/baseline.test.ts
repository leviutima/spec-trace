import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { filterBaselined, fingerprint, readBaseline, writeBaseline } from '../src/baseline.js'
import type { Violation } from '../src/rules-engine.js'

const uncovered: Violation = {
  rule: 'uncovered-requirement',
  severity: 'error',
  message: 'Requirement "REQ-001" has no test covering it',
  requirementId: 'REQ-001',
  file: 'specs/example.md',
  line: 3,
}

describe('[REQ-047][REQ-048] fingerprint', () => {
  it('is stable for the same violation content', () => {
    expect(fingerprint(uncovered)).toBe(fingerprint({ ...uncovered }))
  })

  it('ignores the line number', () => {
    expect(fingerprint(uncovered)).toBe(fingerprint({ ...uncovered, line: 99 }))
  })

  it('differs when the rule, requirement, file, or message differs', () => {
    const base = fingerprint(uncovered)
    expect(fingerprint({ ...uncovered, rule: 'orphan-test' })).not.toBe(base)
    expect(fingerprint({ ...uncovered, requirementId: 'REQ-002' })).not.toBe(base)
    expect(fingerprint({ ...uncovered, file: 'specs/other.md' })).not.toBe(base)
    expect(fingerprint({ ...uncovered, message: 'a different message' })).not.toBe(base)
  })
})

describe('[REQ-048] filterBaselined', () => {
  it('returns every violation unchanged when there is no baseline', () => {
    expect(filterBaselined([uncovered], undefined)).toEqual([uncovered])
  })

  it('filters out a violation whose fingerprint is in the baseline', () => {
    const baseline = { generatedAt: '2026-01-01T00:00:00.000Z', violations: [fingerprint(uncovered)] }
    expect(filterBaselined([uncovered], baseline)).toEqual([])
  })

  it('keeps a violation whose fingerprint is not in the baseline', () => {
    const baseline = { generatedAt: '2026-01-01T00:00:00.000Z', violations: ['some-other-fingerprint'] }
    expect(filterBaselined([uncovered], baseline)).toEqual([uncovered])
  })
})

describe('[REQ-047][REQ-049] writeBaseline / readBaseline', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'spec-trace-baseline-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('[REQ-049] returns undefined when no baseline file exists', () => {
    expect(readBaseline(cwd)).toBeUndefined()
  })

  it('[REQ-047] writes a baseline file whose fingerprints round-trip through readBaseline', () => {
    writeBaseline(cwd, [uncovered])

    const baseline = readBaseline(cwd)
    expect(baseline?.violations).toEqual([fingerprint(uncovered)])
  })

  it('[REQ-047] writes valid JSON with a generatedAt timestamp and fingerprint list', () => {
    writeBaseline(cwd, [uncovered])

    const raw = readFileSync(join(cwd, '.spec-trace', 'baseline.json'), 'utf8')
    const parsed = JSON.parse(raw) as { generatedAt: string; violations: string[] }

    expect(typeof parsed.generatedAt).toBe('string')
    expect(parsed.violations).toEqual([fingerprint(uncovered)])
  })
})
