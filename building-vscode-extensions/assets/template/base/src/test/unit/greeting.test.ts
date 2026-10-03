import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { formatGreeting } from '../../core/greeting';

describe('formatGreeting', () => {
  it('greets the given name with the configured greeting', () => {
    assert.equal(formatGreeting('Howdy', 'Ada'), 'Howdy, Ada!');
  });

  it('falls back to "world" when the name is missing or blank', () => {
    assert.equal(formatGreeting('Hello', undefined), 'Hello, world!');
    assert.equal(formatGreeting('Hello', '   '), 'Hello, world!');
  });

  it('falls back to "Hello" when the greeting is blank', () => {
    assert.equal(formatGreeting('  ', 'Ada'), 'Hello, Ada!');
  });
});
