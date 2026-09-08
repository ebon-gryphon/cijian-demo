import type { MemoryAttachment } from './demo';

export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const DB_NAME = 'between-us-attachments-v1';
const STORE_NAME = 'files';

export function attachmentKind(
  type: string,
  name: string,
): MemoryAttachment['kind'] {
  const normalized = type.toLowerCase();
  if (
    normalized.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(name)
  )
    return 'image';
  if (
    normalized.startsWith('video/') ||
    /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(name)
  )
    return 'video';
  return 'file';
}

export function attachmentIssue(
  file: Pick<File, 'name' | 'size' | 'type'>,
  count: number,
) {
  if (count >= MAX_ATTACHMENTS)
    return `每条记忆最多添加 ${MAX_ATTACHMENTS} 个附件`;
  if (attachmentKind(file.type, file.name) === 'video')
    return '暂不支持上传视频，可以添加图片或文件';
  if (file.size > MAX_ATTACHMENT_BYTES)
    return `${file.name} 超过 100 MB，暂时无法添加`;
  if (!file.name.trim()) return '无法识别这个文件';
  return '';
}

export function attachmentMetadata(file: File, id: string): MemoryAttachment {
  return {
    id,
    name: file.name.slice(0, 180),
    type: file.type.slice(0, 120),
    size: file.size,
    kind: attachmentKind(file.type, file.name),
  };
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function openAttachmentDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持本地附件存储'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('无法打开附件存储'));
  });
}

async function useStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openAttachmentDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('附件存储失败'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('附件存储失败'));
    };
  });
}

export async function saveAttachmentBlob(id: string, file: Blob) {
  await useStore('readwrite', (store) => store.put(file, id));
}

export function readAttachmentBlob(id: string) {
  return useStore<Blob | undefined>('readonly', (store) => store.get(id));
}

export async function deleteAttachmentBlob(id: string) {
  await useStore('readwrite', (store) => store.delete(id));
}
