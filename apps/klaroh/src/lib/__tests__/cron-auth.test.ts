import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedCronRequest } from '../cron-auth.ts';

test('rejects when the secret is unset, even for "Bearer undefined"', () => {
  assert.equal(isAuthorizedCronRequest('Bearer undefined', undefined), false);
  assert.equal(isAuthorizedCronRequest('Bearer ', ''), false);
  assert.equal(isAuthorizedCronRequest(null, undefined), false);
});

test('rejects a missing or wrong header when a secret is set', () => {
  assert.equal(isAuthorizedCronRequest(null, 's3cret'), false);
  assert.equal(isAuthorizedCronRequest('Bearer nope', 's3cret'), false);
  assert.equal(isAuthorizedCronRequest('s3cret', 's3cret'), false);
  assert.equal(isAuthorizedCronRequest('Bearer s3cret ', 's3cret'), false);
});

test('accepts the exact bearer token', () => {
  assert.equal(isAuthorizedCronRequest('Bearer s3cret', 's3cret'), true);
});
