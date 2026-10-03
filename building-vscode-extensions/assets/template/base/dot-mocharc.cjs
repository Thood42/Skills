// Unit tests: plain Node, no VS Code. Only src/core (and src/shared) code belongs under test here.
module.exports = {
  spec: 'out/test/unit/**/*.test.js',
  ui: 'bdd',
  // Unit tests are pure and fast; a test needing more than 2s is doing I/O and belongs in integration.
  timeout: 2000,
};
