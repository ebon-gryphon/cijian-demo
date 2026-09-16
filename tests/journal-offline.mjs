import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const calls = [];
  let outcome = 'success';
  await page.route('https://api.openai.com/v1/**', async (route) => {
    const request = route.request();
    calls.push({ url: request.url(), body: request.postDataJSON(), headers: request.headers() });
    if (outcome === 'network') return route.abort('failed');
    if (outcome === 'unauthorized')
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ finish_reason: 'stop', message: {
        content: JSON.stringify({ title: '一个人的午后', story: '下午在窗边读书，记下今天的片段。' }),
      } }] }),
    });
  });
  await page.goto(pathToFileURL(resolve('打开此间.html')).href);
  await page.locator('#note-host').fill('下午在窗边读书');
  assert.equal(await page.locator('#note-guest').inputValue(), '');
  const generate = () => page.getByRole('button', { name: /^(写成我们的故事|重新生成故事)$/ });
  await generate().click();
  await page.getByRole('alert').filter({ hasText: 'AI 设置' }).waitFor();
  assert.equal(calls.length, 0);
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  await page.getByLabel('API Key', { exact: true }).fill('  test-only-offline-key  ');
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  await generate().click();
  await page.getByRole('status').filter({ hasText: '故事已写好' }).waitFor();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, 'Bearer test-only-offline-key');
  const input = JSON.parse(calls[0].body.messages[1].content);
  assert.equal(input.notes.host, '下午在窗边读书');
  assert.equal(input.notes.guest, '');
  const story = page.getByRole('textbox', { name: '故事正文', exact: true });
  await story.fill('下午在窗边读书，还喝了一杯茶。');
  await page.getByRole('button', { name: '存入共同记忆', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已保存到本机共同记忆' }).waitFor();
  outcome = 'unauthorized';
  await generate().click();
  await page.getByRole('alert').filter({ hasText: '密钥无效' }).waitFor();
  assert.equal(await story.inputValue(), '下午在窗边读书，还喝了一杯茶。');
  outcome = 'network';
  await generate().click();
  await page.getByRole('alert').filter({ hasText: '无法连接模型服务' }).waitFor();
  assert.equal(await page.locator('#note-host').inputValue(), '下午在窗边读书');
  await page.reload();
  await story.waitFor();
  assert.equal(await story.inputValue(), '下午在窗边读书，还喝了一杯茶。');
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '');
  assert.deepEqual(errors, []);
  console.log('PASS: file:// single-person generation with mocked provider, editing, local save/reload, missing/invalid key, network failure, key cleared on reload.');
} finally {
  await browser.close();
}
