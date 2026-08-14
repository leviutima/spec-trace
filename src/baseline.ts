import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Violation } from './rules-engine.js'

export interface BaselineFile {
  generatedAt: string
  violations: string[]
}

const DEFAULT_BASELINE_FILE = '.spec-trace/baseline.json'

/**
 * A stable identity for a violation, used to tell "already known" apart
 * from "new" across runs. Line number is deliberately excluded — an
 * unrelated edit a few lines above a baselined violation shouldn't
 * silently un-baseline it (REQ-048).
 */
export function fingerprint(violation: Violation): string {
  const key = JSON.stringify([violation.rule, violation.requirementId, violation.file, violation.message])
  return createHash('sha256').update(key).digest('hex')
}

export function baselinePath(cwd: string, path: string = DEFAULT_BASELINE_FILE): string {
  return resolve(cwd, path)
}

/** REQ-047: --baseline snapshots the current violations verbatim. */
export function writeBaseline(cwd: string, violations: Violation[], path?: string): void {
  const outputPath = baselinePath(cwd, path)
  const payload: BaselineFile = {
    generatedAt: new Date().toISOString(),
    violations: violations.map(fingerprint),
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
}

/** REQ-049: absence of a baseline file is a valid, inert state — not an error. */
export function readBaseline(cwd: string, path?: string): BaselineFile | undefined {
  const inputPath = baselinePath(cwd, path)
  if (!existsSync(inputPath)) return undefined
  return JSON.parse(readFileSync(inputPath, 'utf8')) as BaselineFile
}

/** REQ-048: violations already recorded in the baseline are filtered out. */
export function filterBaselined(violations: Violation[], baseline: BaselineFile | undefined): Violation[] {
  if (!baseline) return violations
  const known = new Set(baseline.violations)
  return violations.filter((v) => !known.has(fingerprint(v)))
}
