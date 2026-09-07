import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialMemories,
  reviewMemory,
  reviseMemory,
  memoryStatus,
  canReview,
  answer,
  assistantName,
} from '../app/demo.ts';
import {
  AWAY_DELAY,
  transitionPresence,
  presenceStatus,
  canReceive,
  restorePresence,
  observePresence,
} from '../app/presence.ts';

const guess = initialMemories.find((m) => m.id === 'guess');
const online = () => ({ manualBusy: false, awaySince: null });
test('a person can disagree without explaining and both original voices survive', () => {
  const result = reviewMemory(guess, '许知夏', 'disputed');
  assert.equal(result.text, guess.text);
  assert.equal(result.confirmed, false);
  assert.equal(memoryStatus(result), 'disputed');
  assert.equal(result.reviews[0].originalText, guess.text);
  assert.equal(result.reviews[0].text, '');
});
test('feedback is retained and author revision requires new confirmation', () => {
  const rejected = reviewMemory(
    guess,
    '许知夏',
    'disputed',
    '  我希望先被听见。  ',
  );
  const revised = reviseMemory(rejected, {
    ...rejected,
    text: '你希望先被听见。',
  });
  assert.equal(memoryStatus(revised), 'pending');
  assert.equal(revised.confirmed, false);
  assert.equal(revised.reviews[0].text, '我希望先被听见。');
  assert.equal(revised.reviews[0].originalText, guess.text);
  const confirmed = reviewMemory(revised, '许知夏', 'confirmed');
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.reviews.length, 2);
});
test('deferring is distinct from rejecting and can later be confirmed', () => {
  const deferred = reviewMemory(guess, '许知夏', 'deferred');
  assert.equal(memoryStatus(deferred), 'deferred');
  assert.equal(deferred.confirmed, false);
  assert.equal(
    memoryStatus(reviewMemory(deferred, '许知夏', 'confirmed')),
    'confirmed',
  );
});
test('author cannot confirm their own belief about the partner', () => {
  assert.equal(canReview(guess, '林屿'), false);
  assert.equal(reviewMemory(guess, '林屿', 'confirmed'), guess);
  assert.equal(canReview({ ...guess, shared: false }, '许知夏'), false);
  assert.equal(canReview({ ...guess, subject: '林屿' }, '许知夏'), false);
});
test('disputed and deferred common memories never become evidence', () => {
  const common = initialMemories.find((m) => m.id === 'weekend');
  for (const decision of ['disputed', 'deferred']) {
    const m = reviewMemory(common, '林屿', decision);
    assert.deepEqual(answer('周末去哪？', '林屿', '许知夏', [m]).sources, []);
    assert.deepEqual(
      answer('周末去哪？', '林屿', '许知夏', [{ ...m, confirmed: true }])
        .sources,
      [],
    );
  }
});
test('assistant identity is bound to the represented person, including old messages', () => {
  for (const [a, b] of [
    ['许知夏', '林屿'],
    ['林屿', '许知夏'],
  ]) {
    const m = answer('周末去哪？', a, b, initialMemories);
    assert.equal(m.assistantFor, b);
    assert.equal(assistantName(m), b + '（助手）');
    assert.equal(
      assistantName({ ...m, assistantFor: undefined }),
      b + '（助手）',
    );
    assert.equal(assistantName({ from: a }), a);
  }
});
test('two-minute boundary, repeated leave events and short return', () => {
  const left = transitionPresence(online(), 'leave', 1000);
  assert.equal(transitionPresence(left, 'leave', 5000), left);
  assert.equal(presenceStatus(left, 1000 + AWAY_DELAY - 1), 'grace');
  assert.equal(canReceive(left, true, 1000 + AWAY_DELAY - 1), false);
  assert.equal(presenceStatus(left, 1000 + AWAY_DELAY), 'away');
  assert.equal(canReceive(left, true, 1000 + AWAY_DELAY), true);
  const back = transitionPresence(left, 'return', 2000);
  assert.equal(canReceive(back, true, 1000 + AWAY_DELAY), false);
  const leftAgain = transitionPresence(back, 'leave', 3000);
  assert.equal(leftAgain.awaySince, 3000);
});
test('return pauses automatic reception without waiting for another timer tick', () => {
  const left = transitionPresence(online(), 'leave', 0);
  const back = transitionPresence(left, 'return', AWAY_DELAY * 3);
  assert.equal(presenceStatus(back, AWAY_DELAY * 3), 'online');
  assert.equal(canReceive(back, true, AWAY_DELAY * 3), false);
});
test('manual busy survives page return and explicit takeover clears it', () => {
  const manual = transitionPresence(online(), 'busy', 0);
  const back = transitionPresence(
    transitionPresence(manual, 'leave', 100),
    'return',
    200,
  );
  assert.equal(canReceive(back, true, 200), true);
  assert.equal(presenceStatus(back, 200), 'busy');
  assert.deepEqual(transitionPresence(back, 'takeover', 201), online());
});
test('disabled assistant stays off regardless of automatic or manual state', () => {
  assert.equal(
    canReceive({ manualBusy: true, awaySince: null }, false, AWAY_DELAY),
    false,
  );
  assert.equal(
    canReceive({ manualBusy: false, awaySince: 0 }, false, AWAY_DELAY),
    false,
  );
});
test('elapsed wall time still gates reception if background timers are throttled', () => {
  const left = transitionPresence(online(), 'leave', 10);
  assert.equal(canReceive(left, true, AWAY_DELAY * 10), true);
});
test('old busy settings migrate, invalid timestamps cannot enable reception', () => {
  const restored = restorePresence(null, { 林屿: false, 许知夏: true });
  assert.equal(restored.林屿.manualBusy, false);
  assert.equal(restored.许知夏.manualBusy, true);
  assert.equal(
    restorePresence(
      { 林屿: { manualBusy: false, awaySince: 'yesterday' } },
      null,
    ).林屿.awaySince,
    null,
  );
});
test('tab visibility and window events drive state, and cleanup removes every listener', () => {
  const doc = new EventTarget(),
    win = new EventTarget();
  doc.visibilityState = 'visible';
  let state = online(),
    time = 0,
    calls = 0;
  const cleanup = observePresence(
    doc,
    win,
    () => {
      calls++;
      state = transitionPresence(state, 'leave', time);
    },
    () => {
      calls++;
      state = transitionPresence(state, 'return', time);
    },
  );
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  time = AWAY_DELAY;
  win.dispatchEvent(new Event('focus'));
  assert.equal(
    canReceive(state, true, time),
    true,
    'hidden focus must not count as a return',
  );
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(canReceive(state, true, time), false);
  win.dispatchEvent(new Event('blur'));
  time += AWAY_DELAY;
  assert.equal(canReceive(state, true, time), true);
  win.dispatchEvent(new Event('focus'));
  assert.equal(canReceive(state, true, time), false);
  win.dispatchEvent(new Event('pagehide'));
  win.dispatchEvent(new Event('pageshow'));
  assert.equal(presenceStatus(state, time), 'online');
  cleanup();
  const before = calls;
  for (const event of ['blur', 'focus', 'pagehide', 'pageshow'])
    win.dispatchEvent(new Event(event));
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, before);
});
