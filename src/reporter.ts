import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type { File, Reporter, Task, Vitest } from 'vitest'

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'todo'

export interface TestResult {
  name: string
  file: string
  status: TestStatus
}

export interface ResultsFile {
  generatedAt: string
  tests: TestResult[]
}

export interface SpecTraceReporterOptions {
  outputFile?: string
}

const DEFAULT_OUTPUT_FILE = '.spec-trace/results.json'

/**
 * Writes `.spec-trace/results.json` after a Vitest run, recording the full
 * describe/it name chain for every test alongside its real status. Skipped
 * and todo tests are kept as such — never silently promoted to "covered".
 */
export class SpecTraceReporter implements Reporter {
  private root = process.cwd()
  private readonly outputFile: string

  constructor(options: SpecTraceReporterOptions = {}) {
    this.outputFile = options.outputFile ?? DEFAULT_OUTPUT_FILE
  }

  onInit(ctx: Vitest): void {
    this.root = ctx.config.root
  }

  onFinished(files: File[] = []): void {
    const tests = files.flatMap((file) => {
      // Recorded relative to the project root (POSIX-style, even on
      // Windows) so results.json is portable and reads the same as the
      // file paths a user would type in their own terminal.
      const relativePath = relative(this.root, file.filepath).split('\\').join('/')
      return file.tasks.flatMap((task) => collectTestResults(task, relativePath, []))
    })

    const payload: ResultsFile = { generatedAt: new Date().toISOString(), tests }
    const outputPath = isAbsolute(this.outputFile) ? this.outputFile : join(this.root, this.outputFile)

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)
  }
}

export function collectTestResults(task: Task, file: string, ancestors: string[]): TestResult[] {
  if (task.type === 'suite') {
    const chain = task.name ? [...ancestors, task.name] : ancestors
    return task.tasks.flatMap((child) => collectTestResults(child, file, chain))
  }

  if (task.type === 'test') {
    const name = [...ancestors, task.name].filter(Boolean).join(' > ')
    return [{ name, file, status: resolveStatus(task) }]
  }

  return []
}

function resolveStatus(task: Task): TestStatus {
  if (task.mode === 'skip') return 'skipped'
  if (task.mode === 'todo') return 'todo'

  const state = task.result?.state
  if (state === 'pass') return 'passed'
  if (state === 'fail') return 'failed'
  return 'skipped'
}
