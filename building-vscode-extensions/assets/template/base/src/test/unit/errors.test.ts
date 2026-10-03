import * as assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { describeError } from '../../core/errors';

describe('describeError', () => {
  it('uses the message of Error instances', () => {
    assert.equal(describeError(new Error('boom')), 'boom');
  });

  it('passes strings through', () => {
    assert.equal(describeError('plain'), 'plain');
  });

  it('never throws on exotic values', () => {
    assert.equal(describeError({ weird: true }), 'Unknown error');
  });
});
