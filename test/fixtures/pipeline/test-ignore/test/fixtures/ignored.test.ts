import { describe, expect, it } from 'vitest'

describe('a fixture file that is never run directly by the outer suite', () => {
  it('should not count as never-ran when its directory is ignored', () => {
    expect(true).toBe(true)
  })
})
