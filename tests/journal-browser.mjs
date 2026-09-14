const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3000/');
await page.getByRole('heading', { name: '今天，我们记住什么？' }).waitFor();
await page.getByRole('button', { name: '我想自己写', exact: true }).waitFor();
await page.screenshot({ path: '/tmp/cijian-desktop.png', fullPage: true });
await page.getByRole('button', { name: /连接两个人/ }).click();
await page.getByRole('button', { name: '仅在本机体验', exact: true }).click();
await page.getByRole('button', { name: '我想自己写', exact: true }).click();
await page
  .getByRole('textbox', { name: '故事标题', exact: true })
  .fill('一起写的周末');
await page
  .getByRole('textbox', { name: '故事正文', exact: true })
  .fill('下雨天，我们一起煮了一锅面。');
await page.locator('#note-host').fill('周末下雨一起煮面');
await page.getByRole('button', { name: '切换到你的视角' }).click();
await page.locator('#note-guest').fill('面糊了但很好笑');
await page.getByRole('button', { name: '存入共同记忆', exact: true }).click();
await page
  .getByRole('status')
  .filter({ hasText: '已保存到本机共同记忆' })
  .waitFor();
await page.getByRole('tab', { name: '共同记忆', exact: true }).click();
assert.equal(
  await page
    .getByRole('heading', { name: '一起写的周末', exact: true })
    .count(),
  1,
);
await page.reload();
await page.getByRole('textbox', { name: '故事正文', exact: true }).waitFor();
assert.equal(
  await page
    .getByRole('textbox', { name: '故事正文', exact: true })
    .inputValue(),
  '下雨天，我们一起煮了一锅面。',
);
await page.getByRole('button', { name: '为故事配图', exact: true }).click();
await page.getByRole('button', { name: '我自己写提示词', exact: true }).click();
await page
  .getByRole('textbox', { name: '图片提示词', exact: true })
  .fill('水彩风，两人在雨天一起煮面');
await page.getByRole('button', { name: '确认并生图', exact: true }).click();
await page.getByRole('alert').filter({ hasText: 'AI 设置' }).waitFor();
assert.equal(
  await page
    .getByRole('textbox', { name: '图片提示词', exact: true })
    .inputValue(),
  '水彩风，两人在雨天一起煮面',
);
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page
  .locator('input[type=file]')
  .setInputFiles('public/memories/rainy-noodles.jpg');
await page.getByRole('button', { name: '改图', exact: true }).waitFor();
await page.getByRole('button', { name: '改图', exact: true }).click();
await page
  .getByRole('heading', { name: '给照片一点新模样', exact: true })
  .waitFor();
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '/tmp/cijian-mobile.png', fullPage: true });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
assert.equal(overflow, false);
assert.deepEqual(errors, []);
console.log(
  'PASS: browser write/edit, switch perspectives, save, archive, reload, clarification, retained prompt on AI error, upload/edit entry, mobile overflow, no page errors.',
);
await browser.close();
