import { describe, expect, it } from 'vitest'

describe('STORY-42: custom id pattern', () => {
  it('is covered when idPattern matches STORY-\\d+', () => {
    expect(1 + 1).toBe(2)
  })
})
