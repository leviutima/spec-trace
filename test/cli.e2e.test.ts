import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Violation } from '../src/rules-engine.js'

const cliPath = join(import.meta.dirname, '..', 'dist', 'cli.js')
const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'pipeline', ...segments)

function runCli(
  args: string[],
  cwd: string,
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' })
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
    const violations = JSON.parse(result.stdout) as Violation[]
    expect(violations).toEqual([])
  })

  it('[REQ-031] exits 1 and reports uncovered-requirement and weak-test violations', () => {
    const result = runCli(['verify', '--json'], fixture('happy-path'))

    expect(result.status).toBe(1)
    const violations = JSON.parse(result.stdout) as Violation[]

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
