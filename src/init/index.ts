import { applyPlan } from './apply.js'
import { describeStep } from './describe.js'
import { detect } from './detect.js'
import { buildPlan } from './plan.js'

export interface InitOptions {
  lang?: string | undefined
  dryRun?: boolean | undefined
  force?: boolean | undefined
}

export { PackageJsonNotFoundError } from './detect.js'

/** Orchestrates detect → plan → (apply unless --dry-run), returning lines to print. */
export function runInit(cwd: string, options: InitOptions = {}): string[] {
  const detection = detect(cwd, { lang: options.lang })
  const steps = buildPlan(detection, { force: Boolean(options.force) })

  if (!options.dryRun) {
    applyPlan(cwd, steps)
  }

  return steps.map((step) => describeStep(step, { dryRun: Boolean(options.dryRun) }))
}
