import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMemories, unansweredMessages } from '../app/demo.ts';
import { emptyStyle, correctStyle } from '../app/speaking-style.ts';
import {
  modelPrompt,
  parseModelReply,
  fallbackReply,
} from '../app/reception-model.ts';
import { generateReception, providerEndpoint } from '../app/model-service.ts';

const settings = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-5.2',
  baseUrl: '',
};
function input(text = '今天看到一只好可爱的猫') {
  return {
    text,
    active: '许知夏',
    partner: '林屿',
    memories: initialMemories,
    messages: [],
    style: correctStyle(emptyStyle(), 'r1', '好可爱呀～'),
    replyToId: 'incoming',
  };
}
const part = (text, extra = {}) => ({
  index: 0,
  action: 'reply',
  text,
  sourceIds: [],
  reason: 'unknown',
  ...extra,
});
const raw = (parts) => JSON.stringify({ parts });
function mock(content, finish_reason = 'stop') {
  return async () =>
    Response.json({ choices: [{ finish_reason, message: { content } }] });
}

test('model receives authorized facts, style corrections and no private/unconfirmed memory', () => {
  const request = input();
  request.memories = [
    ...initialMemories,
    {
      ...initialMemories[0],
      id: 'private',
      shared: false,
      text: 'PRIVATE_SECRET',
    },
  ];
  const context = JSON.parse(modelPrompt(request)[1].content);
  assert.deepEqual(context.style.examples, ['好可爱呀～']);
  assert.ok(!JSON.stringify(context).includes('PRIVATE_SECRET'));
  assert.ok(!context.confirmedMemories.some((m) => m.id === 'guess'));
  request.style = { ...request.style, enabled: false };
  assert.deepEqual(
    JSON.parse(modelPrompt(request)[1].content).style.examples,
    [],
  );
});
test('ordinary conversation is answered even without a matching memory', async () => {
  let called = false;
  const content = raw([part('好可爱呀～是什么颜色的？')]);
  const result = await generateReception(
    { input: input(), settings },
    async (url, options) => {
      called = true;
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.equal(options.redirect, 'error');
      assert.equal(
        JSON.parse(options.body).response_format.type,
        'json_object',
      );
      return mock(content)();
    },
  );
  assert.equal(called, true);
  const reply = parseModelReply(result, input());
  assert.equal(reply.text, '好可爱呀～是什么颜色的？');
  assert.equal(reply.pending, false);
  assert.equal(reply.replyMode, 'model');
  assert.equal(reply.assistantFor, '林屿');
});
test('explicit decisions bypass model calls and remain in handoff', async () => {
  const request = input('你答应搬过去吗？');
  const content = await generateReception(
    { input: request, settings },
    async () => {
      throw new Error('must not call');
    },
  );
  const reply = parseModelReply(content, request);
  assert.equal(reply.pending, true);
  assert.equal(reply.unresolved[0].reason, 'relationship');
  assert.equal(fallbackReply(request).pending, true);
});
test('mixed messages keep answered information out of handoff', () => {
  const request = input('你几点忙完？你保证明天陪我吗？');
  const reply = parseModelReply(
    raw([
      part('之前记下的是18:30。', { sourceIds: ['time'] }),
      part('我保证明天陪你', { index: 1 }),
    ]),
    request,
  );
  assert.deepEqual(reply.sources, ['time']);
  assert.equal(reply.unresolved.length, 1);
  assert.ok(!reply.text.includes('我保证'));
  const pending = unansweredMessages(
    [
      { id: 'incoming', from: '许知夏', text: request.text, recipient: '林屿' },
      reply,
    ],
    '林屿',
  );
  assert.equal(pending[0].parts[0].text, '你保证明天陪我吗？');
  const fallback = fallbackReply(request, true);
  assert.deepEqual(fallback.sources, ['time']);
  assert.equal(fallback.unresolved.length, 1);
  assert.match(fallback.text, /18:30/);
});
test('semantic handoff and emotional support retain human attention', () => {
  const decision = parseModelReply(
    raw([part('好的', { reason: 'relationship' })]),
    input('今晚你可以来接我吗？'),
  );
  assert.equal(decision.pending, true);
  assert.ok(!decision.text.includes('好的'));
  const emotion = parseModelReply(
    raw([part('辛苦啦，先歇会儿。', { reason: 'emotion' })]),
    input('今天工作好累'),
  );
  assert.equal(emotion.pending, true);
  assert.equal(emotion.unresolved[0].priority, 1);
  assert.match(emotion.text, /先歇会儿/);
});
test('fabricated citations and first-person commitments cannot be sent', () => {
  for (const p of [
    part('某条私人记忆', { sourceIds: ['private'] }),
    part('我今晚一定陪你'),
    part('我爱你'),
  ]) {
    const reply = parseModelReply(raw([p]), input());
    assert.equal(reply.pending, true);
    assert.ok(!reply.text.includes(p.text));
    assert.deepEqual(reply.sources, []);
  }
});
test('partial, duplicate and malformed output is rejected rather than silently losing fragments', async () => {
  assert.throws(() => parseModelReply(raw([]), input()));
  assert.throws(() =>
    parseModelReply(raw([part('a'), part('b')]), input('你好。今天好吗？')),
  );
  await assert.rejects(
    generateReception({ input: input(), settings }, mock('invalid json')),
  );
  await assert.rejects(
    generateReception(
      { input: input(), settings },
      mock(raw([part('好呀')]), 'length'),
    ),
  );
});
test('provider errors are useful without leaking the provider response', async () => {
  await assert.rejects(
    generateReception(
      { input: input(), settings },
      async () => new Response('test-key SECRET', { status: 401 }),
    ),
    (error) =>
      /API Key/.test(error.message) && !error.message.includes('SECRET'),
  );
  await assert.rejects(
    generateReception(
      { input: input(), settings },
      async () => new Response('', { status: 429 }),
    ),
    /额度不足/,
  );
});
test('custom endpoints require an explicit exact HTTPS origin and never redirect', () => {
  const custom = {
    ...settings,
    provider: 'custom',
    baseUrl: 'https://api.example.com/v1',
  };
  assert.throws(() => providerEndpoint(custom), /尚未启用/);
  assert.equal(
    providerEndpoint(custom, 'https://api.example.com'),
    'https://api.example.com/v1/chat/completions',
  );
  for (const baseUrl of [
    'https://api.example.com.evil.test/v1',
    'http://api.example.com/v1',
    'https://user:pass@api.example.com/v1',
    'https://api.example.com/v1?key=bad',
    'http://127.0.0.1/v1',
  ]) {
    assert.throws(() =>
      providerEndpoint({ ...custom, baseUrl }, 'https://api.example.com'),
    );
  }
});
test('DeepSeek uses its supported non-thinking JSON request shape', async () => {
  await generateReception(
    {
      input: input(),
      settings: {
        ...settings,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
      },
    },
    async (url, options) => {
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(body.max_tokens, 2400);
      return mock(raw([part('好可爱呀')]))();
    },
  );
});
