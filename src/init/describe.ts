import type { PlanStep } from './plan.js'

export interface DescribeStepOptions {
  dryRun: boolean
}

export function describeStep(step: PlanStep, options: DescribeStepOptions): string {
  const { dryRun } = options

  if (step.kind === 'write') {
    if (step.skipped) return `Skipped ${step.path} (${step.skipReason})`
    return `${dryRun ? 'Would create' : 'Created'} ${step.path}`
  }

  if (step.kind === 'append') {
    if (step.skipped) return `Skipped ${step.path} (${step.skipReason})`
    return `${dryRun ? 'Would update' : 'Updated'} ${step.path}`
  }

  if (step.kind === 'patch-scripts') {
    const names = Object.keys(step.scripts).join(', ')
    return `${dryRun ? 'Would add' : 'Added'} npm scripts to package.json: ${names}`
  }

  return step.message
}
