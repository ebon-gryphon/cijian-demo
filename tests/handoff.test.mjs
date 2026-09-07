import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answer,
  initialMemories,
  unansweredMessages,
  migrateReplyLinks,
  completeHandoff,
} from '../app/demo.ts';

function exchange(text, id = 'question') {
  const incoming = {
    id,
    from: '许知夏',
    recipient: '林屿',
    text,
    sources: [],
    sentAt: 1,
  };
  return [incoming, answer(text, '许知夏', '林屿', initialMemories, id)];
}

test('answered facts and messages received without assistant reception are not tasks', () => {
  const messages = [
    ...exchange('你几点忙完？'),
    {
      id: 'online',
      from: '许知夏',
      recipient: '林屿',
      text: '今天有点委屈',
      sources: [],
    },
  ];
  assert.deepEqual(unansweredMessages(messages, '林屿'), []);
});

test('mixed input keeps only the unanswered fragments and preserves literal words', () => {
  const messages = exchange('你几点忙完？今天有点委屈。晚饭吃什么？');
  const reply = messages[1];
  assert.match(reply.text, /18:30/);
  assert.equal(reply.pending, true);
  assert.deepEqual(
    reply.unresolved.map((p) => p.text),
    ['今天有点委屈。', '晚饭吃什么？'],
  );
  const [task] = unansweredMessages(messages, '林屿');
  assert.equal(task.message.id, 'question');
  assert.deepEqual(
    task.parts.map((p) => p.reason),
    ['emotion', 'unknown'],
  );
  assert.deepEqual(unansweredMessages(messages, '许知夏'), []);
});

test('comma-separated unknown and answered questions do not hide unresolved content', () => {
  const messages = exchange('你几点忙完，晚饭吃什么？');
  assert.deepEqual(
    messages[1].unresolved.map((p) => p.text),
    ['晚饭吃什么？'],
  );
});

test('relationship decisions and feelings appear before missing everyday information', () => {
  const messages = [
    ...exchange('晚饭吃什么？', 'unknown'),
    ...exchange('我今天有点委屈', 'emotion'),
    ...exchange('你原谅我了吗？', 'relationship'),
  ];
  assert.deepEqual(
    unansweredMessages(messages, '林屿').map((t) => t.message.id),
    ['relationship', 'emotion', 'unknown'],
  );
});

test('a stated unknown train number remains unresolved, a later confirmed number can answer', () => {
  const missing = answer(
    '周末见面的车次定了吗？',
    '林屿',
    '许知夏',
    initialMemories,
  );
  assert.equal(missing.pending, true);
  const memories = initialMemories.map((m) =>
    m.id === 'weekend' ? { ...m, text: '周末见面坐 G123 次车。' } : m,
  );
  assert.equal(
    answer('周末见面的车次定了吗？', '林屿', '许知夏', memories).pending,
    false,
  );
});

test('human response or acknowledged completion clears both task and assistant pending marker', () => {
  const messages = exchange('今天有点委屈');
  assert.equal(unansweredMessages(messages, '林屿').length, 1);
  const completed = completeHandoff(messages, 'question', '林屿');
  assert.equal(completed[0].handled, true);
  assert.equal(completed[1].pending, false);
  assert.deepEqual(unansweredMessages(completed, '林屿'), []);
  assert.equal(messages[1].pending, true);
  assert.deepEqual(completeHandoff(messages, 'question', '许知夏'), messages);
});

test('legacy migration links only adjacent assistant replies and preserves handled state', () => {
  const old = [
    ...exchange('你几点忙完？', 'answered'),
    ...exchange('今天有点委屈', 'pending'),
  ].map(({ replyToId, unresolved, ...message }) => message);
  const migrated = migrateReplyLinks(old);
  assert.deepEqual(
    unansweredMessages(migrated, '林屿').map((t) => t.message.id),
    ['pending'],
  );
  assert.deepEqual(migrateReplyLinks(migrated), migrated);
  const closed = migrateReplyLinks(
    old.map((m) => (m.id === 'pending' ? { ...m, handled: true } : m)),
  );
  assert.deepEqual(unansweredMessages(closed, '林屿'), []);
  assert.equal(closed.at(-1).pending, false);
});

test('unrelated legacy assistant message cannot create a task for the wrong recipient', () => {
  const [incoming, reply] = exchange('今天有点委屈');
  delete reply.replyToId;
  assert.deepEqual(
    unansweredMessages(
      migrateReplyLinks([{ ...incoming, recipient: '许知夏' }, reply]),
      '许知夏',
    ),
    [],
  );
});

test('pending tasks survive saving and loading without generating extra tasks', () => {
  const messages = [
    ...exchange('你几点忙完？'),
    ...exchange('为什么不理我', 'important'),
  ];
  const restored = migrateReplyLinks(JSON.parse(JSON.stringify(messages)));
  assert.deepEqual(
    unansweredMessages(restored, '林屿'),
    unansweredMessages(messages, '林屿'),
  );
});
