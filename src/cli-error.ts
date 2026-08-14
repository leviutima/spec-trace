export interface CliErrorOptions {
  code: string
  hint?: string | undefined
}

/**
 * Base class for every expected, user-actionable CLI failure. gatherOrExit
 * in cli.ts catches this (and only this) to print a short message + hint
 * instead of a raw stack trace — see REQ-043.
 */
export class CliError extends Error {
  readonly code: string
  readonly hint: string | undefined

  constructor(message: string, options: CliErrorOptions) {
    super(message)
    this.name = new.target.name
    this.code = options.code
    this.hint = options.hint
  }
}
