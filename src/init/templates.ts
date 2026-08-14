import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type TemplateLanguage = 'en' | 'pt-BR'

/**
 * Walks up from this module's own location to find the package's
 * top-level templates/ directory. A fixed relative "../templates" would
 * break depending on whether this runs from src/init/ (unit tests, one
 * level deeper) or from the single bundled dist/cli.js tsup produces
 * (splitting: false collapses everything to dist/, one level shallower) —
 * walking up avoids hardcoding either depth.
 */
function findTemplatesDir(startDir: string): string {
  let dir = startDir
  while (true) {
    const candidate = join(dir, 'templates')
    if (existsSync(candidate)) return candidate

    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`Could not locate the templates/ directory starting from ${startDir}`)
    }
    dir = parent
  }
}

export function loadTemplate(language: TemplateLanguage): string {
  const templatesDir = findTemplatesDir(dirname(fileURLToPath(import.meta.url)))
  return readFileSync(join(templatesDir, `AGENTS.${language}.md`), 'utf8')
}
