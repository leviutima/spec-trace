import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from '@leviutima/spec-trace/reporter'

export default defineConfig({
  test: {
    reporters: ['default', new SpecTraceReporter()],
  },
})
