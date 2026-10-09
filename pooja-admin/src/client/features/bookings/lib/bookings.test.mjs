import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REVIEW_MAX, reviewTextOk, itemsLine, nextChadhavaStep, nextPoojaStep, stars, statusChip } from './bookings.js';

test('status moves only forward', () => {
  assert.equal(nextPoojaStep('booked').to, 'sankalp');
  assert.equal(nextPoojaStep('sankalp').to, 'performed');
  for (const s of ['performed', 'cancelled', undefined]) assert.equal(nextPoojaStep(s), undefined);
  assert.equal(nextChadhavaStep('booked').to, 'offered');
  assert.equal(nextChadhavaStep('offered'), undefined);
});

test('chips, stars and item lines', () => {
  assert.equal(statusChip({ status: 'cancelled', refunded: true }).label, 'Cancelled · refunded');
  assert.equal(stars(4), '★★★★☆');
  assert.equal(itemsLine([{ title: 'Gau Seva', qty: 1 }, { title: 'Ghee lamps', qty: 2 }]), 'Gau Seva, Ghee lamps ×2');
});

test('review text can be saved only when changed and within the cap', () => {
  assert.equal(reviewTextOk('Lovely', 'Lovely'), false);
  assert.equal(reviewTextOk('Lovely pooja', 'Lovely'), true);
  assert.equal(reviewTextOk('x'.repeat(REVIEW_MAX + 1), ''), false);
  assert.equal(reviewTextOk('', 'Lovely'), true);
});
