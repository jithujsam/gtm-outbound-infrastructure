import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtCompact, fmtMoney, fmtOneIn, fmtPct, pct, per1k, ratio } from '../analytics/format.ts';
import { bestStep, stepViews } from '../analytics/steps.ts';

test('safe math never yields NaN / Infinity / negative', () => {
  assert.equal(ratio(5, 0), null);
  assert.equal(ratio(5, null), null);
  assert.equal(ratio(null, 5), null);
  assert.equal(ratio(-1, 5), null);
  assert.equal(ratio(Infinity, 5), null);
  assert.equal(pct(0, 0), null);
  assert.equal(pct(0, 10), 0);
  assert.equal(per1k(5, 2000), 2.5);
  for (const v of [pct(1, 3), per1k(7, 9)]) assert.ok(Number.isFinite(v!));
  assert.equal(fmtPct(null), '—');
  assert.equal(fmtPct(0.75), '0.75%');
  assert.equal(fmtPct(5.61), '5.6%');
  assert.equal(fmtPct(42.4), '42%');
  assert.equal(fmtCompact(73_300), '73.3K');
  assert.equal(fmtCompact(NaN), '—');
  assert.equal(fmtMoney(3900), '$3,900');
  assert.equal(fmtOneIn(5, 865), '1 : 173');
  assert.equal(fmtOneIn(0, 865), '—');
});

test('steps: per-step totals, replies per email sent, share of replies, best variant and best step', () => {
  const steps = stepViews([
    { step: 1, variant: 'A', sent: 500, replies_unique: 6, opportunities: 2 },
    { step: 1, variant: 'B', sent: 480, replies_unique: 3 },
    { step: 2, variant: '', sent: 400, replies_unique: 8 },
    { step: 3, variant: '', sent: 20, replies_unique: 5 },
  ]);
  assert.deepEqual(steps.map((s) => [s.step, s.sent, s.replies]), [[1, 980, 9], [2, 400, 8], [3, 20, 5]]);
  assert.equal(steps[0].bestVariant, 'A');
  assert.equal(steps[0].variants.length, 2);
  assert.equal(steps[1].variants.length, 0, 'no split → no variant rows');
  assert.equal(steps[0].replyShare, (9 / 22) * 100);
  assert.equal(bestStep(steps)!.step, 2, 'step 3 has too few sends to be ranked');
  assert.equal(stepViews([]).length, 0);
  assert.equal(stepViews([{ step: 1, variant: '', sent: 0, replies_unique: 0 }])[0].replyRate, null);
});
