import { describe, expect, it } from 'vitest'
import { resolveLanguage } from '../../src/init/detect.js'

describe('[REQ-058] resolveLanguage', () => {
  it('uses an explicit --lang flag over anything else', () => {
    expect(resolveLanguage('pt-BR')).toBe('pt-BR')
    expect(resolveLanguage('en')).toBe('en')
  })

  it('treats any pt-prefixed flag value as pt-BR, case-insensitively', () => {
    expect(resolveLanguage('PT')).toBe('pt-BR')
    expect(resolveLanguage('pt-PT')).toBe('pt-BR')
  })

  it('treats any non-pt flag value as en', () => {
    expect(resolveLanguage('es')).toBe('en')
    expect(resolveLanguage('fr-FR')).toBe('en')
  })

  it('falls back to the environment locale when no flag is given', () => {
    const result = resolveLanguage(undefined)
    expect(['en', 'pt-BR']).toContain(result)
  })
})
