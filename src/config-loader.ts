import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type TSStatic from 'typescript'
import type { SpecTraceConfig, SpecTraceUserConfig } from './config.js'

export class InvalidIdPatternError extends Error {}
export class TypeScriptNotAvailableError extends Error {}

export const DEFAULT_CONFIG: SpecTraceConfig = {
  specDir: 'specs',
  resultsFile: '.spec-trace/results.json',
  idPattern: 'REQ-\\d+',
  testMatch: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
  testIgnore: [],
  rules: {},
  ignore: [],
}

const DEFAULT_CONFIG_FILE_NAMES = ['spec-trace.config.ts', 'spec-trace.config.js', 'spec-trace.config.mjs']

/**
 * Resolves spec-trace.config.ts (or an explicit --config path) and merges
 * it with the built-in defaults. Works with no config file at all.
 */
export async function loadConfig(
  configPathOverride?: string,
  cwd: string = process.cwd(),
): Promise<SpecTraceConfig> {
  const resolvedPath = configPathOverride
    ? resolve(cwd, configPathOverride)
    : findDefaultConfigFile(cwd)

  if (!resolvedPath) return DEFAULT_CONFIG

  const userConfig = await importConfigFile(resolvedPath)

  const merged: SpecTraceConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    rules: { ...DEFAULT_CONFIG.rules, ...userConfig.rules },
    ignore: userConfig.ignore ?? DEFAULT_CONFIG.ignore,
  }

  assertValidIdPattern(merged.idPattern)

  return merged
}

function assertValidIdPattern(idPattern: string): void {
  try {
    new RegExp(idPattern)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new InvalidIdPatternError(`Invalid "idPattern" in spec-trace config: "${idPattern}" (${reason})`)
  }
}

function findDefaultConfigFile(cwd: string): string | undefined {
  for (const name of DEFAULT_CONFIG_FILE_NAMES) {
    const candidate = join(cwd, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

async function importConfigFile(filePath: string): Promise<SpecTraceUserConfig> {
  if (!filePath.endsWith('.ts')) {
    const mod: unknown = await import(pathToFileURL(filePath).href)
    return unwrapDefault(mod)
  }

  const ts = await loadTypeScriptOrThrow(filePath)

  const source = readFileSync(filePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  // Written next to the original config file (not os.tmpdir()) so relative
  // imports and node_modules resolution behave exactly as they would for
  // the real file.
  const tempFile = join(dirname(filePath), `.spec-trace.config.${process.pid}.${Date.now()}.mjs`)
  writeFileSync(tempFile, transpiled)

  try {
    const mod: unknown = await import(pathToFileURL(tempFile).href)
    return unwrapDefault(mod)
  } finally {
    rmSync(tempFile, { force: true })
  }
}

async function loadTypeScriptOrThrow(configFilePath: string): Promise<typeof TSStatic> {
  try {
    const mod: unknown = await import('typescript')
    return ((mod as { default?: typeof TSStatic }).default ?? mod) as typeof TSStatic
  } catch {
    throw new TypeScriptNotAvailableError(
      `Cannot load "${configFilePath}": typescript is not installed. It's an optional ` +
        'peerDependency, needed only to load a .ts config file — install it, or use a ' +
        '.js/.mjs spec-trace config instead.',
    )
  }
}

function unwrapDefault(mod: unknown): SpecTraceUserConfig {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: SpecTraceUserConfig }).default
  }
  return mod as SpecTraceUserConfig
}
