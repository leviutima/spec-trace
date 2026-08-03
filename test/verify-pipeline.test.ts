import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config-loader.js'
import { gatherResults, ResultsFileNotFoundError } from '../src/verify-pipeline.js'

const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'pipeline', ...segments)

describe('gatherResults', () => {
  it('throws ResultsFileNotFoundError with a helpful message when results.json is missing', async () => {
    const cwd = fixture('missing-results')

    await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(ResultsFileNotFoundError)
    await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(/results\.json/)
  })

  it('combines rule violations and weak-test findings from the real test source files', async () => {
    const cwd = fixture('happy-path')

    const { requirements, violations } = await gatherResults(DEFAULT_CONFIG, cwd)

    expect(requirements.map((r) => r.id).sort()).toEqual(['REQ-001', 'REQ-002'])

    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'uncovered-requirement', requirementId: 'REQ-002' }),
    )
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'weak-test', file: 'test/cart.test.ts' }),
    )
  })

  it('does not scan for weak tests when the weak-test rule is turned off', async () => {
    const cwd = fixture('happy-path')

    const { violations } = await gatherResults(
      { ...DEFAULT_CONFIG, rules: { 'weak-test': 'off' } },
      cwd,
    )

    expect(violations.some((v) => v.rule === 'weak-test')).toBe(false)
  })
})
