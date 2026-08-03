import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from '../../../src/reporter.ts'

export default defineConfig({
  test: {
    watch: false,
    reporters: [new SpecTraceReporter()],
  },
})
