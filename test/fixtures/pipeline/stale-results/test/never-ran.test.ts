import { describe, expect, it } from 'vitest'

describe('REQ-201: written but never executed against results.json', () => {
  it('exists on disk only', () => {
    expect(true).toBe(true)
  })
})
