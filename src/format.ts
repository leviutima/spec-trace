import pc from 'picocolors'
import type { CliError } from './cli-error.js'
import type { RuleId, Violation } from './rules-engine.js'
import type { Requirement } from './spec-parser.js'

const ACTIONS: Record<RuleId, (violation: Violation) => string> = {
  'uncovered-requirement': (v) =>
    `Write a test whose describe or it name references "${v.requirementId}".`,
  'orphan-test': () => 'Add the requirement id (REQ-<n>) this test proves to its describe or it name.',
  'unknown-requirement': (v) =>
    `Fix the id in this test's name — "${v.requirementId}" does not exist in the spec, or add the missing requirement.`,
  'skipped-coverage': (v) =>
    `Un-skip or implement the test(s) covering "${v.requirementId}" — a todo/skip is not proof.`,
  'failing-coverage': (v) => `Fix the failing test(s) covering "${v.requirementId}" before merging.`,
  'duplicate-requirement': (v) =>
    `Rename one of the duplicate "${v.requirementId}" headings so each requirement has a unique id.`,
  'weak-test': () => "Strengthen this test's assertions — it matched a weak-test heuristic (see message).",
  'stale-results': () =>
    'Re-run your test suite with the spec-trace reporter configured so results.json reflects the current test files.',
}

export function actionFor(violation: Violation): string {
  return ACTIONS[violation.rule](violation)
}

export interface FormatCliErrorOptions {
  verbose: boolean
}

/**
 * REQ-043: every expected CLI failure prints its message and hint, never a
 * raw stack — the stack only appears with --verbose or DEBUG=spec-trace.
 */
export function formatCliError(error: CliError, options: FormatCliErrorOptions): string {
  const lines = [pc.red(error.message)]
  if (error.hint) lines.push(pc.dim(error.hint))
  if (options.verbose && error.stack) lines.push('', error.stack)
  return lines.join('\n')
}

export function formatJson(violations: Violation[]): string {
  return JSON.stringify(violations, null, 2)
}

export function formatHuman(violations: Violation[]): string {
  const errors = violations.filter((v) => v.severity === 'error')
  const warnings = violations.filter((v) => v.severity === 'warn')
  const lines: string[] = []

  for (const violation of violations) {
    const color = violation.severity === 'error' ? pc.red : pc.yellow
    const location = violation.file
      ? violation.line !== undefined
        ? `${violation.file}:${violation.line}`
        : violation.file
      : undefined

    const parts = [color(`[${violation.severity}]`), pc.bold(violation.rule), violation.message]
    if (location) parts.push(pc.dim(`(${location})`))
    lines.push(parts.join(' '))
  }

  lines.push('')
  lines.push(
    `${errors.length === 1 ? '1 error' : `${errors.length} errors`}, ${warnings.length === 1 ? '1 warning' : `${warnings.length} warnings`}`,
  )

  return lines.join('\n')
}

type RequirementStatus = 'Covered' | 'Uncovered' | 'Skipped only' | 'Failing' | 'Ignored'

function statusFor(requirement: Requirement, violations: Violation[]): RequirementStatus {
  if (requirement.ignored) return 'Ignored'

  const relevant = violations.filter((v) => v.requirementId === requirement.id)
  if (relevant.some((v) => v.rule === 'uncovered-requirement')) return 'Uncovered'
  if (relevant.some((v) => v.rule === 'skipped-coverage')) return 'Skipped only'
  if (relevant.some((v) => v.rule === 'failing-coverage')) return 'Failing'
  return 'Covered'
}

export function formatMarkdownReport(requirements: Requirement[], violations: Violation[]): string {
  const lines: string[] = ['# spec-trace report', '', '## Requirements', '', '| ID | Title | Status |', '| --- | --- | --- |']

  for (const requirement of requirements) {
    lines.push(`| ${requirement.id} | ${requirement.title} | ${statusFor(requirement, violations)} |`)
  }

  lines.push('', '## Violations', '')

  if (violations.length === 0) {
    lines.push('None.')
  } else {
    for (const violation of violations) {
      const location = violation.file
        ? violation.line !== undefined
          ? `${violation.file}:${violation.line}`
          : violation.file
        : 'unknown location'

      lines.push(`### ${violation.rule}${violation.requirementId ? ` — ${violation.requirementId}` : ''}`)
      lines.push('')
      lines.push(`- **Severity:** ${violation.severity}`)
      lines.push(`- **Location:** ${location}`)
      lines.push(`- **Message:** ${violation.message}`)
      lines.push(`- **Action:** ${actionFor(violation)}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}
