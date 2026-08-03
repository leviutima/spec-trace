import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, loadConfig } from '../src/config-loader.js'

const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'config', ...segments)

describe('loadConfig', () => {
  it('returns the defaults when no config file exists', async () => {
    const config = await loadConfig(undefined, fixture('no-config'))
    expect(config).toEqual(DEFAULT_CONFIG)
  })

  it('merges a discovered spec-trace.config.ts with the defaults', async () => {
    const config = await loadConfig(undefined, fixture('ts-config'))

    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      specDir: 'requirements',
      rules: { 'orphan-test': 'off' },
      ignore: ['REQ-001'],
    })
  })

  it('discovers a spec-trace.config.js when there is no .ts file', async () => {
    const config = await loadConfig(undefined, fixture('js-config'))

    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      resultsFile: 'custom/results.json',
    })
  })

  it('loads an explicit --config path regardless of its file name', async () => {
    const config = await loadConfig(fixture('explicit-path', 'custom.config.ts'), fixture('explicit-path'))

    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      idPattern: 'CUSTOM-\\d+',
    })
  })
})
