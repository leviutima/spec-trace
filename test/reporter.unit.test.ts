import { describe, expect, it } from 'vitest'
import type { Suite, Task, Test } from 'vitest'
import { collectTestResults } from '../src/reporter.js'

function fakeTest(overrides: Partial<Test> & { name: string }): Test {
  return {
    type: 'test',
    mode: 'run',
    ...overrides,
  } as unknown as Test
}

function fakeSuite(overrides: Partial<Suite> & { name: string; tasks: Task[] }): Suite {
  return {
    type: 'suite',
    mode: 'run',
    ...overrides,
  } as unknown as Suite
}

describe('collectTestResults', () => {
  it('[REQ-007] builds the full name from nested describe blocks down to the test', () => {
    const tree = fakeSuite({
      name: 'REQ-014: cart quantity validation',
      tasks: [
        fakeSuite({
          name: 'nested group',
          tasks: [fakeTest({ name: 'rejects zero', result: { state: 'pass' } })],
        }),
      ],
    })

    const results = collectTestResults(tree, 'cart.test.ts', [])

    expect(results).toEqual([
      {
        name: 'REQ-014: cart quantity validation > nested group > rejects zero',
        file: 'cart.test.ts',
        status: 'passed',
      },
    ])
  })

  it('[REQ-008] reports a failing test as failed', () => {
    const test = fakeTest({ name: 'fails', result: { state: 'fail' } })

    expect(collectTestResults(test, 'a.test.ts', [])).toEqual([
      { name: 'fails', file: 'a.test.ts', status: 'failed' },
    ])
  })

  it('[REQ-008] reports an it.skip test as skipped even if it somehow has a result', () => {
    const test = fakeTest({ name: 'skipped', mode: 'skip', result: { state: 'pass' } })

    expect(collectTestResults(test, 'a.test.ts', [])).toEqual([
      { name: 'skipped', file: 'a.test.ts', status: 'skipped' },
    ])
  })

  it('[REQ-008] reports an it.todo test as todo', () => {
    const test = fakeTest({ name: 'someday', mode: 'todo' })

    expect(collectTestResults(test, 'a.test.ts', [])).toEqual([
      { name: 'someday', file: 'a.test.ts', status: 'todo' },
    ])
  })

  it('[REQ-008] falls back to skipped for a test that never produced a result', () => {
    const test = fakeTest({ name: 'never ran' })

    expect(collectTestResults(test, 'a.test.ts', [])).toEqual([
      { name: 'never ran', file: 'a.test.ts', status: 'skipped' },
    ])
  })

  it('[REQ-007] keeps a top-level test name unprefixed when it has no ancestor describe', () => {
    const test = fakeTest({ name: '[REQ-101] orphan-looking test', result: { state: 'pass' } })

    expect(collectTestResults(test, 'a.test.ts', [])).toEqual([
      { name: '[REQ-101] orphan-looking test', file: 'a.test.ts', status: 'passed' },
    ])
  })
})
