import ts from 'typescript'

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

interface Assertion {
  matcher: string
  hasNot: boolean
  subjectArg: ts.Expression | undefined
  matcherArg: ts.Expression | undefined
}

/**
 * Static AST analysis of a test file's source text — nothing is executed.
 * A test is flagged if it matches any of the heuristics documented in the
 * README as `weak-test`. This is heuristic by nature and will have false
 * positives; that's why it defaults to `warn` and can be silenced with
 * `// spec-trace-disable-next-line weak-test`.
 */
export function detectWeakTests(file: string, sourceText: string): WeakTestFinding[] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  )

  const mockedIdentifiers = collectMockedIdentifiers(sourceFile)
  const findings: WeakTestFinding[] = []

  const visit = (node: ts.Node, describeChain: string[]): void => {
    const describeTitle = matchDescribeCall(node)
    if (describeTitle !== undefined) {
      node.forEachChild((child) => visit(child, [...describeChain, describeTitle]))
      return
    }

    const test = matchTestCall(node)
    if (test) {
      if (test.body && !isSilenced(sourceFile, node)) {
        const finding = analyzeTest(test.body, mockedIdentifiers)
        if (finding.length > 0) {
          const name = [...describeChain, test.title].join(' > ')
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          findings.push({ name, file, line, reasons: finding })
        }
      }
      return
    }

    node.forEachChild((child) => visit(child, describeChain))
  }

  visit(sourceFile, [])

  return findings
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function matchDescribeCall(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'describe') return undefined
  const [titleArg] = node.arguments
  return titleArg && ts.isStringLiteralLike(titleArg) ? titleArg.text : undefined
}

interface TestCallMatch {
  title: string
  body: ts.ConciseBody | undefined
}

function matchTestCall(node: ts.Node): TestCallMatch | undefined {
  if (!ts.isCallExpression(node)) return undefined

  const callee = node.expression
  const rootName = rootIdentifierName(callee)
  if (rootName !== 'it' && rootName !== 'test') return undefined

  const [titleArg, fnArg] = node.arguments
  const title = titleArg && ts.isStringLiteralLike(titleArg) ? titleArg.text : '<dynamic test name>'
  const body =
    fnArg && (ts.isArrowFunction(fnArg) || ts.isFunctionExpression(fnArg)) ? fnArg.body : undefined

  return { title, body }
}

function rootIdentifierName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return rootIdentifierName(expr.expression)
  if (ts.isCallExpression(expr)) return rootIdentifierName(expr.expression)
  return undefined
}

function collectMockedIdentifiers(sourceFile: ts.SourceFile): Set<string> {
  const mockedSpecifiers = new Set<string>()

  const findMocks = (node: ts.Node): void => {
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

  const findImports = (node: ts.Node): void => {
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

function analyzeTest(body: ts.ConciseBody, mockedIdentifiers: Set<string>): WeakTestReason[] {
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

function findAssertions(body: ts.Node): Assertion[] {
  const assertions: Assertion[] = []

  const visit = (node: ts.Node): void => {
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

function unwrapToExpectCall(expr: ts.Expression): ts.CallExpression | undefined {
  if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'expect') {
    return expr
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return unwrapToExpectCall(expr.expression)
  }
  if (ts.isCallExpression(expr)) {
    return unwrapToExpectCall(expr.expression)
  }
  return undefined
}

function chainIncludesNot(expr: ts.PropertyAccessExpression): boolean {
  let current: ts.Expression = expr
  while (ts.isPropertyAccessExpression(current)) {
    if (current.name.text === 'not') return true
    current = current.expression
  }
  return false
}

function isNonDiscriminant(assertion: Assertion): boolean {
  if (NON_DISCRIMINANT_MATCHERS.has(assertion.matcher)) return true
  if (assertion.matcher === 'toThrow' && assertion.hasNot) return true
  return false
}

function isTautological(assertion: Assertion): boolean {
  if (!TAUTOLOGY_MATCHERS.has(assertion.matcher)) return false
  if (!assertion.subjectArg || !assertion.matcherArg) return false

  const subjectText = literalTextOf(assertion.subjectArg)
  const matcherText = literalTextOf(assertion.matcherArg)
  if (subjectText === undefined || matcherText === undefined) return false

  return subjectText === matcherText
}

function literalTextOf(expr: ts.Expression): string | undefined {
  if (ts.isNumericLiteral(expr) || ts.isStringLiteralLike(expr)) return `${expr.kind}:${expr.text}`
  if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
    return `bool:${expr.kind}`
  }
  return undefined
}

function referencesMockedIdentifier(body: ts.Node, mockedIdentifiers: Set<string>): boolean {
  let found = false

  const visit = (node: ts.Node): void => {
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

function isSilenced(sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line
  if (line === 0) return false

  const lines = sourceFile.text.split('\n')
  const previousLine = lines[line - 1]
  return previousLine !== undefined && previousLine.includes(DISABLE_COMMENT)
}
