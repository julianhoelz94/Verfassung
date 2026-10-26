import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticationRateLimit } from './auth-rate-limit.js';

test('limits each authentication client until its fixed window expires', () => {
  const limited = createAuthenticationRateLimit(2, 100, 10);
  assert.equal(limited('first', 0), false);
  assert.equal(limited('first', 1), false);
  assert.equal(limited('first', 2), true);
  assert.equal(limited('second', 2), false);
  assert.equal(limited('first', 100), false);
});

test('fails closed for new clients at capacity without resetting known quotas', () => {
  const limited = createAuthenticationRateLimit(2, 100, 2);
  assert.equal(limited('first', 0), false);
  assert.equal(limited('second', 1), false);
  assert.equal(limited('third', 2), true);
  assert.equal(limited('first', 3), false);
  assert.equal(limited('first', 4), true);
  assert.equal(limited('third', 100), false);
  assert.equal(limited('second', 100), false);
  assert.equal(limited('second', 100), true);
});

test('reclaims expired clients during ordinary traffic, including refreshed windows', () => {
  const limited = createAuthenticationRateLimit(1, 100, 2);
  assert.equal(limited('first', 0), false);
  assert.equal(limited('second', 50), false);
  assert.equal(limited('first', 100), false);
  assert.equal(limited('third', 150), false);
  assert.equal(limited('first', 150), true);
});
