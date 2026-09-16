import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Shorten only request timeouts to exercise stalled requests without a minute-long test.
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (ms) => timeout(ms >= 60000 ? 1800 : ms);
  });
  let mode = 'success';
  let calls = 0;
  const pending = [];
  const output = { title: '窗边的午后', story: '午后在窗边读书，喝了一杯茶。' };
  const intercept = async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    calls++;
    if (mode === 'hold') {
      pending.push(route);
      return;
    }
    if (mode === 'error')
      return route.fulfill({
        status: 401,
        json: { error: '密钥无效或没有所选模型的权限，请检查 AI 设置' },
      });
    const json = route.request().url().includes('api.openai.com')
      ? {
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(output) },
            },
          ],
        }
      : output;
    await route.fulfill({ json });
  };
  await page.route('https://api.openai.com/v1/**', intercept);
  await page.route('**/api/diary/ai', intercept);
  await page.goto(
    process.env.CIJIAN_TEST_URL || pathToFileURL(resolve('打开此间.html')).href,
  );
  const story = page.getByRole('textbox', { name: '故事正文', exact: true });
  await story.waitFor();
  assert.equal(await story.inputValue(), '');
  await page.locator('#note-host').fill('午后在窗边读书');
  const generate = () =>
    page.getByRole('button', { name: /^(写成我们的故事|重新生成故事)$/ });
  await generate().click();
  await page
    .locator('.generation-feedback')
    .filter({ hasText: 'AI 设置' })
    .waitFor();
  assert.equal(calls, 0);
  await page.getByRole('button', { name: '检查 AI 设置', exact: true }).click();
  await page.getByLabel('API Key', { exact: true }).fill('test-only-key');
  await page.getByRole('button', { name: '应用设置', exact: true }).click();
  await generate().click();
  await page.getByRole('status').filter({ hasText: '故事已写好' }).waitFor();
  assert.equal(await story.inputValue(), output.story);
  await story.fill('保留我的修改');
  mode = 'error';
  await generate().click();
  await page
    .locator('.generation-feedback')
    .filter({ hasText: '密钥无效' })
    .waitFor();
  assert.equal(await story.inputValue(), '保留我的修改');
  mode = 'hold';
  await generate().click();
  await page
    .getByRole('status')
    .filter({ hasText: '正在整理你的片段' })
    .waitFor();
  await page.getByRole('button', { name: '取消生成', exact: true }).click();
  await page
    .locator('.generation-feedback')
    .filter({ hasText: '生成已取消' })
    .waitFor();
  assert.equal(await story.inputValue(), '保留我的修改');
  await generate().click();
  await page
    .locator('.generation-feedback')
    .filter({ hasText: '模型响应超时' })
    .waitFor();
  assert.equal(await story.inputValue(), '保留我的修改');
  for (const route of pending) await route.abort().catch(() => {});
  mode = 'success';
  await generate().click();
  await page.getByRole('status').filter({ hasText: '故事已写好' }).waitFor();
  assert.equal(await story.inputValue(), output.story);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: '/tmp/cijian-generation-fixed.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: visible output, single-person generation, inline errors, cancellation, timeout, preserved text, retry and mobile layout; provider mocked.',
  );
} finally {
  await browser.close();
}
