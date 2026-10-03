import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { summarizeWorkspace } from '../../core/workspaceSummary';

describe('summarizeWorkspace', () => {
  it('tells the model what to do when no folder is open', () => {
    assert.match(summarizeWorkspace([]), /No folder is open/);
  });

  it('lists every folder with its URI', () => {
    const text = summarizeWorkspace([
      { name: 'api', uri: 'file:///repo/api' },
      { name: 'web', uri: 'file:///repo/web' },
    ]);
    assert.match(text, /^2 workspace folder\(s\) open:/);
    assert.match(text, /1\. api \(file:\/\/\/repo\/api\)/);
    assert.match(text, /2\. web \(file:\/\/\/repo\/web\)/);
  });
});
