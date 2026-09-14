import assert from 'node:assert/strict';
const base = process.env.CIJIAN_TEST_URL || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(base))
  throw new Error('Integration tests must target a local test server');
async function call(path, body, token) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json() };
}
const host = await call('/api/beta/session', {
  action: 'create',
  displayName: '验收甲',
});
assert.equal(host.status, 201, JSON.stringify(host));
const guest = await call('/api/beta/session', {
  action: 'join',
  displayName: '验收乙',
  inviteCode: host.body.space.inviteCode,
});
assert.equal(guest.status, 201, JSON.stringify(guest));
const third = await call('/api/beta/session', {
  action: 'join',
  displayName: '验收丙',
  inviteCode: host.body.space.inviteCode,
});
assert.equal(third.status, 409);
const entry = {
  id: crypto.randomUUID(),
  date: '2026-09-14',
  title: '双人存储验证',
  story: '一起吃了面。',
  notes: { host: '下雨，一起吃面', guest: '' },
  mode: 'faithful',
  pictures: [],
  references: [],
  revision: 0,
  updatedAt: Date.now(),
};
const saved = await call('/api/diary/entries', entry, host.body.token);
assert.equal(saved.status, 200, JSON.stringify(saved));
assert.equal(saved.body.entry.revision, 1);
const read = await call('/api/diary/entries', undefined, guest.body.token);
assert.equal(read.body.entries[0].story, entry.story);
const updated = await call(
  '/api/diary/entries',
  {
    ...saved.body.entry,
    story: '一起吃面，还聊了很久。',
    notes: { ...entry.notes, guest: '聊了很久' },
  },
  guest.body.token,
);
assert.equal(updated.status, 200, JSON.stringify(updated));
const collision = await call(
  '/api/diary/entries',
  { ...saved.body.entry, story: '旧版本修改' },
  host.body.token,
);
assert.equal(collision.status, 409);
const tamper = await call(
  '/api/diary/entries',
  { ...updated.body.entry, notes: { host: '被篡改', guest: '聊了很久' } },
  guest.body.token,
);
assert.equal(tamper.status, 409);
const unauth = await call('/api/diary/entries');
assert.equal(unauth.status, 401);
const other = await call('/api/beta/session', {
  action: 'create',
  displayName: '其他空间',
});
const otherRead = await call('/api/diary/entries', undefined, other.body.token);
assert.equal(otherRead.body.entries.length, 0);
const missingAI = await call('/api/diary/ai', {
  action: 'story',
  notes: { host: '一起吃面', guest: '' },
});
assert.equal(missingAI.status, 503);
assert.match(missingAI.body.error, /设置/);
const imageBytes = await (
  await fetch(base + '/memories/rainy-noodles.jpg')
).arrayBuffer();
const data =
  'data:image/jpeg;base64,' + Buffer.from(imageBytes).toString('base64');
const upload = await call('/api/diary/assets', { data }, host.body.token);
assert.equal(upload.status, 200, JSON.stringify(upload));
const asset = await fetch(base + upload.body.src, {
  headers: { Authorization: `Bearer ${guest.body.token}` },
});
assert.equal(asset.status, 200);
assert.equal((await asset.arrayBuffer()).byteLength, imageBytes.byteLength);
const foreignAsset = await fetch(base + upload.body.src, {
  headers: { Authorization: `Bearer ${other.body.token}` },
});
assert.equal(foreignAsset.status, 404);
const final = await call(
  '/api/diary/entries',
  {
    ...updated.body.entry,
    pictures: [
      { id: 'image', src: upload.body.src, kind: 'uploaded', prompt: '' },
    ],
  },
  host.body.token,
);
assert.equal(final.status, 200, JSON.stringify(final));
console.log(
  'PASS: cloud integration checks — create/join, two-member limit, shared save/read, conflict, authorship, room isolation, missing AI, upload/read/image ownership.',
);
