// Not importing defineConfig from '@leviutima/spec-trace' here on purpose:
// this repo is the package itself, not a consumer of it, so the bare
// specifier wouldn't resolve without installing itself as its own
// dependency. defineConfig is only an identity passthrough for type
// inference anyway — a plain object works exactly the same at runtime.
export default {
  // test/fixtures/ intentionally contains *.test.ts-named files that are
  // never run directly by this project's own suite (they're exercised via
  // nested child-process runs in the e2e tests, or are pure static fixture
  // data for the parser/detector tests). Without this, this project's own
  // `verify` flags every one of them as stale-results "never-ran".
  testIgnore: ['test/fixtures'],
}
