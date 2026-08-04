import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ResultsFile } from '../src/reporter.js'

const require = createRequire(import.meta.url)
const fixtureDir = join(import.meta.dirname, 'fixtures', 'reporter-suite')
const resultsPath = join(fixtureDir, '.spec-trace', 'results.json')

describe('[REQ-007][REQ-008] SpecTraceReporter (end-to-end)', () => {
  let results: ResultsFile

  beforeAll(() => {
    const vitestBin = require.resolve('vitest/vitest.mjs')

    try {
      execFileSync(process.execPath, [vitestBin, 'run'], { cwd: fixtureDir, stdio: 'pipe' })
    } catch {
      // The fixture suite has one test that intentionally fails, so the
      // child process exits non-zero. We only care about the results file.
    }

    results = JSON.parse(readFileSync(resultsPath, 'utf8')) as ResultsFile
  }, 30_000)

  afterAll(() => {
    rmSync(join(fixtureDir, '.spec-trace'), { recursive: true, force: true })
  })

  it('writes a results file', () => {
    expect(existsSync(resultsPath)).toBe(true)
  })

  it('records the full describe chain for a nested passing test', () => {
    const test = results.tests.find((t) => t.name === 'REQ-100: sample suite > passes')
    expect(test?.status).toBe('passed')
  })

  it('records an it.skip test as skipped rather than covered', () => {
    const test = results.tests.find((t) => t.name === 'REQ-100: sample suite > is skipped')
    expect(test?.status).toBe('skipped')
  })

  it('records an it.todo test as todo rather than covered', () => {
    const test = results.tests.find((t) => t.name === 'REQ-100: sample suite > is a todo')
    expect(test?.status).toBe('todo')
  })

  it('inherits the parent describe id for a nested failing test', () => {
    const test = results.tests.find(
      (t) => t.name === 'REQ-100: sample suite > nested > [REQ-101] fails on purpose',
    )
    expect(test?.status).toBe('failed')
  })

  it('records a top-level test with no requirement id in its name', () => {
    const test = results.tests.find((t) => t.name === 'orphan test with no requirement id')
    expect(test?.status).toBe('passed')
  })

  it('[REQ-007] records the file path relative to the project root, not absolute', () => {
    const test = results.tests.find((t) => t.name === 'REQ-100: sample suite > passes')
    expect(test?.file).toBe('sample.test.ts')
  })

  it('[REQ-033] records a sha256 fingerprint of each test file that ran', () => {
    const expectedHash = createHash('sha256')
      .update(readFileSync(join(fixtureDir, 'sample.test.ts')))
      .digest('hex')

    expect(results.files).toContainEqual({ path: 'sample.test.ts', hash: expectedHash })
  })
})
