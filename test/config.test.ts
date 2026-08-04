import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/config.js'

describe('defineConfig', () => {
  it('[REQ-023] returns the config it was given unchanged', () => {
    const config = defineConfig({ specDir: 'specs' })
    expect(config).toEqual({ specDir: 'specs' })
  })
})
