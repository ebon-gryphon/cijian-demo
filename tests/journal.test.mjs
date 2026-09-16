import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'cijian-test-'));
await build({
  entryPoints: [
    'app/journal-model.ts',
    'app/journal-ai.ts',
    'app/retired-examples.ts',
    'app/ai-server-config.ts',
  ],
  outdir: dir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  outExtension: { '.js': '.mjs' },
});
const { newEntry, validateEntry } = await import(
  join(dir, 'journal-model.mjs')
);
const { generateJournal } = await import(join(dir, 'journal-ai.mjs'));
after(() => rm(dir, { recursive: true, force: true }));
const models = { text: 'text-model', image: 'image-model' };
const response = (out) =>
  new Response(
    JSON.stringify({
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify(out) } },
      ],
    }),
  );
test('cloud save rejects unsafe image paths and malformed content', () => {
  const e = { ...newEntry(), title: '标题', story: '故事' };
  assert.equal(validateEntry(e).story, '故事');
  assert.throws(() =>
    validateEntry({
      ...e,
      pictures: [
        {
          id: 'p',
          src: 'https://arbitrary.example/image',
          kind: 'uploaded',
          prompt: '',
        },
      ],
    }),
  );
  assert.throws(() => validateEntry({ ...e, story: ' ' }));
});
test('story generation uses actual model output and selected references only', async () => {
  let payload;
  const result = await generateJournal(
    {
      action: 'story',
      notes: { host: '下雨吃面', guest: '' },
      mode: 'faithful',
      references: [{ title: '上次', story: '晴天吃面' }],
    },
    'test-only',
    models,
    async (_, init) => {
      payload = JSON.parse(init.body);
      return response({ title: '雨天', story: '我们在雨天吃面。' });
    },
  );
  assert.equal(result.story, '我们在雨天吃面。');
  assert.match(payload.messages[0].content, /不编造/);
  assert.equal(JSON.parse(payload.messages[1].content).references.length, 1);
});
test('missing key, missing input, and provider failure never return fabricated stories', async () => {
  await assert.rejects(
    generateJournal({ action: 'story' }, '', models),
    /连接/,
  );
  await assert.rejects(
    generateJournal({ action: 'story' }, 'test-only', models),
    /片段/,
  );
  await assert.rejects(
    generateJournal(
      { action: 'story', notes: { host: '片段' } },
      'test-only',
      models,
      async () => new Response('PRIVATE PROVIDER RESPONSE', { status: 401 }),
    ),
    (e) => !e.message.includes('PRIVATE') && /密钥/.test(e.message),
  );
});
test('image generation requires explicit confirmation before contacting provider', async () => {
  let calls = 0;
  await assert.rejects(
    generateJournal(
      { action: 'image', prompt: '雨天' },
      'test-only',
      models,
      async () => {
        calls++;
        return new Response();
      },
    ),
    /确认/,
  );
  assert.equal(calls, 0);
});
test('image editing sends original bytes and chosen prompt to edits API', async () => {
  let url, body;
  const result = await generateJournal(
    {
      action: 'edit',
      prompt: '保留人物，水彩风',
      confirmed: true,
      image: 'data:image/png;base64,aGVsbG8=',
      size: '1024x1024',
    },
    'test-only',
    models,
    async (u, init) => {
      url = u;
      body = init.body;
      return new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }));
    },
  );
  assert.match(url, /images\/edits$/);
  assert.equal(body.get('prompt'), '保留人物，水彩风');
  assert.equal(await body.get('image[]').text(), 'hello');
  assert.equal(body.get('size'), '1024x1024');
  assert.equal(result.image, 'data:image/jpeg;base64,aW1hZ2U=');
});

const { isRetiredExample, withoutRetiredExamples } = await import(
  join(dir, 'retired-examples.mjs')
);
test('retire untouched examples, retain changes to text, notes, or uploaded pictures', async () => {
  const old = {
    ...newEntry(),
    id: 'shared-time',
    title: '今天的忙碌时间',
    story: '今天开会到 18:30，结束后会看消息。',
    notes: { host: '', guest: '今天开会到 18:30，结束后会看消息。' },
  };
  assert.equal(await isRetiredExample(old), true);
  const edited = { ...old, story: old.story + '晚上我们一起庆祝生日。' };
  const ownNotes = {
    ...old,
    notes: { host: '我补写的记忆', guest: old.notes.guest },
  };
  const ownPhoto = {
    ...old,
    pictures: [
      {
        id: 'own',
        src: 'data:image/jpeg;base64,custom',
        kind: 'uploaded',
        prompt: '',
      },
    ],
  };
  assert.deepEqual(
    await withoutRetiredExamples([old, edited, ownNotes, ownPhoto]),
    [edited, ownNotes, ownPhoto],
  );
});

const { normalizeApiBaseUrl } = await import(join(dir, 'journal-ai.mjs'));
const { resolveAIConnection } = await import(join(dir, 'ai-server-config.mjs'));
test('MiMo uses its own endpoint, token parameter, and non-thinking mode', async () => {
  let called;
  const result = await generateJournal(
    { action: 'story', notes: { host: '一起散步' } },
    'mimo-test-key',
    { ...models, text: 'mimo-v2.5', baseUrl: 'https://api.xiaomimimo.com/v1/' },
    async (url, init) => {
      called = { url, ...init, body: JSON.parse(init.body) };
      return response({ title: '散步', story: '我们一起散步。' });
    },
  );
  assert.equal(called.url, 'https://api.xiaomimimo.com/v1/chat/completions');
  assert.equal(called.headers.Authorization, 'Bearer mimo-test-key');
  assert.equal(called.body.thinking.type, 'disabled');
  assert.equal(called.body.max_completion_tokens, 4096);
  assert.equal(called.body.max_tokens, undefined);
  assert.equal(result.story, '我们一起散步。');
});
test('custom OpenAI-compatible endpoints and namespaced models are preserved', async () => {
  await generateJournal(
    { action: 'story', notes: { host: '记录' } },
    'custom-key',
    {
      ...models,
      text: 'vendor/model-name',
      baseUrl: 'https://models.example/v1/chat/completions',
    },
    async (url, init) => {
      assert.equal(url, 'https://models.example/v1/chat/completions');
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'vendor/model-name');
      assert.equal(body.response_format, undefined);
      assert.equal(body.max_tokens, 4096);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: '```json\n{"title":"标题","story":"正文"}\n```',
              },
            },
          ],
        }),
      );
    },
  );
});
test('Anthropic and Gemini use native authentication, bodies and text parsing', async () => {
  for (const protocol of ['anthropic', 'gemini']) {
    const result = await generateJournal(
      { action: 'story', notes: { host: '散步' } },
      'native-key',
      { ...models, protocol, baseUrl: 'https://models.example/v1' },
      async (url, init) => {
        const payload = JSON.parse(init.body);
        assert.equal(init.headers.Authorization, undefined);
        if (protocol === 'anthropic') {
          assert.equal(url, 'https://models.example/v1/messages');
          assert.equal(init.headers['x-api-key'], 'native-key');
          assert.equal(init.headers['anthropic-version'], '2023-06-01');
          assert.match(payload.system, /写作助手/);
          return Response.json({
            stop_reason: 'end_turn',
            content: [
              { type: 'text', text: '{"title":"散步","story":"我们散步。"}' },
            ],
          });
        }
        assert.equal(
          url,
          'https://models.example/v1/models/text-model:generateContent',
        );
        assert.equal(init.headers['x-goog-api-key'], 'native-key');
        assert.match(payload.systemInstruction.parts[0].text, /写作助手/);
        return Response.json({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { thought: true, text: 'not output' },
                  { text: '{"title":"散步","story":"我们散步。"}' },
                ],
              },
            },
          ],
        });
      },
    );
    assert.equal(result.story, '我们散步。');
  }
});
test('connection test contacts the model without sending diary content', async () => {
  const result = await generateJournal(
    { action: 'test', notes: { host: 'PRIVATE_DIARY' } },
    'test-key',
    models,
    async (_, init) => {
      assert.equal(init.body.includes('PRIVATE_DIARY'), false);
      return response({ ok: true });
    },
  );
  assert.equal(result.connected, true);
});
test('server credentials cannot be redirected and arbitrary proxy targets are rejected', () => {
  const env = {
    DIARY_API_KEY: 'SERVER_TEXT_SECRET',
    DIARY_API_BASE_URL: 'https://api.xiaomimimo.com/v1',
    DIARY_TEXT_MODEL: 'mimo-v2.5',
    DIARY_IMAGE_API_KEY: 'SERVER_IMAGE_SECRET',
  };
  const text = resolveAIConnection(
    {
      action: 'story',
      apiBaseUrl: 'https://attacker.example/v1',
      protocol: 'gemini',
    },
    env,
  );
  assert.equal(text.models.baseUrl, env.DIARY_API_BASE_URL);
  assert.equal(text.models.protocol, 'openai');
  assert.equal(text.key, 'SERVER_TEXT_SECRET');
  const image = resolveAIConnection(
    { action: 'image', apiBaseUrl: 'https://attacker.example/v1' },
    env,
  );
  assert.equal(image.key, 'SERVER_IMAGE_SECRET');
  assert.equal(image.models.baseUrl, 'https://api.openai.com/v1');
  assert.throws(
    () =>
      resolveAIConnection(
        {
          action: 'story',
          key: 'user-key',
          textModel: 'vendor/model',
          apiBaseUrl: 'https://attacker.example/v1',
        },
        env,
      ),
    /转发/,
  );
  const allowed = resolveAIConnection(
    {
      action: 'story',
      key: 'user-key',
      textModel: 'vendor/model',
      apiBaseUrl: 'https://custom.example/v1',
    },
    { ...env, DIARY_ALLOWED_API_BASES: 'https://custom.example/v1' },
  );
  assert.equal(allowed.models.text, 'vendor/model');
  assert.equal(allowed.key, 'user-key');
  for (const url of [
    'http://example.com/v1',
    'https://localhost/v1',
    'https://127.0.0.1/v1',
    'https://user:secret@example.com/v1',
    'https://example.com/v1?key=secret',
  ])
    assert.throws(() => normalizeApiBaseUrl(url));
});
