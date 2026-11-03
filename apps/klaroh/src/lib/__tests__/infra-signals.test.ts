import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainHealthText, MANUAL_HELP, MANUAL_LABEL } from '../infra-signals.ts';

test('a domain health status is never shown without a score', () => {
  assert.equal(domainHealthText(null, 'Healthy'), null); // the column default on its own
  assert.equal(domainHealthText(undefined, 'Healthy'), null);
  assert.equal(domainHealthText(Number.NaN, 'Healthy'), null);
  assert.equal(domainHealthText(null, null), null);
});

test('a score is shown with its label when the agency entered one', () => {
  assert.equal(domainHealthText(92, 'Healthy'), '92% · Healthy');
  assert.equal(domainHealthText(0, 'At risk'), '0% · At risk');
  assert.equal(domainHealthText(80, null), '80%');
  assert.equal(domainHealthText(80, '   '), '80%');
});

test('manual figures are labelled as entered by the team, not synced', () => {
  assert.equal(MANUAL_LABEL, 'Entered by your team');
  assert.match(MANUAL_HELP, /not synced/i);
});
