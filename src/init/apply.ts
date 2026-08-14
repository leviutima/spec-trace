import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PlanStep } from './plan.js'

function writeFile(cwd: string, path: string, content: string): void {
  const fullPath = join(cwd, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
}

function appendFile(cwd: string, path: string, addition: string, createIfMissing: boolean): void {
  const fullPath = join(cwd, path)
  if (!existsSync(fullPath)) {
    if (!createIfMissing) return
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, addition)
    return
  }

  const existing = readFileSync(fullPath, 'utf8')
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
  writeFileSync(fullPath, existing + separator + addition)
}

function patchScripts(cwd: string, path: string, scripts: Record<string, string>): void {
  const fullPath = join(cwd, path)
  const packageJson = JSON.parse(readFileSync(fullPath, 'utf8')) as Record<string, unknown>
  const existingScripts = (packageJson['scripts'] as Record<string, string> | undefined) ?? {}

  packageJson['scripts'] = { ...existingScripts, ...scripts }
  writeFileSync(fullPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

/** REQ-055: applyPlan is the only function in src/init/ that touches disk — --dry-run never calls it. */
export function applyPlan(cwd: string, steps: PlanStep[]): void {
  for (const step of steps) {
    if (step.kind === 'write' && !step.skipped) {
      writeFile(cwd, step.path, step.content)
    } else if (step.kind === 'append' && !step.skipped) {
      appendFile(cwd, step.path, step.addition, step.createIfMissing)
    } else if (step.kind === 'patch-scripts' && !step.skipped) {
      patchScripts(cwd, step.path, step.scripts)
    }
  }
}
