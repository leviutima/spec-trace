import type TSStatic from 'typescript'

export type WeakTestReason =
  | 'no-assertions'
  | 'non-discriminant-assertions'
  | 'target-module-mocked'
  | 'tautological-assertion'

export interface WeakTestFinding {
  name: string
  file: string
  line: number
  reasons: WeakTestReason[]
}

const NON_DISCRIMINANT_MATCHERS = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeInstanceOf'])
const TAUTOLOGY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual'])
const DISABLE_COMMENT = 'spec-trace-disable-next-line weak-test'

type TS = typeof TSStatic

interface Assertion {
  matcher: string
  hasNot: boolean
  subjectArg: TSStatic.Expression | undefined
  matcherArg: TSStatic.Expression | undefined
}

type Importer = () => Promise<unknown>

const defaultImporter: Importer = () => import('typescript')

let cachedTypescript: Promise<TS | undefined> | undefined

function unwrapTypeScriptModule(mod: unknown): TS {
  return (mod as { default?: TS }).default ?? (mod as TS)
}

/**
 * typescript is an optional peerDependency — this is the only place that
 * touches it. Loaded lazily and cached so a project without it pays no
 * cost until (and unless) weak-test analysis is actually attempted, and
 * so we don't re-attempt (and re-fail) the import once per test file.
 * A custom importer (used only by tests, to simulate typescript being
 * absent without actually uninstalling it) bypasses the cache — it's
 * never the real dependency, so memoizing it would leak between tests.
 */
async function loadTypeScript(importer: Importer = defaultImporter): Promise<TS | undefined> {
  if (importer !== defaultImporter) {
    return importer().then(unwrapTypeScriptModule, () => undefined)
  }

  cachedTypescript ??= importer().then(unwrapTypeScriptModule, () => undefined)
  return cachedTypescript
}

export interface DetectWeakTestsOptions {
  /** Test-only seam for simulating a missing typescript peerDependency. */
  importTypeScript?: Importer
}

/**
 * Static AST analysis of a test file's source text — nothing is executed.
 * A test is flagged if it matches any of the heuristics documented in the
 * README as `weak-test`. This is heuristic by nature and will have false
 * positives; that's why it defaults to `warn` and can be silenced with
 * `// spec-trace-disable-next-line weak-test`.
 *
 * Returns `undefined` — not an empty array — when typescript isn't
 * installed, so callers can tell "analyzed, found nothing" apart from
 * "couldn't analyze at all".
 */
export async function detectWeakTests(
  file: string,
  sourceText: string,
  options: DetectWeakTestsOptions = {},
): Promise<WeakTestFinding[] | undefined> {
  const ts = await loadTypeScript(options.importTypeScript)
  if (!ts) return undefined

  const scriptKindFor = (f: string): TSStatic.ScriptKind => {
    if (f.endsWith('.tsx')) return ts.ScriptKind.TSX
    if (f.endsWith('.jsx')) return ts.ScriptKind.JSX
    if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs')) return ts.ScriptKind.JS
    return ts.ScriptKind.TS
  }

  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, scriptKindFor(file))

  const matchDescribeCall = (node: TSStatic.Node): string | undefined => {
    if (!ts.isCallExpression(node)) return undefined
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'describe') return undefined
    const [titleArg] = node.arguments
    return titleArg && ts.isStringLiteralLike(titleArg) ? titleArg.text : undefined
  }

  const rootIdentifierName = (expr: TSStatic.Expression): string | undefined => {
    if (ts.isIdentifier(expr)) return expr.text
    if (ts.isPropertyAccessExpression(expr)) return rootIdentifierName(expr.expression)
    if (ts.isCallExpression(expr)) return rootIdentifierName(expr.expression)
    return undefined
  }

  interface TestCallMatch {
    title: string
    body: TSStatic.ConciseBody | undefined
  }

  const matchTestCall = (node: TSStatic.Node): TestCallMatch | undefined => {
    if (!ts.isCallExpression(node)) return undefined

    const rootName = rootIdentifierName(node.expression)
    if (rootName !== 'it' && rootName !== 'test') return undefined

    const [titleArg, fnArg] = node.arguments
    const title = titleArg && ts.isStringLiteralLike(titleArg) ? titleArg.text : '<dynamic test name>'
    const body =
      fnArg && (ts.isArrowFunction(fnArg) || ts.isFunctionExpression(fnArg)) ? fnArg.body : undefined

    return { title, body }
  }

  const collectMockedIdentifiers = (): Set<string> => {
    const mockedSpecifiers = new Set<string>()

    const findMocks = (node: TSStatic.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'mock' &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'vi'
      ) {
        const [specifierArg] = node.arguments
        if (specifierArg && ts.isStringLiteralLike(specifierArg)) {
          mockedSpecifiers.add(specifierArg.text)
        }
      }
      node.forEachChild(findMocks)
    }
    findMocks(sourceFile)

    if (mockedSpecifiers.size === 0) return new Set()

    const mockedIdentifiers = new Set<string>()

    const findImports = (node: TSStatic.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        if (mockedSpecifiers.has(node.moduleSpecifier.text) && node.importClause) {
          const { name, namedBindings } = node.importClause
          if (name) mockedIdentifiers.add(name.text)
          if (namedBindings && ts.isNamedImports(namedBindings)) {
            for (const element of namedBindings.elements) {
              mockedIdentifiers.add(element.name.text)
            }
          } else if (namedBindings && ts.isNamespaceImport(namedBindings)) {
            mockedIdentifiers.add(namedBindings.name.text)
          }
        }
      }
      node.forEachChild(findImports)
    }
    findImports(sourceFile)

    return mockedIdentifiers
  }

  const unwrapToExpectCall = (expr: TSStatic.Expression): TSStatic.CallExpression | undefined => {
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'expect') {
      return expr
    }
    if (ts.isPropertyAccessExpression(expr)) return unwrapToExpectCall(expr.expression)
    if (ts.isCallExpression(expr)) return unwrapToExpectCall(expr.expression)
    return undefined
  }

  const chainIncludesNot = (expr: TSStatic.PropertyAccessExpression): boolean => {
    let current: TSStatic.Expression = expr
    while (ts.isPropertyAccessExpression(current)) {
      if (current.name.text === 'not') return true
      current = current.expression
    }
    return false
  }

  const findAssertions = (body: TSStatic.Node): Assertion[] => {
    const assertions: Assertion[] = []

    const visit = (node: TSStatic.Node): void => {
      if (ts.isCallExpression(node)) {
        const expectCall = unwrapToExpectCall(node.expression)
        if (expectCall && ts.isPropertyAccessExpression(node.expression)) {
          assertions.push({
            matcher: node.expression.name.text,
            hasNot: chainIncludesNot(node.expression),
            subjectArg: expectCall.arguments[0],
            matcherArg: node.arguments[0],
          })
        }
      }
      node.forEachChild(visit)
    }
    visit(body)

    return assertions
  }

  const isNonDiscriminant = (assertion: Assertion): boolean => {
    if (NON_DISCRIMINANT_MATCHERS.has(assertion.matcher)) return true
    return assertion.matcher === 'toThrow' && assertion.hasNot
  }

  const literalTextOf = (expr: TSStatic.Expression): string | undefined => {
    if (ts.isNumericLiteral(expr) || ts.isStringLiteralLike(expr)) return `${expr.kind}:${expr.text}`
    if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
      return `bool:${expr.kind}`
    }
    return undefined
  }

  const isTautological = (assertion: Assertion): boolean => {
    if (!TAUTOLOGY_MATCHERS.has(assertion.matcher)) return false
    if (!assertion.subjectArg || !assertion.matcherArg) return false

    const subjectText = literalTextOf(assertion.subjectArg)
    const matcherText = literalTextOf(assertion.matcherArg)
    if (subjectText === undefined || matcherText === undefined) return false

    return subjectText === matcherText
  }

  const referencesMockedIdentifier = (body: TSStatic.Node, mockedIdentifiers: Set<string>): boolean => {
    let found = false

    const visit = (node: TSStatic.Node): void => {
      if (found) return
      if (ts.isIdentifier(node) && mockedIdentifiers.has(node.text)) {
        found = true
        return
      }
      node.forEachChild(visit)
    }
    visit(body)

    return found
  }

  const analyzeTest = (body: TSStatic.ConciseBody, mockedIdentifiers: Set<string>): WeakTestReason[] => {
    const assertions = findAssertions(body)
    const reasons: WeakTestReason[] = []

    if (assertions.length === 0) {
      reasons.push('no-assertions')
    } else if (assertions.every((a) => isNonDiscriminant(a))) {
      reasons.push('non-discriminant-assertions')
    }

    if (assertions.some((a) => isTautological(a))) {
      reasons.push('tautological-assertion')
    }

    if (mockedIdentifiers.size > 0 && referencesMockedIdentifier(body, mockedIdentifiers)) {
      reasons.push('target-module-mocked')
    }

    return reasons
  }

  const isSilenced = (node: TSStatic.Node): boolean => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
    if (line === 0) return false

    const lines = sourceFile.text.split('\n')
    const previousLine = lines[line - 1]
    return previousLine !== undefined && previousLine.includes(DISABLE_COMMENT)
  }

  const mockedIdentifiers = collectMockedIdentifiers()
  const findings: WeakTestFinding[] = []

  const visit = (node: TSStatic.Node, describeChain: string[]): void => {
    const describeTitle = matchDescribeCall(node)
    if (describeTitle !== undefined) {
      node.forEachChild((child) => visit(child, [...describeChain, describeTitle]))
      return
    }

    const test = matchTestCall(node)
    if (test) {
      if (test.body && !isSilenced(node)) {
        const reasons = analyzeTest(test.body, mockedIdentifiers)
        if (reasons.length > 0) {
          const name = [...describeChain, test.title].join(' > ')
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          findings.push({ name, file, line, reasons })
        }
      }
      return
    }

    node.forEachChild((child) => visit(child, describeChain))
  }

  visit(sourceFile, [])

  return findings
}
