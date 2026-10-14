import test from 'node:test';
import assert from 'node:assert/strict';
import { double } from '../src/double.js';

test('double doubles a number', () => {
  assert.equal(double(2), 4);
});
