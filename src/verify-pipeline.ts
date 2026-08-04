import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { SpecTraceConfig } from './config.js'
import type { ResultsFile } from './reporter.js'
import { checkRules, type Severity, type Violation } from './rules-engine.js'
import { parseSpecs, type Requirement } from './spec-parser.js'
import { detectWeakTests } from './weak-test-detector.js'

export class ResultsFileNotFoundError extends Error {}
export class SpecDirNotFoundError extends Error {}

export interface GatherResultsOutput {
  requirements: Requirement[]
  violations: Violation[]
}

/**
 * Orchestrates the I/O: parses specs, reads the reporter's results file, and
 * (unless disabled) statically scans the test files that actually ran for
 * weak-test findings. All the real rule logic lives in checkRules and
 * detectWeakTests — this just wires them together with the filesystem.
 */
export async function gatherResults(
  config: SpecTraceConfig,
  cwd: string = process.cwd(),
): Promise<GatherResultsOutput> {
  const specDir = resolve(cwd, config.specDir)
  if (!existsSync(specDir)) {
    throw new SpecDirNotFoundError(
      `Spec directory not found at ${specDir}. Create it (or point "specDir" in your ` +
        'spec-trace config at the right place) and add at least one requirement before running verify.',
    )
  }
  const requirements = parseSpecs(specDir)

  const resultsPath = resolve(cwd, config.resultsFile)
  if (!existsSync(resultsPath)) {
    throw new ResultsFileNotFoundError(
      `Results file not found at ${resultsPath}. Run your test suite with the spec-trace ` +
        'reporter configured (see @leviutima/spec-trace/reporter) before running verify.',
    )
  }

  const resultsFile = JSON.parse(readFileSync(resultsPath, 'utf8')) as ResultsFile

  const ruleViolations = checkRules(requirements, resultsFile.tests, {
    rules: config.rules,
    ignore: config.ignore,
  })

  const weakTestSeverity = config.rules['weak-test'] ?? 'warn'
  const weakTestViolations =
    weakTestSeverity === 'off' ? [] : findWeakTestViolations(resultsFile, cwd, weakTestSeverity)

  return { requirements, violations: [...ruleViolations, ...weakTestViolations] }
}

function findWeakTestViolations(
  resultsFile: ResultsFile,
  cwd: string,
  severity: Exclude<Severity, 'off'>,
): Violation[] {
  const testFiles = Array.from(new Set(resultsFile.tests.map((t) => t.file)))
  const violations: Violation[] = []

  for (const file of testFiles) {
    const absolutePath = isAbsolute(file) ? file : resolve(cwd, file)
    if (!existsSync(absolutePath)) continue

    const source = readFileSync(absolutePath, 'utf8')
    for (const finding of detectWeakTests(file, source)) {
      violations.push({
        rule: 'weak-test',
        severity,
        message: `Test "${finding.name}" looks weak: ${finding.reasons.join(', ')}`,
        file: finding.file,
        line: finding.line,
      })
    }
  }

  return violations
}
