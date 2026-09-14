import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'cijian-test-'));
await build({
  entryPoints: ['app/journal-model.ts', 'app/journal-ai.ts'],
  outdir: dir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  outExtension: { '.js': '.mjs' },
});
const { newEntry, validateEntry, migrateLegacy, migrateSharedMemories } =
  await import(join(dir, 'journal-model.mjs'));
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
test('legacy diary and only shared relationship memories are preserved', () => {
  const old = {
    version: 1,
    entries: [
      {
        id: 'old',
        date: '2026-09-01',
        title: '原来的日记',
        notes: { xia: { text: '我说的话' }, yu: { text: '你说的话' } },
      },
    ],
  };
  const migrated = migrateLegacy(JSON.stringify(old));
  assert.equal(migrated[0].story, '我说的话\n\n你说的话');
  assert.equal(migrated[0].notes.guest, '你说的话');
  const shared = migrateSharedMemories(
    JSON.stringify({
      memories: [
        { id: '1', title: '共同', text: '已共享', shared: true },
        { id: '2', title: '私人', text: '不共享', shared: false },
      ],
    }),
  );
  assert.equal(shared.length, 1);
  assert.equal(shared[0].story, '已共享');
});
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
