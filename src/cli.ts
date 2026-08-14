#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineCommand, runMain } from 'citty'
import pc from 'picocolors'
import { filterBaselined, readBaseline, writeBaseline } from './baseline.js'
import { CliError } from './cli-error.js'
import { loadConfig } from './config-loader.js'
import { formatCliError, formatHuman, formatJson, formatMarkdownReport } from './format.js'
import type { Violation } from './rules-engine.js'
import type { Requirement } from './spec-parser.js'
import { gatherResults } from './verify-pipeline.js'

const configArg = {
  type: 'string',
  description: 'Path to a config file (defaults to spec-trace.config.ts/js in the current directory)',
} as const

const verboseArg = {
  type: 'boolean',
  description: 'Show the full stack trace for CLI errors instead of just the message and hint',
} as const

function isVerbose(verboseFlag: boolean | undefined): boolean {
  return Boolean(verboseFlag) || process.env['DEBUG'] === 'spec-trace'
}

interface GatherOrExit {
  requirements: Requirement[]
  violations: Violation[]
}

async function gatherOrExit(
  configPath: string | undefined,
  verbose: boolean,
): Promise<GatherOrExit | undefined> {
  try {
    const config = await loadConfig(configPath || undefined, process.cwd())
    return await gatherResults(config, process.cwd())
  } catch (error) {
    if (error instanceof CliError) {
      console.error(formatCliError(error, { verbose }))
      process.exitCode = 1
      return undefined
    }
    throw error
  }
}

const verify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Check that every requirement is covered and every test is honest',
  },
  args: {
    json: { type: 'boolean', description: 'Shorthand for --reporter json' },
    markdown: { type: 'string', description: 'Also write a markdown report to this path' },
    reporter: { type: 'string', description: 'Output format: human or json', default: 'human' },
    config: configArg,
    'fail-on': {
      type: 'string',
      description: 'Minimum severity that causes a non-zero exit code: error or warn',
      default: 'error',
    },
    baseline: {
      type: 'boolean',
      description: 'Record the current violations as a baseline; future runs only fail on new ones',
    },
    verbose: verboseArg,
  },
  async run({ args }) {
    const verbose = isVerbose(args.verbose)
    const gathered = await gatherOrExit(args.config, verbose)
    if (!gathered) return

    const { requirements } = gathered
    const cwd = process.cwd()

    if (args.baseline) {
      writeBaseline(cwd, gathered.violations)
    }

    const violations = args.baseline
      ? gathered.violations
      : filterBaselined(gathered.violations, readBaseline(cwd))

    if (args.markdown) {
      const markdownPath = resolve(cwd, args.markdown)
      mkdirSync(dirname(markdownPath), { recursive: true })
      writeFileSync(markdownPath, formatMarkdownReport(requirements, violations))
    }

    const useJson = args.json || args.reporter === 'json'
    console.log(useJson ? formatJson(requirements, violations) : formatHuman(requirements, violations))

    if (args.baseline) {
      process.exitCode = 0
      return
    }

    const failOnWarn = args['fail-on'] === 'warn'
    const hasError = violations.some((v) => v.severity === 'error')
    const hasWarning = violations.some((v) => v.severity === 'warn')
    const shouldFail = failOnWarn ? hasError || hasWarning : hasError

    process.exitCode = shouldFail ? 1 : 0
  },
})

const report = defineCommand({
  meta: {
    name: 'report',
    description: 'Generate an agent-readable coverage report at .spec-trace/report.md',
  },
  args: {
    config: configArg,
    verbose: verboseArg,
  },
  async run({ args }) {
    const gathered = await gatherOrExit(args.config, isVerbose(args.verbose))
    if (!gathered) return

    const { requirements, violations } = gathered

    const outputPath = resolve(process.cwd(), '.spec-trace', 'report.md')
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, formatMarkdownReport(requirements, violations))

    console.log(pc.green(`Report written to ${outputPath}`))
  },
})

const mutate = defineCommand({
  meta: {
    name: 'mutate',
    description: 'Mutation testing (not implemented yet — see the roadmap in the README)',
  },
  run() {
    console.log(pc.yellow('spec-trace mutate is not implemented yet. See the roadmap in the README.'))
  },
})

const main = defineCommand({
  meta: {
    name: 'spec-trace',
    description: 'The judge that checks whether your tests actually prove the spec',
  },
  subCommands: { verify, report, mutate },
})

void runMain(main)
