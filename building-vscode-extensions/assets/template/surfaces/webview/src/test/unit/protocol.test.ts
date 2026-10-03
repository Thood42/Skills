import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { isHostToWebview, isWebviewToHost, MAX_NAME_LENGTH } from '../../shared/protocol';

describe('webview protocol guards', () => {
  it('accepts well-formed webview messages', () => {
    assert.ok(isWebviewToHost({ type: 'ready' }));
    assert.ok(isWebviewToHost({ type: 'requestGreeting', name: 'Ada' }));
  });

  it('rejects malformed or unknown webview messages', () => {
    assert.ok(!isWebviewToHost(null));
    assert.ok(!isWebviewToHost('ready'));
    assert.ok(!isWebviewToHost({ type: 'requestGreeting' }));
    assert.ok(!isWebviewToHost({ type: 'requestGreeting', name: 42 }));
    assert.ok(!isWebviewToHost({ type: 'deleteEverything' }));
  });

  it('rejects oversized names', () => {
    assert.ok(!isWebviewToHost({ type: 'requestGreeting', name: 'x'.repeat(MAX_NAME_LENGTH + 1) }));
  });

  it('validates host messages', () => {
    assert.ok(isHostToWebview({ type: 'greeting', text: 'Hello, Ada!' }));
    assert.ok(!isHostToWebview({ type: 'greeting' }));
  });
});
