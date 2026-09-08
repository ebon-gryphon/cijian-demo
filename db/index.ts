import { env } from 'cloudflare:workers';

export function getD1(): D1Database {
  if (!env.DB) throw new Error('数据库暂时不可用');
  return env.DB;
}
