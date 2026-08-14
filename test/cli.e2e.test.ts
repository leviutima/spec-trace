import { execFileSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Violation } from '../src/rules-engine.js'

const cliPath = join(import.meta.dirname, '..', 'dist', 'cli.js')
const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'pipeline', ...segments)

function copyFixtureToTemp(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spec-trace-e2e-'))
  cpSync(fixture(name), dir, { recursive: true })
  return dir
}

function parseViolations(stdout: string): Violation[] {
  return (JSON.parse(stdout) as { violations: Violation[] }).violations
}

function runCli(
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string }
    return { status: e.status, stdout: e.stdout, stderr: e.stderr }
  }
}

describe('spec-trace CLI (end-to-end)', () => {
  afterEach(() => {
    rmSync(join(fixture('happy-path'), '.spec-trace', 'report.md'), { force: true })
    rmSync(join(fixture('clean'), '.spec-trace', 'report.md'), { force: true })
  })

  it('[REQ-031] exits 0 and reports no violations for a fully covered, well-tested project', () => {
    const result = runCli(['verify', '--json'], fixture('clean'))

    expect(result.status).toBe(0)
    const violations = parseViolations(result.stdout)
    expect(violations).toEqual([])
  })

  it('[REQ-031] exits 1 and reports uncovered-requirement and weak-test violations', () => {
    const result = runCli(['verify', '--json'], fixture('happy-path'))

    expect(result.status).toBe(1)
    const violations = parseViolations(result.stdout)

    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'uncovered-requirement', requirementId: 'REQ-002' }),
    )
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'weak-test' }))
  })

  it('[REQ-029][REQ-031] exits 1 with a helpful stderr message when results.json is missing', () => {
    const result = runCli(['verify'], fixture('missing-results'))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('results.json')
  })

  it('[REQ-029][REQ-031] exits 1 with a helpful stderr message in a clean project with no specs directory at all', () => {
    const result = runCli(['verify'], fixture('missing-specdir'))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Spec directory not found')
    expect(result.stderr).not.toContain('ENOENT')
  })

  it('[REQ-031] only fails on warnings when --fail-on=warn and there are no errors', () => {
    const result = runCli(['verify', '--json', '--fail-on', 'warn'], fixture('clean'))
    expect(result.status).toBe(0)
  })

  it('[REQ-034][REQ-035] exits 1 and reports all three stale-results triggers: deleted, modified, never-ran', () => {
    const result = runCli(['verify', '--json'], fixture('stale-results'))

    expect(result.status).toBe(1)
    const violations = parseViolations(result.stdout)
    const staleFiles = violations.filter((v) => v.rule === 'stale-results').map((v) => v.file).sort()

    expect(staleFiles).toEqual([
      'test/deleted.test.ts',
      'test/modified.test.ts',
      'test/never-ran.test.ts',
    ])
  })

  it('[REQ-034] catches a results.json that no longer reflects the test files on disk at all', () => {
    // This is the scenario the whole tool exists to prevent: an agent
    // deletes every test, and a stale results.json from a prior run is
    // still enough to make verify report a clean bill of health.
    const result = runCli(['verify', '--json'], fixture('missing-tests-on-disk'))

    expect(result.status).toBe(1)
    const violations = parseViolations(result.stdout)
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'stale-results' }))
  })

  it('[REQ-037][REQ-038] recognizes a custom idPattern when --config points at it, passing cleanly', () => {
    const result = runCli(
      ['verify', '--json', '--config', 'story.config.ts'],
      fixture('custom-id-pattern'),
    )

    expect(result.status).toBe(0)
    const violations = parseViolations(result.stdout)
    expect(violations).toEqual([])
  })

  it('[REQ-037][REQ-038] does not recognize that same id under the default REQ-\\d+ pattern', () => {
    const result = runCli(['verify', '--json'], fixture('custom-id-pattern'))

    const violations = parseViolations(result.stdout)
    expect(violations).not.toContainEqual(
      expect.objectContaining({ rule: 'uncovered-requirement', requirementId: 'STORY-42' }),
    )
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'orphan-test' }))
  })

  it('[REQ-046] --json includes a requirements summary alongside violations', () => {
    const result = runCli(['verify', '--json'], fixture('happy-path'))

    const parsed = JSON.parse(result.stdout) as { requirements: { total: number }; violations: unknown[] }
    expect(parsed.requirements.total).toBe(2)
    expect(Array.isArray(parsed.violations)).toBe(true)
  })

  describe('[REQ-047][REQ-048][REQ-049] --baseline', () => {
    it('writes a baseline and exits 0 even though the project has violations', () => {
      const cwd = copyFixtureToTemp('happy-path')
      try {
        const result = runCli(['verify', '--baseline'], cwd)

        expect(result.status).toBe(0)
        expect(existsSync(join(cwd, '.spec-trace', 'baseline.json'))).toBe(true)
      } finally {
        rmSync(cwd, { recursive: true, force: true })
      }
    })

    it('a plain verify after --baseline only fails on violations new since the baseline', () => {
      const cwd = copyFixtureToTemp('happy-path')
      try {
        const baselineRun = runCli(['verify', '--baseline'], cwd)
        expect(baselineRun.status).toBe(0)

        const cleanRun = runCli(['verify', '--json'], cwd)
        expect(cleanRun.status).toBe(0)
        expect((JSON.parse(cleanRun.stdout) as { violations: unknown[] }).violations).toEqual([])

        appendFileSync(
          join(cwd, 'specs', 'example.md'),
          '\n\n## REQ-900 — A brand new requirement\n\n**When** X, **the system shall** Y.\n',
        )

        const afterNewRequirement = runCli(['verify', '--json'], cwd)
        expect(afterNewRequirement.status).toBe(1)
        const violations = JSON.parse(afterNewRequirement.stdout) as { violations: Violation[] }
        expect(violations.violations).toEqual([
          expect.objectContaining({ rule: 'uncovered-requirement', requirementId: 'REQ-900' }),
        ])
      } finally {
        rmSync(cwd, { recursive: true, force: true })
      }
    })

    it('behaves exactly like a normal run when no baseline file exists', () => {
      const cwd = copyFixtureToTemp('happy-path')
      try {
        const withoutBaseline = runCli(['verify', '--json'], cwd)
        const violations = JSON.parse(withoutBaseline.stdout) as { violations: Violation[] }

        expect(withoutBaseline.status).toBe(1)
        expect(violations.violations.length).toBeGreaterThan(0)
      } finally {
        rmSync(cwd, { recursive: true, force: true })
      }
    })
  })

  it('[REQ-045] exits 1 with an empty-suite violation for a results.json with zero tests', () => {
    const result = runCli(['verify', '--json'], fixture('empty-suite'))

    expect(result.status).toBe(1)
    const violations = parseViolations(result.stdout)
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'empty-suite' }))
  })

  it('[REQ-044] tolerates a BOM at the start of results.json', () => {
    const result = runCli(['verify', '--json'], fixture('bom-results'))

    const violations = parseViolations(result.stdout)
    expect(violations.some((v) => v.requirementId === 'REQ-201')).toBe(false)
  })

  it('[REQ-043][REQ-044] exits 1 with a clear message (not a raw stack) for malformed results.json', () => {
    const result = runCli(['verify'], fixture('malformed-results'))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('results.json')
    expect(result.stderr).not.toContain('SyntaxError')
    expect(result.stderr).not.toContain('at parseResultsFile')
  })

  it('[REQ-043] shows the stack trace for a CLI error only with --verbose', () => {
    const result = runCli(['verify', '--verbose'], fixture('malformed-results'))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ResultsJsonParseError')
  })

  it('[REQ-043] shows the stack trace for a CLI error when DEBUG=spec-trace', () => {
    const result = runCli(['verify'], fixture('malformed-results'), { DEBUG: 'spec-trace' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ResultsJsonParseError')
  })

  it('[REQ-032] writes an agent-readable markdown report and exits 0 regardless of violations', () => {
    const result = runCli(['report'], fixture('happy-path'))

    expect(result.status).toBe(0)
    const reportPath = join(fixture('happy-path'), '.spec-trace', 'report.md')
    expect(existsSync(reportPath)).toBe(true)

    const content = readFileSync(reportPath, 'utf8')
    expect(content).toContain('REQ-002')
    expect(content).toContain('Uncovered')
  })
})
