import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  attachmentKind,
  attachmentIssue,
  formatFileSize,
} from '../app/attachments.ts';

test('images and videos are recognized by mime type or filename', () => {
  assert.equal(attachmentKind('image/jpeg', 'photo.bin'), 'image');
  assert.equal(attachmentKind('', 'holiday.WEBP'), 'image');
  assert.equal(attachmentKind('video/mp4', 'clip.bin'), 'video');
  assert.equal(attachmentKind('', 'memory.MOV'), 'video');
  assert.equal(attachmentKind('application/pdf', 'letter.pdf'), 'file');
});

test('attachment limits reject excess count and oversized files', () => {
  assert.match(
    attachmentIssue(
      { name: 'a.txt', size: 1, type: 'text/plain' },
      MAX_ATTACHMENTS,
    ),
    /最多/,
  );
  assert.match(
    attachmentIssue({ name: 'clip.mp4', size: 1024, type: 'video/mp4' }, 0),
    /不支持上传视频/,
  );
  assert.match(
    attachmentIssue(
      {
        name: 'large.zip',
        size: MAX_ATTACHMENT_BYTES + 1,
        type: 'application/zip',
      },
      0,
    ),
    /100 MB/,
  );
  assert.equal(
    attachmentIssue({ name: 'ok.pdf', size: 1024, type: 'application/pdf' }, 0),
    '',
  );
});

test('file sizes remain compact and readable', () => {
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2 KB');
  assert.equal(formatFileSize(1.5 * 1024 * 1024), '1.5 MB');
});
