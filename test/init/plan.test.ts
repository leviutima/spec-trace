import { describe, expect, it } from 'vitest'
import type { DetectionResult } from '../../src/init/detect.js'
import { buildPlan, type PlanStep } from '../../src/init/plan.js'

function detection(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    cwd: '/project',
    language: 'en',
    moduleType: 'esm',
    scripts: {},
    existingVitestConfig: undefined,
    specsAgentsExists: false,
    specsReadmeExists: false,
    testGitkeepExists: false,
    resultsJsonExists: false,
    gitignoreExists: false,
    gitignoreHasEntry: false,
    agentsFilePath: undefined,
    agentsFileHasPointer: false,
    ...overrides,
  }
}

function stepFor(steps: PlanStep[], path: string): PlanStep | undefined {
  return steps.find((s) => (s.kind === 'write' || s.kind === 'append') && s.path === path)
}

describe('[REQ-051] buildPlan — vitest config extension', () => {
  it('generates vitest.config.mts for a CommonJS project with no existing config', () => {
    const steps = buildPlan(detection({ moduleType: 'cjs' }), { force: false })
    const step = steps.find((s) => s.kind === 'write' && s.path.startsWith('vitest.config'))

    expect(step).toEqual(expect.objectContaining({ path: 'vitest.config.mts' }))
  })

  it('generates vitest.config.ts for an ESM project with no existing config', () => {
    const steps = buildPlan(detection({ moduleType: 'esm' }), { force: false })
    const step = steps.find((s) => s.kind === 'write' && s.path.startsWith('vitest.config'))

    expect(step).toEqual(expect.objectContaining({ path: 'vitest.config.ts' }))
  })
})

describe('[REQ-060] buildPlan — existing vitest config', () => {
  it('never writes a config file when one already exists', () => {
    const steps = buildPlan(
      detection({ existingVitestConfig: { path: '/project/vitest.config.ts', hasReporter: false } }),
      { force: false },
    )

    expect(steps.some((s) => s.kind === 'write' && s.path.startsWith('vitest.config'))).toBe(false)
  })

  it('notes the reporter snippet when the existing config lacks it', () => {
    const steps = buildPlan(
      detection({ existingVitestConfig: { path: '/project/vitest.config.ts', hasReporter: false } }),
      { force: false },
    )

    const note = steps.find((s) => s.kind === 'note' && s.message.includes('SpecTraceReporter'))
    expect(note?.kind).toBe('note')
  })

  it('notes nothing needs to change when the reporter is already configured', () => {
    const steps = buildPlan(
      detection({ existingVitestConfig: { path: '/project/vitest.config.ts', hasReporter: true } }),
      { force: false },
    )

    const note = steps.find(
      (s) => s.kind === 'note' && s.message.includes('already has the spec-trace reporter'),
    )
    expect(note?.kind).toBe('note')
  })
})

describe('[REQ-053][REQ-054] buildPlan — skip vs force', () => {
  it('skips specs/AGENTS.md when it already exists and --force is not given', () => {
    const step = stepFor(buildPlan(detection({ specsAgentsExists: true }), { force: false }), 'specs/AGENTS.md')
    expect(step).toEqual(expect.objectContaining({ skipped: true }))
  })

  it('overwrites specs/AGENTS.md when it exists and --force is given', () => {
    const step = stepFor(buildPlan(detection({ specsAgentsExists: true }), { force: true }), 'specs/AGENTS.md')
    expect(step).toEqual(expect.objectContaining({ skipped: false }))
  })

  it('never generates a step to touch any file outside its own generated set', () => {
    const steps = buildPlan(detection({ specsAgentsExists: true }), { force: true })
    const paths = steps.filter((s) => s.kind === 'write' || s.kind === 'append').map((s) => s.path)

    expect(paths).toEqual(
      expect.arrayContaining(['specs/AGENTS.md', 'specs/README.md', 'test/.gitkeep', '.spec-trace/results.json']),
    )
    expect(paths.some((p) => p.startsWith('specs/') && p !== 'specs/AGENTS.md' && p !== 'specs/README.md')).toBe(
      false,
    )
  })
})

describe('[REQ-056] buildPlan — package.json scripts', () => {
  it('only lists scripts that are missing', () => {
    const steps = buildPlan(detection({ scripts: { verify: './custom-verify.sh' } }), { force: false })
    const step = steps.find((s) => s.kind === 'patch-scripts')

    expect(step).toEqual(
      expect.objectContaining({
        scripts: { report: 'spec-trace report', check: 'vitest run --passWithNoTests && spec-trace verify' },
      }),
    )
  })

  it('adds a note instead of a patch step when all three scripts already exist', () => {
    const steps = buildPlan(
      detection({
        scripts: { verify: 'a', report: 'b', check: 'c' },
      }),
      { force: false },
    )

    expect(steps.some((s) => s.kind === 'patch-scripts')).toBe(false)
  })
})

describe('[REQ-057] buildPlan — .gitignore', () => {
  it('creates .gitignore when it does not exist', () => {
    const step = stepFor(buildPlan(detection({ gitignoreExists: false }), { force: false }), '.gitignore')
    expect(step).toEqual(expect.objectContaining({ createIfMissing: true, skipped: false }))
  })

  it('skips .gitignore when it already has the entry', () => {
    const step = stepFor(
      buildPlan(detection({ gitignoreExists: true, gitignoreHasEntry: true }), { force: false }),
      '.gitignore',
    )
    expect(step).toEqual(expect.objectContaining({ skipped: true }))
  })
})

describe('[REQ-059] buildPlan — AGENTS/CLAUDE pointer', () => {
  it('appends a pointer when a root AGENTS.md exists without one', () => {
    const step = stepFor(
      buildPlan(detection({ agentsFilePath: '/project/AGENTS.md', agentsFileHasPointer: false }), {
        force: false,
      }),
      'AGENTS.md',
    )
    expect(step).toEqual(expect.objectContaining({ kind: 'append', skipped: false }))
  })

  it('does nothing when the pointer is already present', () => {
    const steps = buildPlan(
      detection({ agentsFilePath: '/project/AGENTS.md', agentsFileHasPointer: true }),
      { force: false },
    )
    expect(steps.some((s) => (s.kind === 'write' || s.kind === 'append') && s.path === 'AGENTS.md')).toBe(false)
  })

  it('only suggests creating one when neither file exists', () => {
    const steps = buildPlan(detection({ agentsFilePath: undefined }), { force: false })
    const note = steps.find((s) => s.kind === 'note' && s.message.includes('AGENTS.md'))
    expect(note?.kind).toBe('note')
  })
})
