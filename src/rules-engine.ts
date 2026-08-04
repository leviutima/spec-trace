import type { SpecTraceRuleConfig } from './config.js'
import type { TestFileFingerprint, TestResult } from './reporter.js'
import type { Requirement } from './spec-parser.js'

export type RuleId = keyof SpecTraceRuleConfig
export type Severity = 'error' | 'warn' | 'off'

export interface Violation {
  rule: RuleId
  severity: Exclude<Severity, 'off'>
  message: string
  requirementId?: string
  file?: string
  line?: number
}

export interface FileState {
  recorded: TestFileFingerprint[]
  onDisk: TestFileFingerprint[]
}

export interface CheckRulesOptions {
  rules?: SpecTraceRuleConfig
  ignore?: string[]
  fileState?: FileState
  idPattern?: string
}

const DEFAULT_SEVERITIES: Required<SpecTraceRuleConfig> = {
  'uncovered-requirement': 'error',
  'orphan-test': 'warn',
  'unknown-requirement': 'error',
  'skipped-coverage': 'error',
  'failing-coverage': 'error',
  'duplicate-requirement': 'error',
  'weak-test': 'warn',
  'stale-results': 'error',
}

const DEFAULT_ID_PATTERN = 'REQ-\\d+'

/**
 * Pure comparison between what the spec demands and what the test run
 * proved. No filesystem access, no formatting — that belongs to the CLI.
 */
export function checkRules(
  requirements: Requirement[],
  tests: TestResult[],
  options: CheckRulesOptions = {},
): Violation[] {
  const severities: Required<SpecTraceRuleConfig> = { ...DEFAULT_SEVERITIES, ...options.rules }
  const ignoreIds = new Set(options.ignore ?? [])
  const idTokenRegex = new RegExp(options.idPattern ?? DEFAULT_ID_PATTERN, 'g')
  const violations: Violation[] = []

  const emit = (violation: Omit<Violation, 'severity'>): void => {
    const severity = severities[violation.rule]
    if (severity === 'off') return
    violations.push({ ...violation, severity })
  }

  const byId = new Map<string, Requirement[]>()
  for (const requirement of requirements) {
    const group = byId.get(requirement.id)
    if (group) group.push(requirement)
    else byId.set(requirement.id, [requirement])
  }

  for (const [id, group] of byId) {
    if (group.length > 1) {
      const locations = group.map((r) => `${r.file}:${r.line}`).join(', ')
      emit({
        rule: 'duplicate-requirement',
        requirementId: id,
        message: `Requirement "${id}" is declared ${group.length} times: ${locations}`,
      })
    }
  }

  const knownIds = new Set(byId.keys())
  const coverage = new Map<string, TestResult[]>()

  for (const testResult of tests) {
    const ids = extractRequirementIds(testResult.name, idTokenRegex)

    if (ids.length === 0) {
      emit({
        rule: 'orphan-test',
        file: testResult.file,
        message: `Test "${testResult.name}" does not reference any requirement id`,
      })
      continue
    }

    for (const id of ids) {
      if (!knownIds.has(id)) {
        emit({
          rule: 'unknown-requirement',
          requirementId: id,
          file: testResult.file,
          message: `Test "${testResult.name}" references unknown requirement "${id}"`,
        })
        continue
      }

      const covering = coverage.get(id)
      if (covering) covering.push(testResult)
      else coverage.set(id, [testResult])
    }
  }

  for (const [id, group] of byId) {
    const requirement = group[0]
    if (!requirement) continue
    if (requirement.ignored || ignoreIds.has(id)) continue

    const covering = coverage.get(id) ?? []

    if (covering.length === 0) {
      emit({
        rule: 'uncovered-requirement',
        requirementId: id,
        file: requirement.file,
        line: requirement.line,
        message: `Requirement "${id}" (${requirement.title}) has no test covering it`,
      })
      continue
    }

    if (covering.every((testResult) => testResult.status === 'skipped' || testResult.status === 'todo')) {
      emit({
        rule: 'skipped-coverage',
        requirementId: id,
        file: requirement.file,
        line: requirement.line,
        message: `Requirement "${id}" is only covered by skipped or todo tests`,
      })
      continue
    }

    if (covering.some((testResult) => testResult.status === 'failed')) {
      emit({
        rule: 'failing-coverage',
        requirementId: id,
        file: requirement.file,
        line: requirement.line,
        message: `Requirement "${id}" has failing tests`,
      })
    }
  }

  if (options.fileState) {
    checkStaleResults(options.fileState, emit)
  }

  return violations
}

function checkStaleResults(fileState: FileState, emit: (violation: Omit<Violation, 'severity'>) => void): void {
  const recordedByPath = new Map(fileState.recorded.map((f) => [f.path, f.hash]))
  const onDiskByPath = new Map(fileState.onDisk.map((f) => [f.path, f.hash]))

  for (const [path] of recordedByPath) {
    if (!onDiskByPath.has(path)) {
      emit({
        rule: 'stale-results',
        file: path,
        message: `Test file "${path}" recorded in results.json no longer exists`,
      })
    }
  }

  for (const [path, recordedHash] of recordedByPath) {
    const diskHash = onDiskByPath.get(path)
    if (diskHash !== undefined && diskHash !== recordedHash) {
      emit({
        rule: 'stale-results',
        file: path,
        message: `Test file "${path}" changed after the last run`,
      })
    }
  }

  for (const [path] of onDiskByPath) {
    if (!recordedByPath.has(path)) {
      emit({
        rule: 'stale-results',
        file: path,
        message: `Test file "${path}" was never executed`,
      })
    }
  }
}

function extractRequirementIds(text: string, idTokenRegex: RegExp): string[] {
  return Array.from(new Set(text.match(idTokenRegex) ?? []))
}
