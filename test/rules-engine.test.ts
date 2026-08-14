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
    const violations = checkRules([req({ id: 'REQ-001' })], [], {
      rules: { 'empty-suite': 'off' },
    })

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
    const violations = checkRules([req({ id: 'REQ-001', ignored: true })], [], {
      rules: { 'empty-suite': 'off' },
    })

    expect(violations).toEqual([])
  })

  it('[REQ-015] does not flag a requirement listed in the ignore option', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [], {
      ignore: ['REQ-001'],
      rules: { 'empty-suite': 'off' },
    })

    expect(violations).toEqual([])
  })

  it('[REQ-016] silences a rule set to off in the config', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [], {
      rules: { 'uncovered-requirement': 'off', 'empty-suite': 'off' },
    })

    expect(violations).toEqual([])
  })

  it('[REQ-016] honors a custom severity override', () => {
    const violations = checkRules([req({ id: 'REQ-001' })], [], {
      rules: { 'uncovered-requirement': 'warn', 'empty-suite': 'off' },
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

  describe('[REQ-034] stale-results', () => {
    it('skips the rule entirely when no file state is supplied', () => {
      const violations = checkRules(
        [req({ id: 'REQ-001' })],
        [testResult({ name: 'REQ-001: covered', status: 'passed' })],
      )

      expect(violations.some((v) => v.rule === 'stale-results')).toBe(false)
    })

    it('flags "deleted" when a recorded file no longer exists on disk', () => {
      const violations = checkRules(
        [req({ id: 'REQ-001' })],
        [testResult({ name: 'REQ-001: covered', status: 'passed' })],
        {
          fileState: {
            recorded: [{ path: 'test/example.test.ts', hash: 'abc' }],
            onDisk: [],
          },
        },
      )

      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'stale-results',
          severity: 'error',
          file: 'test/example.test.ts',
        }),
      )
    })

    it('flags "modified" when a recorded file\'s hash no longer matches disk', () => {
      const violations = checkRules(
        [req({ id: 'REQ-001' })],
        [testResult({ name: 'REQ-001: covered', status: 'passed' })],
        {
          fileState: {
            recorded: [{ path: 'test/example.test.ts', hash: 'old-hash' }],
            onDisk: [{ path: 'test/example.test.ts', hash: 'new-hash' }],
          },
        },
      )

      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'stale-results',
          severity: 'error',
          file: 'test/example.test.ts',
        }),
      )
    })

    it('flags "never-ran" when a file on disk matches testMatch but was never recorded', () => {
      const violations = checkRules(
        [req({ id: 'REQ-001' })],
        [testResult({ name: 'REQ-001: covered', status: 'passed' })],
        {
          fileState: {
            recorded: [],
            onDisk: [{ path: 'test/never-ran.test.ts', hash: 'x' }],
          },
        },
      )

      expect(violations).toContainEqual(
        expect.objectContaining({
          rule: 'stale-results',
          severity: 'error',
          file: 'test/never-ran.test.ts',
        }),
      )
    })

    it('reports nothing when recorded and on-disk file state match exactly', () => {
      const violations = checkRules(
        [req({ id: 'REQ-001' })],
        [testResult({ name: 'REQ-001: covered', status: 'passed' })],
        {
          fileState: {
            recorded: [{ path: 'test/example.test.ts', hash: 'same' }],
            onDisk: [{ path: 'test/example.test.ts', hash: 'same' }],
          },
        },
      )

      expect(violations.some((v) => v.rule === 'stale-results')).toBe(false)
    })

    it('respects a severity override for stale-results', () => {
      const violations = checkRules([req({ id: 'REQ-001' })], [], {
        rules: { 'stale-results': 'warn' },
        fileState: { recorded: [], onDisk: [{ path: 'test/x.test.ts', hash: 'x' }] },
      })

      expect(violations).toContainEqual(expect.objectContaining({ rule: 'stale-results', severity: 'warn' }))
    })
  })

  describe('[REQ-045] empty-suite', () => {
    it('flags empty-suite when the test results array is empty, even with requirements present', () => {
      const violations = checkRules([req({ id: 'REQ-001' })], [], {
        rules: { 'uncovered-requirement': 'off' },
      })

      expect(violations).toEqual([expect.objectContaining({ rule: 'empty-suite', severity: 'error' })])
    })

    it('flags empty-suite even when there are no requirements at all', () => {
      const violations = checkRules([], [])

      expect(violations).toEqual([expect.objectContaining({ rule: 'empty-suite', severity: 'error' })])
    })

    it('does not flag empty-suite when at least one test result exists', () => {
      const violations = checkRules(
        [req({ id: 'REQ-001' })],
        [testResult({ name: 'REQ-001: covered', status: 'passed' })],
      )

      expect(violations.some((v) => v.rule === 'empty-suite')).toBe(false)
    })

    it('is silenced by the off toggle', () => {
      const violations = checkRules([req({ id: 'REQ-001' })], [], {
        rules: { 'uncovered-requirement': 'off', 'empty-suite': 'off' },
      })

      expect(violations).toEqual([])
    })
  })

  describe('[REQ-038] idPattern', () => {
    it('matches a custom id shape when idPattern is configured', () => {
      const violations = checkRules(
        [req({ id: 'STORY-42' })],
        [testResult({ name: 'STORY-42: covered', status: 'passed' })],
        { idPattern: 'STORY-\\d+' },
      )

      expect(violations).toEqual([])
    })

    it('does not treat a default-shaped id as a match when idPattern is set to something else', () => {
      const violations = checkRules(
        [req({ id: 'STORY-42' })],
        [testResult({ name: 'REQ-999: wrong shape entirely', status: 'passed' })],
        { idPattern: 'STORY-\\d+' },
      )

      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'uncovered-requirement', requirementId: 'STORY-42' }),
      )
      expect(violations).toContainEqual(expect.objectContaining({ rule: 'orphan-test' }))
    })
  })
})
