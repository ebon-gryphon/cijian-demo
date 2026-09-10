import test from 'node:test';
import assert from 'node:assert/strict';
import { addDemoMemoryPhotos, initialMemories } from '../app/demo.ts';

test('old demo gets photos once without resetting edited memories or messages', () => {
  const old = initialMemories.filter((m) => !m.id.startsWith('demo-')).map((m) => ({ ...m, attachments: undefined }));
  const upgraded = addDemoMemoryPhotos(old);
  assert.equal(upgraded.length, old.length + 2);
  assert.equal(upgraded.find((m) => m.id === 'noodle').attachments[0].id, 'demo-photo-noodles');
  const edited = old.map((m) => m.id === 'noodle' ? { ...m, text: '我自己的回忆' } : m);
  assert.equal(addDemoMemoryPhotos(edited).find((m) => m.id === 'noodle').attachments, undefined);
  assert.deepEqual(addDemoMemoryPhotos(old, 1), old);
  assert.deepEqual(addDemoMemoryPhotos([]), []);
});
