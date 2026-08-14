import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config-loader.js'
import {
  gatherResults,
  ResultsFileNotFoundError,
  ResultsJsonParseError,
  SpecDirNotFoundError,
} from '../src/verify-pipeline.js'

const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'pipeline', ...segments)

describe('gatherResults', () => {
  it('[REQ-029] throws ResultsFileNotFoundError with a helpful message when results.json is missing', async () => {
    const cwd = fixture('missing-results')

    await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(ResultsFileNotFoundError)
    await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(/results\.json/)
  })

  it('[REQ-029] throws SpecDirNotFoundError with a helpful message when the spec directory does not exist', async () => {
    const cwd = fixture('missing-specdir')

    await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(SpecDirNotFoundError)
    await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(/specs/)
  })

  it('[REQ-030] combines rule violations and weak-test findings from the real test source files', async () => {
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

  it('[REQ-030] does not scan for weak tests when the weak-test rule is turned off', async () => {
    const cwd = fixture('happy-path')

    const { violations } = await gatherResults(
      { ...DEFAULT_CONFIG, rules: { 'weak-test': 'off' } },
      cwd,
    )

    expect(violations.some((v) => v.rule === 'weak-test')).toBe(false)
  })

  describe('[REQ-034][REQ-035] stale-results', () => {
    it('reports no stale-results violation for a file whose recorded hash matches disk', async () => {
      const cwd = fixture('stale-results')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(
        violations.filter((v) => v.rule === 'stale-results' && v.file === 'test/covered.test.ts'),
      ).toEqual([])
    })

    it('flags a file recorded in results.json that no longer exists on disk', async () => {
      const cwd = fixture('stale-results')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'stale-results', file: 'test/deleted.test.ts' }),
      )
    })

    it('flags a file whose disk content no longer matches the recorded hash', async () => {
      const cwd = fixture('stale-results')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'stale-results', file: 'test/modified.test.ts' }),
      )
    })

    it('flags a test file on disk that was never recorded in results.json', async () => {
      const cwd = fixture('stale-results')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'stale-results', file: 'test/never-ran.test.ts' }),
      )
    })

    it('flags a test whose file has no fingerprint at all — an old-format or hand-crafted results.json', async () => {
      const cwd = fixture('forged-results')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'stale-results', file: 'test/example.test.ts' }),
      )
    })
  })

  describe('[REQ-044] BOM-tolerant results.json parsing', () => {
    it('strips a leading byte-order-mark and parses the file normally', async () => {
      const cwd = fixture('bom-results')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(violations.some((v) => v.requirementId === 'REQ-201')).toBe(false)
    })

    it('raises ResultsJsonParseError naming the path when the file still is not valid JSON', async () => {
      const cwd = fixture('malformed-results')

      await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(ResultsJsonParseError)
      await expect(gatherResults(DEFAULT_CONFIG, cwd)).rejects.toThrow(/results\.json/)
    })
  })

  describe('[REQ-036] testIgnore', () => {
    it('flags a fixture-style test file under an ignored directory by default (testIgnore is empty)', async () => {
      const cwd = fixture('test-ignore')

      const { violations } = await gatherResults(DEFAULT_CONFIG, cwd)

      expect(violations).toContainEqual(
        expect.objectContaining({ rule: 'stale-results', file: 'test/fixtures/ignored.test.ts' }),
      )
    })

    it('does not flag it once its directory is listed in testIgnore', async () => {
      const cwd = fixture('test-ignore')

      const { violations } = await gatherResults(
        { ...DEFAULT_CONFIG, testIgnore: ['test/fixtures'] },
        cwd,
      )

      expect(violations.some((v) => v.rule === 'stale-results')).toBe(false)
    })
  })
})
