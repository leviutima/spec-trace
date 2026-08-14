import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CliError } from '../cli-error.js'
import type { TemplateLanguage } from './templates.js'

export class PackageJsonNotFoundError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, { code: 'PACKAGE_JSON_NOT_FOUND', hint })
  }
}

const VITEST_CONFIG_CANDIDATES = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.cts',
  'vitest.config.js',
  'vitest.config.mjs',
  'vitest.config.cjs',
]

export interface ExistingVitestConfig {
  path: string
  hasReporter: boolean
}

export interface DetectionResult {
  cwd: string
  language: TemplateLanguage
  moduleType: 'esm' | 'cjs'
  scripts: Record<string, string>
  existingVitestConfig: ExistingVitestConfig | undefined
  specsAgentsExists: boolean
  specsReadmeExists: boolean
  testGitkeepExists: boolean
  resultsJsonExists: boolean
  gitignoreExists: boolean
  gitignoreHasEntry: boolean
  agentsFilePath: string | undefined
  agentsFileHasPointer: boolean
}

export interface DetectOptions {
  lang?: string | undefined
}

const AGENTS_POINTER_MARKER = 'specs/AGENTS.md'

export function resolveLanguage(langFlag: string | undefined): TemplateLanguage {
  if (langFlag) return langFlag.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'

  const locale = Intl.DateTimeFormat().resolvedOptions().locale
  return locale.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

/** REQ-050: init needs an existing npm project to scaffold into. */
function readPackageJson(cwd: string): { path: string; content: Record<string, unknown> } {
  const path = join(cwd, 'package.json')
  if (!existsSync(path)) {
    throw new PackageJsonNotFoundError(
      `No package.json found at ${cwd}.`,
      'spec-trace init scaffolds npm scripts and needs an existing npm project — run "npm init" ' +
        '(or your package manager\'s equivalent) first, then re-run "spec-trace init".',
    )
  }
  return { path, content: JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> }
}

function detectExistingVitestConfig(cwd: string): ExistingVitestConfig | undefined {
  for (const candidate of VITEST_CONFIG_CANDIDATES) {
    const path = join(cwd, candidate)
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8')
      return {
        path,
        hasReporter: content.includes('spec-trace/reporter') || content.includes('SpecTraceReporter'),
      }
    }
  }
  return undefined
}

function detectAgentsFile(cwd: string): { path: string | undefined; hasPointer: boolean } {
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const path = join(cwd, name)
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf8')
      return { path, hasPointer: content.includes(AGENTS_POINTER_MARKER) }
    }
  }
  return { path: undefined, hasPointer: false }
}

export function detect(cwd: string, options: DetectOptions = {}): DetectionResult {
  const { content: packageJson } = readPackageJson(cwd)
  const scripts = (packageJson['scripts'] as Record<string, string> | undefined) ?? {}
  const moduleType = packageJson['type'] === 'module' ? 'esm' : 'cjs'

  const agentsFile = detectAgentsFile(cwd)
  const gitignorePath = join(cwd, '.gitignore')
  const gitignoreExists = existsSync(gitignorePath)

  return {
    cwd,
    language: resolveLanguage(options.lang),
    moduleType,
    scripts,
    existingVitestConfig: detectExistingVitestConfig(cwd),
    specsAgentsExists: existsSync(join(cwd, 'specs', 'AGENTS.md')),
    specsReadmeExists: existsSync(join(cwd, 'specs', 'README.md')),
    testGitkeepExists: existsSync(join(cwd, 'test', '.gitkeep')),
    resultsJsonExists: existsSync(join(cwd, '.spec-trace', 'results.json')),
    gitignoreExists,
    gitignoreHasEntry: gitignoreExists && readFileSync(gitignorePath, 'utf8').includes('.spec-trace'),
    agentsFilePath: agentsFile.path,
    agentsFileHasPointer: agentsFile.hasPointer,
  }
}
