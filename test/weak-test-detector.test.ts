import { describe, expect, it } from 'vitest'
import { detectWeakTests } from '../src/weak-test-detector.js'

describe('detectWeakTests', () => {
  it('[REQ-018] flags a test with zero expect calls', async () => {
    const source = `
      it('does nothing useful', () => {
        const x = 1 + 1
      })
    `
    const findings = await detectWeakTests('sample.test.ts', source)

    expect(findings).toEqual([
      expect.objectContaining({ name: 'does nothing useful', reasons: ['no-assertions'] }),
    ])
  })

  it('[REQ-018] does not flag a test with a real assertion', async () => {
    const source = `
      it('adds numbers', () => {
        expect(1 + 2).toBe(3)
      })
    `
    expect(await detectWeakTests('sample.test.ts', source)).toEqual([])
  })

  it('[REQ-019] flags a test whose only assertion is toBeDefined', async () => {
    const source = `
      it('checks existence', () => {
        expect(result).toBeDefined()
      })
    `
    const findings = await detectWeakTests('sample.test.ts', source)

    expect(findings).toEqual([
      expect.objectContaining({ name: 'checks existence', reasons: ['non-discriminant-assertions'] }),
    ])
  })

  it('[REQ-019] flags a test whose only assertion is not.toThrow', async () => {
    const source = `
      it('does not blow up', () => {
        expect(() => run()).not.toThrow()
      })
    `
    const findings = await detectWeakTests('sample.test.ts', source)

    expect(findings).toEqual([
      expect.objectContaining({ name: 'does not blow up', reasons: ['non-discriminant-assertions'] }),
    ])
  })

  it('[REQ-019] does not flag a positive toThrow assertion', async () => {
    const source = `
      it('throws on bad input', () => {
        expect(() => run()).toThrow('bad input')
      })
    `
    expect(await detectWeakTests('sample.test.ts', source)).toEqual([])
  })

  it('[REQ-019] does not flag a test that mixes a weak and a strong assertion', async () => {
    const source = `
      it('checks both', () => {
        expect(result).toBeDefined()
        expect(result.total).toBe(42)
      })
    `
    expect(await detectWeakTests('sample.test.ts', source)).toEqual([])
  })

  it('[REQ-021] flags a tautological assertion with identical literals on both sides', async () => {
    const source = `
      it('proves nothing', () => {
        expect(2).toBe(2)
      })
    `
    const findings = await detectWeakTests('sample.test.ts', source)

    expect(findings).toEqual([
      expect.objectContaining({ name: 'proves nothing', reasons: ['tautological-assertion'] }),
    ])
  })

  it('[REQ-021] does not flag matching values that come from a real computation', async () => {
    const source = `
      it('computes the sum', () => {
        expect(sum(1, 1)).toBe(2)
      })
    `
    expect(await detectWeakTests('sample.test.ts', source)).toEqual([])
  })

  it('[REQ-020] flags a test that exercises a module the file mocks out', async () => {
    const source = `
      import { addItem } from '../src/cart'
      vi.mock('../src/cart')

      it('adds an item', () => {
        expect(addItem(1)).toBe(true)
      })
    `
    const findings = await detectWeakTests('cart.test.ts', source)

    expect(findings).toEqual([
      expect.objectContaining({ name: 'adds an item', reasons: ['target-module-mocked'] }),
    ])
  })

  it('[REQ-020] does not flag a test when a different module is mocked', async () => {
    const source = `
      import { addItem } from '../src/cart'
      vi.mock('../src/logger')

      it('adds an item', () => {
        expect(addItem(1)).toBe(true)
      })
    `
    expect(await detectWeakTests('cart.test.ts', source)).toEqual([])
  })

  it('[REQ-019][REQ-020] reports every heuristic that matches a single test', async () => {
    const source = `
      import { addItem } from '../src/cart'
      vi.mock('../src/cart')

      it('adds an item', () => {
        expect(addItem(1)).toBeTruthy()
      })
    `
    const findings = await detectWeakTests('cart.test.ts', source)

    expect(findings).toHaveLength(1)
    expect(findings?.[0]?.reasons.sort()).toEqual(
      ['non-discriminant-assertions', 'target-module-mocked'].sort(),
    )
  })

  it('[REQ-022] is silenced by a spec-trace-disable-next-line comment above the test', async () => {
    const source = `
      // spec-trace-disable-next-line weak-test
      it('does nothing useful', () => {
        const x = 1 + 1
      })
    `
    expect(await detectWeakTests('sample.test.ts', source)).toEqual([])
  })

  it('[REQ-022] does not analyze an it.todo test with no body', async () => {
    const source = `
      it.todo('someday')
    `
    expect(await detectWeakTests('sample.test.ts', source)).toEqual([])
  })

  it('[REQ-022] includes the enclosing describe chain in the reported name', async () => {
    const source = `
      describe('REQ-014: cart quantity validation', () => {
        it('rejects zero', () => {
          const x = 1
        })
      })
    `
    const findings = await detectWeakTests('cart.test.ts', source)

    expect(findings).toEqual([
      expect.objectContaining({ name: 'REQ-014: cart quantity validation > rejects zero' }),
    ])
  })

  it('[REQ-022] reports the correct file and a 1-based line number', async () => {
    const source = `it('does nothing useful', () => {\n  const x = 1\n})`

    const findings = await detectWeakTests('sample.test.ts', source)

    expect(findings?.[0]?.file).toBe('sample.test.ts')
    expect(findings?.[0]?.line).toBe(1)
  })

  it('[REQ-018][REQ-019][REQ-020][REQ-021] reports no findings for a well-formed suite of good tests', async () => {
    const source = `
      import { addItem, cartTotal } from '../src/cart'

      describe('REQ-014: cart quantity validation', () => {
        it('adds a positive quantity', () => {
          expect(addItem({ qty: 2 })).toEqual({ qty: 2, total: 2 })
        })

        it('rejects a negative quantity', () => {
          expect(() => addItem({ qty: -1 })).toThrow('INVALID_QUANTITY')
        })

        it('computes the running total', () => {
          expect(cartTotal([{ qty: 2 }, { qty: 3 }])).toBe(5)
        })
      })
    `
    expect(await detectWeakTests('cart.test.ts', source)).toEqual([])
  })

  it('[REQ-040] returns undefined (not an empty array) when typescript cannot be loaded', async () => {
    const findings = await detectWeakTests('sample.test.ts', "it('x', () => {})", {
      importTypeScript: () => Promise.reject(new Error('simulated missing dependency')),
    })

    expect(findings).toBeUndefined()
  })
})
