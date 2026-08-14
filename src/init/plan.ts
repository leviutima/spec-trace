import { relative } from 'node:path'
import type { DetectionResult } from './detect.js'
import { loadTemplate } from './templates.js'

export type PlanStep =
  | { kind: 'write'; path: string; content: string; skipped: boolean; skipReason?: string }
  | { kind: 'append'; path: string; addition: string; createIfMissing: boolean; skipped: boolean; skipReason?: string }
  | { kind: 'patch-scripts'; path: string; scripts: Record<string, string>; skipped: boolean }
  | { kind: 'note'; message: string }

export interface BuildPlanOptions {
  force: boolean
}

const DEFAULT_SCRIPTS: Record<string, string> = {
  verify: 'spec-trace verify',
  report: 'spec-trace report',
  // --passWithNoTests: a project with zero test files yet would otherwise make
  // vitest itself exit 1 before spec-trace ever runs. With it, vitest completes
  // with zero results and spec-trace's own empty-suite rule is what reports the
  // problem — an actionable violation instead of an opaque Vitest failure.
  check: 'vitest run --passWithNoTests && spec-trace verify',
}

const SPECS_README_CONTENT = 'See [AGENTS.md](./AGENTS.md) for this project\'s spec-trace workflow.\n'
const RESULTS_JSON_CONTENT = '{"tests":[]}\n'
const AGENTS_POINTER = '\nSee [specs/AGENTS.md](specs/AGENTS.md) for this project\'s spec-trace workflow.\n'

function vitestConfigContent(): string {
  return (
    "import { defineConfig } from 'vitest/config'\n" +
    "import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'\n\n" +
    'export default defineConfig({\n' +
    '  test: {\n' +
    "    reporters: ['default', new SpecTraceReporter()],\n" +
    '  },\n' +
    '})\n'
  )
}

function reporterSnippet(): string {
  return (
    "import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'\n\n" +
    '// Add SpecTraceReporter to your reporters array:\n' +
    "reporters: ['default', new SpecTraceReporter()],\n"
  )
}

/** REQ-053/REQ-054: skip an already-generated file unless --force is given. */
function writeStep(path: string, content: string, exists: boolean, force: boolean): PlanStep {
  return {
    kind: 'write',
    path,
    content,
    skipped: exists && !force,
    ...(exists ? { skipReason: force ? 'overwritten (--force)' : 'already exists' } : {}),
  }
}

/** REQ-051: .mts for CommonJS (a .ts config would load via require() and break the ESM-only reporter import). */
function vitestConfigPath(detection: DetectionResult): string {
  return detection.moduleType === 'cjs' ? 'vitest.config.mts' : 'vitest.config.ts'
}

function buildVitestConfigStep(detection: DetectionResult): PlanStep {
  if (!detection.existingVitestConfig) {
    return { kind: 'write', path: vitestConfigPath(detection), content: vitestConfigContent(), skipped: false }
  }

  const relativePath = relative(detection.cwd, detection.existingVitestConfig.path)
  if (detection.existingVitestConfig.hasReporter) {
    return { kind: 'note', message: `${relativePath} already has the spec-trace reporter configured.` }
  }

  return {
    kind: 'note',
    message:
      `${relativePath} exists but does not reference the spec-trace reporter. Add this:\n\n` +
      reporterSnippet(),
  }
}

function buildScriptsStep(detection: DetectionResult): PlanStep {
  const missing = Object.fromEntries(
    Object.entries(DEFAULT_SCRIPTS).filter(([name]) => !(name in detection.scripts)),
  )

  if (Object.keys(missing).length === 0) {
    return { kind: 'note', message: 'package.json already has verify, report, and check scripts.' }
  }

  return { kind: 'patch-scripts', path: 'package.json', scripts: missing, skipped: false }
}

function buildAgentsPointerStep(detection: DetectionResult): PlanStep {
  if (!detection.agentsFilePath) {
    return {
      kind: 'note',
      message:
        'No AGENTS.md or CLAUDE.md found at the project root — consider adding one that points at ' +
        'specs/AGENTS.md.',
    }
  }

  const relativePath = relative(detection.cwd, detection.agentsFilePath)
  if (detection.agentsFileHasPointer) {
    return { kind: 'note', message: `${relativePath} already points at specs/AGENTS.md.` }
  }

  return {
    kind: 'append',
    path: relativePath,
    addition: AGENTS_POINTER,
    createIfMissing: false,
    skipped: false,
  }
}

/** REQ-052–REQ-060: pure — reads no filesystem, only the DetectionResult already gathered. */
export function buildPlan(detection: DetectionResult, options: BuildPlanOptions): PlanStep[] {
  const { force } = options

  return [
    writeStep('specs/AGENTS.md', loadTemplate(detection.language), detection.specsAgentsExists, force),
    writeStep('specs/README.md', SPECS_README_CONTENT, detection.specsReadmeExists, force),
    writeStep('test/.gitkeep', '', detection.testGitkeepExists, false),
    writeStep('.spec-trace/results.json', RESULTS_JSON_CONTENT, detection.resultsJsonExists, force),
    buildVitestConfigStep(detection),
    {
      kind: 'append',
      path: '.gitignore',
      addition: '.spec-trace/\n',
      createIfMissing: !detection.gitignoreExists,
      skipped: detection.gitignoreHasEntry,
      ...(detection.gitignoreHasEntry ? { skipReason: 'already ignored' } : {}),
    },
    buildScriptsStep(detection),
    buildAgentsPointerStep(detection),
  ]
}
