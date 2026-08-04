import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSpecs, SpecParseError } from '../src/spec-parser.js'

const fixture = (...segments: string[]) => join(import.meta.dirname, 'fixtures', 'parser', ...segments)

describe('parseSpecs', () => {
  it('[REQ-001] extracts id, title, body, file and line for each requirement', () => {
    const requirements = parseSpecs(fixture('basic'))

    expect(requirements).toHaveLength(2)
    expect(requirements[0]).toMatchObject({
      id: 'REQ-001',
      title: 'First requirement',
      body: 'Body text for the first requirement.',
      line: 1,
    })
    expect(requirements[0]?.file).toBe(fixture('basic', 'requirements.md'))
    expect(requirements[1]).toMatchObject({
      id: 'REQ-002',
      title: 'Second requirement',
      body: 'Body text for the second requirement.',
      line: 5,
    })
  })

  it('[REQ-002] keeps nested lower-level headings inside the body, stopping at the next same-or-higher heading', () => {
    const requirements = parseSpecs(fixture('nested'))

    expect(requirements).toHaveLength(2)
    expect(requirements[0]?.id).toBe('REQ-010')
    expect(requirements[0]?.body).toContain('### Sub-detail')
    expect(requirements[0]?.body).toContain('More text nested under the requirement.')
    expect(requirements[0]?.body).not.toContain('REQ-011')

    expect(requirements[1]?.id).toBe('REQ-011')
    expect(requirements[1]?.body).toBe('Body for the next requirement.')
  })

  it('[REQ-003] throws a fatal error listing both locations when an id is duplicated across files', () => {
    expect(() => parseSpecs(fixture('duplicate'))).toThrow(SpecParseError)

    try {
      parseSpecs(fixture('duplicate'))
      expect.unreachable('parseSpecs should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(SpecParseError)
      const message = (error as SpecParseError).message
      expect(message).toContain('REQ-020')
      expect(message).toContain(fixture('duplicate', 'a.md'))
      expect(message).toContain(fixture('duplicate', 'b.md'))
    }
  })

  it('[REQ-004] returns no requirements for an empty spec file', () => {
    expect(parseSpecs(fixture('empty'))).toEqual([])
  })

  it('[REQ-005] ignores headings whose id does not match REQ-<digits>', () => {
    const requirements = parseSpecs(fixture('malformed'))

    expect(requirements).toHaveLength(1)
    expect(requirements[0]?.id).toBe('REQ-030')
  })

  it('[REQ-006] marks a requirement as ignored when its body contains the ignore marker', () => {
    const requirements = parseSpecs(fixture('ignore'))

    const ignored = requirements.find((r) => r.id === 'REQ-040')
    const active = requirements.find((r) => r.id === 'REQ-041')

    expect(ignored?.ignored).toBe(true)
    expect(active?.ignored).toBe(false)
  })
})
