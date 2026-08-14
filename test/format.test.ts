import { describe, expect, it } from 'vitest'
import { computeSummary, formatHuman, formatJson, formatMarkdownReport } from '../src/format.js'
import type { Requirement } from '../src/spec-parser.js'
import type { Violation } from '../src/rules-engine.js'

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

describe('[REQ-027] formatHuman', () => {
  it('reports a clean summary when there are no violations', () => {
    const output = formatHuman([], [])
    expect(output).toContain('0 errors')
    expect(output).toContain('0 warnings')
  })

  it('lists each violation with its rule, file, and message', () => {
    const violations: Violation[] = [
      {
        rule: 'uncovered-requirement',
        severity: 'error',
        message: 'Requirement "REQ-001" has no test covering it',
        requirementId: 'REQ-001',
        file: 'specs/example.md',
        line: 3,
      },
    ]

    const output = formatHuman([req({ id: 'REQ-001' })], violations)

    expect(output).toContain('REQ-001')
    expect(output).toContain('uncovered-requirement')
    expect(output).toContain('specs/example.md:3')
    expect(output).toContain('1 error')
    expect(output).toContain('0 warnings')
  })

  it('counts errors and warnings separately', () => {
    const violations: Violation[] = [
      { rule: 'uncovered-requirement', severity: 'error', message: 'a' },
      { rule: 'orphan-test', severity: 'warn', message: 'b' },
      { rule: 'orphan-test', severity: 'warn', message: 'c' },
    ]

    const output = formatHuman([], violations)

    expect(output).toContain('1 error')
    expect(output).toContain('2 warnings')
  })
})

describe('[REQ-046] computeSummary', () => {
  it('counts covered, uncovered, and weak, with a rounded percentage', () => {
    const requirements = [
      req({ id: 'REQ-001' }),
      req({ id: 'REQ-002' }),
      req({ id: 'REQ-003', ignored: true }),
    ]
    const violations: Violation[] = [
      {
        rule: 'uncovered-requirement',
        severity: 'error',
        message: 'x',
        requirementId: 'REQ-002',
      },
      { rule: 'weak-test', severity: 'warn', message: 'weak', file: 'test/a.test.ts' },
    ]

    const summary = computeSummary(requirements, violations)

    expect(summary).toEqual({
      total: 3,
      covered: 1,
      uncovered: 1,
      ignored: 1,
      percentCovered: 33,
      weak: 1,
    })
  })

  it('reports zero percent covered for zero requirements without dividing by zero', () => {
    expect(computeSummary([], [])).toEqual({
      total: 0,
      covered: 0,
      uncovered: 0,
      ignored: 0,
      percentCovered: 0,
      weak: 0,
    })
  })

  it('formatHuman appends the summary line', () => {
    const output = formatHuman([req({ id: 'REQ-001' })], [])
    expect(output).toContain('1 requirements | 1 covered (100%) | 0 uncovered | 0 weak')
  })

  it('formatJson includes a requirements summary alongside violations', () => {
    const parsed = JSON.parse(formatJson([req({ id: 'REQ-001' })], [])) as {
      requirements: unknown
      violations: unknown[]
    }

    expect(parsed.requirements).toEqual({
      total: 1,
      covered: 1,
      uncovered: 0,
      ignored: 0,
      percentCovered: 100,
      weak: 0,
    })
    expect(parsed.violations).toEqual([])
  })
})

describe('[REQ-028] formatMarkdownReport', () => {
  it('lists every requirement with its coverage status', () => {
    const markdown = formatMarkdownReport(
      [req({ id: 'REQ-001', title: 'Covered thing' }), req({ id: 'REQ-002', title: 'Uncovered thing' })],
      [
        {
          rule: 'uncovered-requirement',
          severity: 'error',
          message: 'Requirement "REQ-002" has no test covering it',
          requirementId: 'REQ-002',
          file: 'specs/example.md',
          line: 5,
        },
      ],
    )

    expect(markdown).toContain('REQ-001')
    expect(markdown).toContain('Covered')
    expect(markdown).toContain('REQ-002')
    expect(markdown).toContain('Uncovered')
  })

  it('includes one section per violation with file, line, and an actionable instruction', () => {
    const markdown = formatMarkdownReport(
      [req({ id: 'REQ-001' })],
      [
        {
          rule: 'uncovered-requirement',
          severity: 'error',
          message: 'Requirement "REQ-001" has no test covering it',
          requirementId: 'REQ-001',
          file: 'specs/example.md',
          line: 3,
        },
      ],
    )

    expect(markdown).toContain('specs/example.md:3')
    expect(markdown).toContain('uncovered-requirement')
    expect(markdown.toLowerCase()).toContain('write a test')
  })

  it('marks a requirement ignored via config as ignored rather than uncovered', () => {
    const markdown = formatMarkdownReport([req({ id: 'REQ-001', ignored: true })], [])
    expect(markdown).toContain('Ignored')
  })
})
