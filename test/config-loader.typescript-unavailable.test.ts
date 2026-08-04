import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('typescript', () => {
  throw new Error('simulated: typescript is not installed')
})

describe('[REQ-041] loadConfig without typescript available', () => {
  it('rejects a .ts config with a clear, distinct error instead of a raw import failure', async () => {
    const { loadConfig, TypeScriptNotAvailableError } = await import('../src/config-loader.js')
    const fixture = join(import.meta.dirname, 'fixtures', 'config', 'ts-config')

    await expect(loadConfig(undefined, fixture)).rejects.toThrow(TypeScriptNotAvailableError)
    await expect(loadConfig(undefined, fixture)).rejects.toThrow(/typescript/i)
  })

  it('still loads a .js config fine — typescript is only needed for .ts', async () => {
    const { loadConfig, DEFAULT_CONFIG } = await import('../src/config-loader.js')
    const fixture = join(import.meta.dirname, 'fixtures', 'config', 'js-config')

    const config = await loadConfig(undefined, fixture)
    expect(config).toEqual({ ...DEFAULT_CONFIG, resultsFile: 'custom/results.json' })
  })
})
