import { describe, expect, it } from 'vitest'
import { CliError } from '../src/cli-error.js'
import { formatCliError } from '../src/format.js'

class ExampleError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { code: 'EXAMPLE', hint })
  }
}

describe('[REQ-043] CliError', () => {
  it('carries code, message, and an optional hint', () => {
    const error = new ExampleError('something went wrong', 'try this instead')
    expect(error.message).toBe('something went wrong')
    expect(error.code).toBe('EXAMPLE')
    expect(error.hint).toBe('try this instead')
    expect(error.name).toBe('ExampleError')
  })

  it('leaves hint undefined when none is given', () => {
    const error = new ExampleError('something went wrong')
    expect(error.hint).toBeUndefined()
  })
})

describe('[REQ-043] formatCliError', () => {
  it('prints only the message when there is no hint and not verbose', () => {
    const error = new ExampleError('results.json not found')
    const output = formatCliError(error, { verbose: false })

    expect(output).toContain('results.json not found')
    expect(output).not.toContain('at ')
  })

  it('prints the hint on its own line when present', () => {
    const error = new ExampleError('results.json not found', 'run your test suite first')
    const output = formatCliError(error, { verbose: false })

    expect(output).toContain('results.json not found')
    expect(output).toContain('run your test suite first')
  })

  it('never prints the stack trace unless verbose is true', () => {
    const error = new ExampleError('boom')
    const output = formatCliError(error, { verbose: false })

    expect(output).not.toContain(error.stack)
  })

  it('prints the stack trace when verbose is true', () => {
    const error = new ExampleError('boom')
    const output = formatCliError(error, { verbose: true })

    expect(output).toContain('ExampleError: boom')
  })
})
