import type { Entry } from './journal-model';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cijian-journal-v2', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('journal');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('本机存储不可用，请检查浏览器设置'));
  });
}
export async function localRead<T>(key: string): Promise<T | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('journal', 'readonly');
      const req = tx.objectStore('journal').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function localWrite(key: string, value: unknown) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('journal', 'readwrite');
      tx.objectStore('journal').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error('本机空间不足，内容还在页面中，请导出备份'));
      tx.onabort = () => reject(new Error('本机保存中断，请重试'));
    });
  } finally {
    db.close();
  }
}
export function exportEntries(entries: Entry[]) {
  const blob = new Blob([JSON.stringify({ version: 2, entries }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '此间-共同记忆.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readPicture(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('请使用 JPG、PNG 或 WebP 图片');
  if (file.size > 8 * 1024 * 1024) throw new Error('请选择小于 8 MB 的图片');
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      typeof r.result === 'string'
        ? resolve(r.result)
        : reject(new Error('图片读取失败'));
    r.onerror = () => reject(new Error('图片读取失败，请重试'));
    r.readAsDataURL(file);
  });
}
