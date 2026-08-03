import { describe, expect, it } from 'vitest'

describe('REQ-100: sample suite', () => {
  it('passes', () => {
    expect(1 + 1).toBe(2)
  })

  it.skip('is skipped', () => {
    expect(true).toBe(true)
  })

  it.todo('is a todo')

  describe('nested', () => {
    it('[REQ-101] fails on purpose', () => {
      expect(true).toBe(false)
    })
  })
})

it('orphan test with no requirement id', () => {
  expect(true).toBe(true)
})
