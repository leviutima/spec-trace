export interface SpecTraceRuleConfig {
  'uncovered-requirement'?: 'error' | 'warn' | 'off'
  'orphan-test'?: 'error' | 'warn' | 'off'
  'unknown-requirement'?: 'error' | 'warn' | 'off'
  'skipped-coverage'?: 'error' | 'warn' | 'off'
  'failing-coverage'?: 'error' | 'warn' | 'off'
  'duplicate-requirement'?: 'error' | 'warn' | 'off'
  'weak-test'?: 'error' | 'warn' | 'off'
  'stale-results'?: 'error' | 'warn' | 'off'
  'empty-suite'?: 'error' | 'warn' | 'off'
}

export interface SpecTraceConfig {
  specDir: string
  resultsFile: string
  idPattern: string
  testMatch: string[]
  testIgnore: string[]
  rules: SpecTraceRuleConfig
  ignore: string[]
}

export type SpecTraceUserConfig = Partial<SpecTraceConfig>

export function defineConfig(config: SpecTraceUserConfig): SpecTraceUserConfig {
  return config
}
