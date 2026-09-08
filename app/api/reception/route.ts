import { generateReception } from '../../model-service';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: '不支持跨站请求' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json(
      { error: '请使用 JSON 请求' },
      { status: 415, headers },
    );
  try {
    // Bound the actual stream, not only the optional Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new Error('请求为空');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 150000) {
        await reader.cancel();
        return Response.json(
          { error: '请求内容过大' },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    const content = await generateReception(
      body,
      fetch,
      process.env.MODEL_ALLOWED_ORIGINS ?? '',
      request.signal,
    );
    return Response.json({ content }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safe = /^(请|请求|API Key|此自定义接口|模型)/.test(message)
      ? message
      : '模型连接失败或超时，请稍后再试';
    return Response.json({ error: safe }, { status: 400, headers });
  }
}
