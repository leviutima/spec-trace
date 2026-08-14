import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { CliError } from './cli-error.js'
import type { SpecTraceConfig } from './config.js'
import type { ResultsFile, TestFileFingerprint } from './reporter.js'
import { checkRules, type Severity, type Violation } from './rules-engine.js'
import { parseSpecs, type Requirement } from './spec-parser.js'
import { detectWeakTests } from './weak-test-detector.js'

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.spec-trace', 'coverage'])
const BOM = '﻿'

export class ResultsFileNotFoundError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { code: 'RESULTS_FILE_NOT_FOUND', hint })
  }
}

export class SpecDirNotFoundError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { code: 'SPEC_DIR_NOT_FOUND', hint })
  }
}

export class ResultsJsonParseError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { code: 'RESULTS_JSON_PARSE_ERROR', hint })
  }
}

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
  const requirements = parseSpecs(specDir, config.idPattern)

  const resultsPath = resolve(cwd, config.resultsFile)
  if (!existsSync(resultsPath)) {
    throw new ResultsFileNotFoundError(
      `Results file not found at ${resultsPath}. Run your test suite with the spec-trace ` +
        'reporter configured (see @leviutima/spec-trace/reporter) before running verify.',
    )
  }

  const resultsFile = parseResultsFile(resultsPath)

  const ruleViolations = checkRules(requirements, resultsFile.tests, {
    rules: config.rules,
    ignore: config.ignore,
    idPattern: config.idPattern,
    fileState: {
      recorded: reconcileRecordedFiles(resultsFile),
      onDisk: findTestFilesOnDisk(cwd, config.testMatch, config.testIgnore),
    },
  })

  const weakTestSeverity = config.rules['weak-test'] ?? 'warn'
  const weakTestViolations =
    weakTestSeverity === 'off' ? [] : await findWeakTestViolations(resultsFile, cwd, weakTestSeverity)

  return { requirements, violations: [...ruleViolations, ...weakTestViolations] }
}

/**
 * PowerShell's default UTF-8 file writes add a BOM, which JSON.parse
 * rejects outright — stripped unconditionally here since a BOM is never
 * meaningful JSON content. If the file still doesn't parse after that
 * (hand-edited, truncated, or genuinely corrupt), the raw SyntaxError is
 * wrapped so it never surfaces as an unformatted stack trace to the user.
 */
function parseResultsFile(resultsPath: string): ResultsFile {
  const raw = readFileSync(resultsPath, 'utf8')
  const content = raw.startsWith(BOM) ? raw.slice(BOM.length) : raw

  try {
    return JSON.parse(content) as ResultsFile
  } catch {
    throw new ResultsJsonParseError(
      `Could not parse ${resultsPath} as JSON.`,
      'The file is likely corrupt or was hand-edited — a byte-order-mark added by ' +
        'PowerShell when creating the file on Windows is a common cause. Delete it and ' +
        're-run your test suite with the spec-trace reporter configured to regenerate it.',
    )
  }
}

/**
 * A results.json a reporter actually wrote always has a `files` entry for
 * every file its `tests` reference. One that doesn't — an old-format file
 * from before this fingerprinting existed, or one hand-crafted by an agent
 * trying to fake a clean run — gets every such file synthesized in here
 * with a hash that can never match real content, so stale-results still
 * catches it as either "deleted" (absent from disk) or "modified"
 * (present with any real hash) instead of silently passing.
 */
function reconcileRecordedFiles(resultsFile: ResultsFile): TestFileFingerprint[] {
  const recorded = resultsFile.files ?? []
  const knownPaths = new Set(recorded.map((f) => f.path))
  const unfingerprinted: TestFileFingerprint[] = []

  for (const test of resultsFile.tests) {
    if (!knownPaths.has(test.file)) {
      knownPaths.add(test.file)
      unfingerprinted.push({ path: test.file, hash: '' })
    }
  }

  return [...recorded, ...unfingerprinted]
}

/**
 * Walks the project directory looking for files matching testMatch, so
 * stale-results can tell a fresh run from a hand-edited or outdated
 * results.json. Not a general glob engine — testMatch patterns are
 * limited to the "**\/<suffix>" shape (e.g. "**\/*.test.ts"), matched
 * against each file's own name. Deliberately no glob dependency for this.
 * testIgnore is a plain path-prefix exclusion (also not a glob) for
 * directories that legitimately contain *.test.ts-named files that are
 * never meant to run directly — this project's own test/fixtures/ being
 * the example that surfaced the need for it.
 */
function findTestFilesOnDisk(root: string, testMatch: string[], testIgnore: string[]): TestFileFingerprint[] {
  const results: TestFileFingerprint[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      const relativePath = relative(root, fullPath).split('\\').join('/')

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || isIgnoredPath(relativePath, testIgnore)) continue
        walk(fullPath)
      } else if (entry.isFile() && matchesAnyPattern(entry.name, testMatch) && !isIgnoredPath(relativePath, testIgnore)) {
        results.push({
          path: relativePath,
          hash: createHash('sha256').update(readFileSync(fullPath)).digest('hex'),
        })
      }
    }
  }

  walk(root)
  return results
}

function isIgnoredPath(relativePath: string, testIgnore: string[]): boolean {
  return testIgnore.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`))
}

function matchesAnyPattern(fileName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(fileName, pattern))
}

function matchesPattern(fileName: string, pattern: string): boolean {
  if (!pattern.startsWith('**/')) return fileName === pattern
  const rest = pattern.slice(3)
  return rest.startsWith('*') ? fileName.endsWith(rest.slice(1)) : fileName === rest
}

/**
 * typescript is an optional peerDependency (only detectWeakTests touches
 * it). When it can't be loaded, detectWeakTests returns undefined instead
 * of throwing — this emits exactly one weak-test-unavailable violation
 * for the whole run, not one per file, and stops scanning further files.
 */
async function findWeakTestViolations(
  resultsFile: ResultsFile,
  cwd: string,
  severity: Exclude<Severity, 'off'>,
): Promise<Violation[]> {
  const testFiles = Array.from(new Set(resultsFile.tests.map((t) => t.file)))
  const violations: Violation[] = []

  for (const file of testFiles) {
    const absolutePath = isAbsolute(file) ? file : resolve(cwd, file)
    if (!existsSync(absolutePath)) continue

    const source = readFileSync(absolutePath, 'utf8')
    const findings = await detectWeakTests(file, source)

    if (findings === undefined) {
      violations.push({
        rule: 'weak-test',
        severity,
        message:
          'weak-test-unavailable: typescript is not installed, so test files could not be statically ' +
          'analyzed. Install typescript (it is an optional peerDependency) to enable this check.',
      })
      break
    }

    for (const finding of findings) {
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
