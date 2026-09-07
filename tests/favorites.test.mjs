import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFavorite,
  ownFavorites,
  saveFavorite,
  editFavorite,
  removeFavorite,
  restoreFavorite,
  parseFavorites,
} from '../app/favorites.ts';
import { answer, initialMemories } from '../app/demo.ts';
import { presenceLabel, AWAY_DELAY } from '../app/presence.ts';

const message = () => ({
  id: 'quote',
  from: '林屿',
  text: '最近下班后想先休息一下。',
  sources: [],
  sentAt: 100,
});
const save = (note = '给他一点自己的时间。') =>
  saveFavorite([], message(), '许知夏', note, 200);
test('private favorite keeps original words, source time and own note separate', () => {
  const source = message(),
    saved = saveFavorite([], source, '许知夏', '  我的理解  ', 200)[0];
  assert.equal(saved.visibility, 'private');
  assert.equal(saved.owner, '许知夏');
  assert.equal(saved.source.text, source.text);
  assert.equal(saved.source.speaker, '林屿');
  assert.equal(saved.source.sentAt, 100);
  assert.equal(saved.savedAt, 200);
  assert.equal(saved.note, '我的理解');
  source.text = '后续修改';
  assert.notEqual(saved.source.text, source.text);
  assert.equal('shared' in saved, false);
});
test('only the other human can be bookmarked, never self or assistant messages', () => {
  assert.equal(canFavorite(message(), '许知夏'), true);
  assert.equal(canFavorite(message(), '林屿'), false);
  assert.equal(canFavorite({ ...message(), from: '此间' }, '许知夏'), false);
  assert.equal(
    canFavorite({ ...message(), assistantFor: '林屿' }, '许知夏'),
    false,
  );
  assert.deepEqual(
    saveFavorite([], { ...message(), from: '此间' }, '许知夏', '', 200),
    [],
  );
});
test('switching identity exposes neither content nor count of the other favorites', () => {
  const saved = save();
  assert.equal(ownFavorites(saved, '许知夏').length, 1);
  assert.deepEqual(ownFavorites(saved, '林屿'), []);
  assert.deepEqual(ownFavorites(saved, '许知夏'), saved);
});
test('saving a quote twice updates note without duplicate or rewritten original', () => {
  const saved = save();
  const next = saveFavorite(
    saved,
    { ...message(), text: '后来改变的话' },
    '许知夏',
    '新备注',
    300,
  );
  assert.equal(next.length, 1);
  assert.equal(next[0].note, '新备注');
  assert.equal(next[0].source.text, message().text);
  assert.equal(next[0].savedAt, 200);
});
test('old messages do not acquire invented sent timestamps', () => {
  assert.equal(
    saveFavorite([], { ...message(), sentAt: undefined }, '许知夏', '', 200)[0]
      .source.sentAt,
    null,
  );
});
test('editing/removing belongs to owner and never changes original conversation', () => {
  const source = message(),
    before = structuredClone(source),
    saved = save();
  assert.deepEqual(editFavorite(saved, saved[0].id, '林屿', '偷改'), saved);
  assert.deepEqual(removeFavorite(saved, saved[0].id, '林屿'), saved);
  assert.equal(editFavorite(saved, saved[0].id, '许知夏', '')[0].note, '');
  assert.deepEqual(removeFavorite(saved, saved[0].id, '许知夏'), []);
  assert.deepEqual(source, before);
});
test('undo restores only own collection and does not duplicate a resaved quote', () => {
  const [f] = save();
  assert.deepEqual(restoreFavorite([], f, '林屿'), []);
  const restored = restoreFavorite([], f, '许知夏');
  assert.deepEqual(restored, [f]);
  assert.equal(restoreFavorite(restored, f, '许知夏').length, 1);
});
test('refresh parser preserves notes while ignoring sharing flags and corrupt entries', () => {
  const saved = save();
  const restored = parseFavorites(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored, saved);
  const injected = parseFavorites([
    { ...saved[0], visibility: 'public', shared: true, confirmed: true },
    null,
    { owner: '林屿' },
    saved[0],
  ]);
  assert.equal(injected.length, 1);
  assert.equal(injected[0].visibility, 'private');
  assert.equal('shared' in injected[0], false);
  assert.deepEqual(parseFavorites({}), []);
});
test('private quote/notes cannot influence assistant replies even if accidentally mixed into retrieval', () => {
  const secret = '绝不能泄露的私人备注';
  const saved = save(secret);
  const baseline = answer('休息 ' + secret, '林屿', '许知夏', initialMemories);
  const actual = answer('休息 ' + secret, '林屿', '许知夏', [
    ...initialMemories,
    ...saved,
  ]);
  assert.equal(actual.text, baseline.text);
  assert.deepEqual(actual.sources, baseline.sources);
  assert.ok(!actual.text.includes(secret));
  assert.ok(!actual.text.includes(message().text));
});
test('visible status labels contain no manual/automatic implementation details', () => {
  assert.equal(presenceLabel({ manualBusy: true, awaySince: null }, 0), '忙碌');
  assert.equal(
    presenceLabel({ manualBusy: false, awaySince: null }, 0),
    '在线',
  );
  assert.equal(
    presenceLabel({ manualBusy: false, awaySince: 0 }, 1),
    '暂时离开',
  );
  assert.equal(
    presenceLabel({ manualBusy: false, awaySince: 0 }, AWAY_DELAY),
    '暂时离开',
  );
});
