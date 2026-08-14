import { describe, expect, it } from 'vitest'

function sum(a: number, b: number): number {
  return a + b
}

describe('REQ-201: sums two numbers', () => {
  it('adds two positive numbers', () => {
    expect(sum(2, 3)).toBe(5)
  })
})
