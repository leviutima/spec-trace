export {
  defineConfig,
  type SpecTraceConfig,
  type SpecTraceRuleConfig,
  type SpecTraceUserConfig,
} from './config.js'
export { parseSpecs, SpecParseError, type Requirement } from './spec-parser.js'
export {
  checkRules,
  type CheckRulesOptions,
  type RuleId,
  type Severity,
  type Violation,
} from './rules-engine.js'
export { detectWeakTests, type WeakTestFinding, type WeakTestReason } from './weak-test-detector.js'
