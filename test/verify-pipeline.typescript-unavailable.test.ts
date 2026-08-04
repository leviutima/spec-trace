import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('typescript', () => {
  throw new Error('simulated: typescript is not installed')
})

describe('[REQ-040][REQ-042] gatherResults without typescript available', () => {
  it('emits exactly one weak-test-unavailable violation, not one per test file', async () => {
    const { gatherResults } = await import('../src/verify-pipeline.js')
    const { DEFAULT_CONFIG } = await import('../src/config-loader.js')
    const cwd = join(import.meta.dirname, 'fixtures', 'pipeline', 'multi-file-weak-test')

    const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

    const weakTestViolations = violations.filter((v) => v.rule === 'weak-test')
    expect(weakTestViolations).toHaveLength(1)
    expect(weakTestViolations[0]?.message).toContain('weak-test-unavailable')

    // The rest of the pipeline still works normally.
    expect(violations.some((v) => v.rule === 'uncovered-requirement')).toBe(false)
  })
})
