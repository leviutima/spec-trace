import { describe, expect, it } from 'vitest'
import { checkRules } from '../src/rules-engine.js'
import type { Requirement } from '../src/spec-parser.js'
import type { TestResult } from '../src/reporter.js'

function req(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    title: `Title for ${overrides.id}`,
    body: '',
    file: 'specs/example.md',
    line: 1,
    ignored: false,
    ...overrides,
  }
}

function testResult(overrides: Partial<TestResult> & { name: string }): TestResult {
  return {
    file: 'test/example.test.ts',
    status: 'passed',
    ...overrides,
  }
}

describe('checkRules', () => {
  it('[REQ-009] reports no violations when every requirement has a passing test', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [testResult({ name: 'REQ-001: does the thing', status: 'passed' })],
    )

    expect(violations).toEqual([])
  })

  it('[REQ-009] flags uncovered-requirement when no test references the id', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [])

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'uncovered-requirement', severity: 'error', requirementId: 'REQ-001' }),
    ])
  })

  it('[REQ-010] flags orphan-test when a test references no requirement id', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [
        testResult({ name: 'REQ-001: covered', status: 'passed' }),
        testResult({ name: 'a test with no id in its name', status: 'passed' }),
      ],
    )

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'orphan-test', severity: 'warn' }),
    ])
  })

  it('[REQ-011] flags unknown-requirement when a test references an id absent from the spec', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [
        testResult({ name: 'REQ-001: covered', status: 'passed' }),
        testResult({ name: 'REQ-999: references a requirement that does not exist', status: 'passed' }),
      ],
    )

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'unknown-requirement', severity: 'error', requirementId: 'REQ-999' }),
    ])
  })

  it('[REQ-012] flags skipped-coverage when a requirement is only covered by skipped or todo tests', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [
        testResult({ name: 'REQ-001: skipped one', status: 'skipped' }),
        testResult({ name: 'REQ-001: todo one', status: 'todo' }),
      ],
    )

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'skipped-coverage', severity: 'error', requirementId: 'REQ-001' }),
    ])
  })

  it('[REQ-013] flags failing-coverage when at least one covering test fails', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [
        testResult({ name: 'REQ-001: passes', status: 'passed' }),
        testResult({ name: 'REQ-001: fails', status: 'failed' }),
      ],
    )

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'failing-coverage', severity: 'error', requirementId: 'REQ-001' }),
    ])
  })

  it('[REQ-014] flags duplicate-requirement when the same id appears more than once', () => {
    const violations = checkRules(
      [
        req({ id: 'REQ-001', file: 'specs/a.md', line: 3 }),
        req({ id: 'REQ-001', file: 'specs/b.md', line: 7 }),
      ],
      [testResult({ name: 'REQ-001: covered', status: 'passed' })],
    )

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'duplicate-requirement', severity: 'error', requirementId: 'REQ-001' }),
    ])
  })

  it('[REQ-015] does not flag a requirement marked ignored via the spec-trace:ignore marker', () => {
    const violations = checkRules([req({ id: 'REQ-001', ignored: true })], [])

    expect(violations).toEqual([])
  })

  it('[REQ-015] does not flag a requirement listed in the ignore option', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [], { ignore: ['REQ-001'] })

    expect(violations).toEqual([])
  })

  it('[REQ-016] silences a rule set to off in the config', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [], {
      rules: { 'uncovered-requirement': 'off' },
    })

    expect(violations).toEqual([])
  })

  it('[REQ-016] honors a custom severity override', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [], {
      rules: { 'uncovered-requirement': 'warn' },
    })

    expect(violations).toEqual([
      expect.objectContaining({ rule: 'uncovered-requirement', severity: 'warn' }),
    ])
  })

  it('[REQ-016] uses the documented default severities when no config is given', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [testResult({ name: 'no id here', status: 'passed' })],
    )

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'uncovered-requirement', severity: 'error' }),
        expect.objectContaining({ rule: 'orphan-test', severity: 'warn' }),
      ]),
    )
  })

  it('[REQ-017] lets a requirement covered by a mix of a passing and a skipped test count as covered', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' })],
      [
        testResult({ name: 'REQ-001: passes', status: 'passed' }),
        testResult({ name: 'REQ-001: also skipped', status: 'skipped' }),
      ],
    )

    expect(violations).toEqual([])
  })

  it('[REQ-017] lets a single test cover more than one requirement', () => {
    const violations = checkRules(
      [req({ id: 'REQ-001' }), req({ id: 'REQ-002' })],
      [testResult({ name: 'REQ-001 and REQ-002: covers both', status: 'passed' })],
    )

    expect(violations).toEqual([])
  })
})
