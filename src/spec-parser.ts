import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

export interface Requirement {
  id: string
  title: string
  body: string
  file: string
  line: number
  ignored: boolean
}

export class SpecParseError extends Error {}

interface HeadingLine {
  level: number
  text: string
  line: number
}

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/
const DEFAULT_ID_PATTERN = 'REQ-\\d+'
const IGNORE_MARKER = '<!-- spec-trace:ignore -->'
const MIN_REQUIREMENT_LEVEL = 2
const MAX_REQUIREMENT_LEVEL = 6

export function parseSpecs(dir: string, idPattern: string = DEFAULT_ID_PATTERN): Requirement[] {
  const idRegex = new RegExp(`^(${idPattern})\\b`)
  const requirements = findMarkdownFiles(dir).flatMap((file) => parseFile(file, idRegex))
  assertNoDuplicates(requirements)
  return requirements
}

function findMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath))
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(fullPath)
    }
  }

  return files.sort()
}

function parseFile(file: string, idRegex: RegExp): Requirement[] {
  const lines = readFileSync(file, 'utf8').split('\n')
  const headings = collectHeadings(lines)

  const requirements: Requirement[] = []

  for (const [index, heading] of headings.entries()) {
    if (heading.level < MIN_REQUIREMENT_LEVEL || heading.level > MAX_REQUIREMENT_LEVEL) continue

    const idMatch = idRegex.exec(heading.text)
    if (!idMatch || idMatch[1] === undefined) continue

    const id = idMatch[1]
    const title = heading.text
      .slice(idMatch[0].length)
      .replace(/^[\s—:-]+/, '')
      .trim()

    const nextBoundary = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level)
    const bodyEndLine = nextBoundary ? nextBoundary.line - 1 : lines.length
    const body = lines.slice(heading.line, bodyEndLine).join('\n').trim()

    requirements.push({
      id,
      title,
      body,
      file,
      line: heading.line,
      ignored: body.includes(IGNORE_MARKER),
    })
  }

  return requirements
}

function collectHeadings(lines: string[]): HeadingLine[] {
  const headings: HeadingLine[] = []

  lines.forEach((rawLine, index) => {
    const match = HEADING_PATTERN.exec(rawLine)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: index + 1 })
    }
  })

  return headings
}

function assertNoDuplicates(requirements: Requirement[]): void {
  const byId = new Map<string, Requirement[]>()

  for (const requirement of requirements) {
    const group = byId.get(requirement.id)
    if (group) {
      group.push(requirement)
    } else {
      byId.set(requirement.id, [requirement])
    }
  }

  for (const [id, group] of byId) {
    if (group.length > 1) {
      const locations = group.map((r) => `  - ${r.file}:${r.line}`).join('\n')
      throw new SpecParseError(`Duplicate requirement ID "${id}" found in:\n${locations}`)
    }
  }
}
