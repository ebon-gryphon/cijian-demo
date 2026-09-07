import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, initialMemories } from '../app/demo.ts';
test('confirmed partner schedule is quoted with its source', () => {
  const r = answer('你几点忙完？', '许知夏', '林屿', initialMemories);
  assert.deepEqual(r.sources, ['time']);
  assert.match(r.text, /18:30/);
  assert.equal(r.pending, false);
});
test('private knowledge cannot answer a message', () => {
  const r = answer('工作的担心是什么？', '许知夏', '林屿', initialMemories);
  assert.deepEqual(r.sources, []);
  assert.ok(!r.text.includes('工作的变化'));
  assert.equal(r.pending, true);
});
test('unconfirmed beliefs never become evidence', () => {
  const r = answer('想独处吗？', '许知夏', '林屿', initialMemories);
  assert.deepEqual(r.sources, []);
  assert.equal(r.pending, true);
});
test('shared memories can serve both people', () => {
  for (const [a, b] of [
    ['许知夏', '林屿'],
    ['林屿', '许知夏'],
  ]) {
    const r = answer('周末去哪？', a, b, initialMemories);
    assert.deepEqual(r.sources, ['weekend']);
    assert.match(r.text, /车次还没定/);
  }
});
test('withdrawn memory is excluded from subsequent replies', () => {
  const updated = initialMemories.map((m) =>
    m.id === 'time' ? { ...m, shared: false } : m,
  );
  const r = answer('你几点忙完？', '许知夏', '林屿', updated);
  assert.deepEqual(r.sources, []);
  assert.equal(r.pending, true);
});
test('new confirmed memory changes the answer', () => {
  const updated = [
    {
      id: 'new',
      title: '晚饭',
      text: '想吃番茄面。',
      owner: '林屿',
      subject: '林屿',
      shared: true,
      confirmed: true,
      tags: ['晚饭'],
    },
  ];
  const r = answer('晚饭想吃什么？', '许知夏', '林屿', updated);
  assert.deepEqual(r.sources, ['new']);
  assert.match(r.text, /番茄面/);
});
test('relationship commitment is handed to the human even when matching a memory', () => {
  const r = answer(
    '周末见面你保证以后不吵架吗？',
    '许知夏',
    '林屿',
    initialMemories,
  );
  assert.deepEqual(r.sources, []);
  assert.equal(r.pending, true);
  assert.match(r.text, /亲自回应/);
});
test('emotional reception quotes only the speakers own authorized preference', () => {
  const r = answer('今天有点委屈', '许知夏', '林屿', initialMemories);
  assert.deepEqual(r.sources, ['care']);
  assert.equal(r.pending, true);
  assert.ok(!r.text.includes('想独处'));
});
