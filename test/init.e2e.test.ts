import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const cliPath = join(import.meta.dirname, '..', 'dist', 'cli.js')
const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'init', ...segments)

const tempDirs: string[] = []

function copyFixtureToTemp(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spec-trace-init-'))
  cpSync(fixture(name), dir, { recursive: true })
  tempDirs.push(dir)
  return dir
}

function runInit(
  args: string[],
  cwd: string,
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, 'init', ...args], { cwd, encoding: 'utf8' })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string }
    return { status: e.status, stdout: e.stdout, stderr: e.stderr }
  }
}

describe('spec-trace init (end-to-end)', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it('[REQ-050] fails clearly when there is no package.json', () => {
    const cwd = copyFixtureToTemp('no-package-json')
    const result = runInit([], cwd)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('package.json')
    expect(result.stderr).toContain('npm init')
  })

  it('[REQ-051][REQ-052] scaffolds an ESM project with a .ts vitest config', () => {
    const cwd = copyFixtureToTemp('esm-fresh')
    const result = runInit([], cwd)

    expect(result.status).toBe(0)
    expect(existsSync(join(cwd, 'vitest.config.ts'))).toBe(true)
    expect(existsSync(join(cwd, 'vitest.config.mts'))).toBe(false)
    expect(existsSync(join(cwd, 'specs', 'AGENTS.md'))).toBe(true)
    expect(existsSync(join(cwd, 'specs', 'README.md'))).toBe(true)
    expect(existsSync(join(cwd, 'test', '.gitkeep'))).toBe(true)

    const results = JSON.parse(readFileSync(join(cwd, '.spec-trace', 'results.json'), 'utf8')) as {
      tests: unknown[]
    }
    expect(results.tests).toEqual([])
  })

  it('[REQ-051] scaffolds a CommonJS project with a .mts vitest config, never .ts', () => {
    const cwd = copyFixtureToTemp('cjs-fresh')
    const result = runInit([], cwd)

    expect(result.status).toBe(0)
    expect(existsSync(join(cwd, 'vitest.config.mts'))).toBe(true)
    expect(existsSync(join(cwd, 'vitest.config.ts'))).toBe(false)
  })

  it('[REQ-053] running init twice makes no changes the second time', () => {
    const cwd = copyFixtureToTemp('esm-fresh')
    runInit([], cwd)

    const before = readFileSync(join(cwd, 'specs', 'AGENTS.md'), 'utf8')
    const second = runInit([], cwd)
    const after = readFileSync(join(cwd, 'specs', 'AGENTS.md'), 'utf8')

    expect(second.status).toBe(0)
    expect(second.stdout).toContain('Skipped specs/AGENTS.md')
    expect(after).toBe(before)
  })

  it('[REQ-054] --force overwrites generated files but never another specs/*.md', () => {
    const cwd = copyFixtureToTemp('esm-fresh')
    runInit([], cwd)

    mkdirSync(join(cwd, 'specs'), { recursive: true })
    writeFileSync(join(cwd, 'specs', 'AGENTS.md'), 'user-edited content that should be replaced')
    writeFileSync(join(cwd, 'specs', 'cart.md'), '## REQ-001 — user-authored requirement\n')

    const result = runInit(['--force'], cwd)

    expect(result.status).toBe(0)
    expect(readFileSync(join(cwd, 'specs', 'AGENTS.md'), 'utf8')).not.toContain('user-edited content')
    expect(readFileSync(join(cwd, 'specs', 'cart.md'), 'utf8')).toContain('REQ-001')
  })

  it('[REQ-055] --dry-run writes nothing to disk', () => {
    const cwd = copyFixtureToTemp('esm-fresh')
    const result = runInit(['--dry-run'], cwd)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Would create specs/AGENTS.md')
    expect(existsSync(join(cwd, 'specs'))).toBe(false)
    expect(existsSync(join(cwd, 'test'))).toBe(false)
    expect(existsSync(join(cwd, '.spec-trace'))).toBe(false)
    expect(existsSync(join(cwd, 'vitest.config.ts'))).toBe(false)
  })

  it('[REQ-056] adds only the missing scripts, leaving an existing verify script untouched', () => {
    const cwd = copyFixtureToTemp('with-existing-scripts')
    const result = runInit([], cwd)

    expect(result.status).toBe(0)
    const packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['verify']).toBe('./custom-verify.sh')
    expect(packageJson.scripts['report']).toBe('spec-trace report')
    expect(packageJson.scripts['check']).toBe('vitest run --passWithNoTests && spec-trace verify')
  })

  it('[REQ-057] creates .gitignore with a .spec-trace/ entry when none exists', () => {
    const cwd = copyFixtureToTemp('esm-fresh')
    runInit([], cwd)

    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toContain('.spec-trace/')
  })

  it('[REQ-059] appends a pointer to an existing root AGENTS.md, once', () => {
    const cwd = copyFixtureToTemp('with-agents-md')
    runInit([], cwd)
    const afterFirst = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(afterFirst).toContain('specs/AGENTS.md')

    runInit([], cwd)
    const afterSecond = readFileSync(join(cwd, 'AGENTS.md'), 'utf8')
    expect(afterSecond).toBe(afterFirst)
  })

  it('[REQ-060] never rewrites an existing vitest config, even without the reporter', () => {
    const cwd = copyFixtureToTemp('existing-config-no-reporter')
    const before = readFileSync(join(cwd, 'vitest.config.ts'), 'utf8')

    const result = runInit([], cwd)

    expect(result.stdout).toContain('SpecTraceReporter')
    expect(readFileSync(join(cwd, 'vitest.config.ts'), 'utf8')).toBe(before)
  })

  it('[REQ-060] reports nothing to do when the existing config already has the reporter', () => {
    const cwd = copyFixtureToTemp('existing-config-with-reporter')
    const before = readFileSync(join(cwd, 'vitest.config.ts'), 'utf8')

    const result = runInit([], cwd)

    expect(result.stdout).toContain('already has the spec-trace reporter configured')
    expect(readFileSync(join(cwd, 'vitest.config.ts'), 'utf8')).toBe(before)
  })

  it('[REQ-058] --lang pt-BR writes the Portuguese template', () => {
    const cwd = copyFixtureToTemp('esm-fresh')
    runInit(['--lang', 'pt-BR'], cwd)

    expect(readFileSync(join(cwd, 'specs', 'AGENTS.md'), 'utf8')).toContain('Trabalhando com o spec-trace')
  })
})
