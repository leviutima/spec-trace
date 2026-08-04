import { defineConfig } from 'vitest/config'
import { SpecTraceReporter } from './src/reporter.js'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'test/fixtures/**'],
    reporters: ['default', new SpecTraceReporter()],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
    },
  },
})
