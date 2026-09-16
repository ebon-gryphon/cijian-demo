import assert from 'node:assert/strict';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rT8AAAAASUVORK5CYII=';
try {
  for (const preset of ['gemini', 'seedream', 'openai']) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let sent;
    await page.route('**/api/diary/ai', async (route) => {
      if (route.request().method() !== 'POST')
        return route.fulfill({
          json: {
            configured: false,
            imageConfigured: false,
            textModel: 'test',
            imageModel: 'image-test',
          },
        });
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { image: `data:image/png;base64,${png}` } });
    });
    await page.goto(process.env.CIJIAN_TEST_URL || 'http://localhost:3019');
    await page
      .getByRole('textbox', { name: '故事正文', exact: true })
      .fill('一起看海。');
    await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
    await page.getByText('配图服务（可选，单独配置）', { exact: true }).click();
    await page.getByLabel('图片服务预设', { exact: true }).selectOption(preset);
    assert.equal(
      await page.getByLabel('图片接口协议', { exact: true }).inputValue(),
      preset,
    );
    await page.getByLabel('图片模型', { exact: true }).fill('image-test');
    await page
      .getByLabel('图片 API Key', { exact: true })
      .fill('image-test-only');
    assert.equal(
      await page.getByLabel('API Key', { exact: true }).inputValue(),
      '',
    );
    await page.getByRole('button', { name: '应用设置', exact: true }).click();
    await page.getByRole('button', { name: '为故事配图', exact: true }).click();
    await page.getByLabel('自定义图片风格', { exact: true }).fill('水彩');
    await page.getByLabel('最想画下哪一幕？', { exact: true }).fill('海边');
    await page
      .getByRole('textbox', {name: '人物有哪些需要保留的细节？', exact: true })
      .fill('背影');
    await page
      .getByRole('button', { name: '我自己写提示词', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: '图片提示词', exact: true })
      .fill('海边');
    await page.getByRole('button', { name: '确认并生图', exact: true }).click();
    await page.locator('.result-image').waitFor();
    assert.equal(sent.imageProtocol, preset);
    assert.equal(sent.imageModel, 'image-test');
    assert.equal(sent.key, 'image-test-only');
    assert.equal(sent.action, 'image');
    assert.deepEqual(errors, []);
    if (preset === 'gemini')
      await page.screenshot({ path: '/tmp/cijian-image-result.png' });
    await page.close();
  }
  console.log(
    'Image UI passed: independent keys, three protocol selections, correct proxy payloads, visible results on mobile.',
  );
} finally {
  await browser.close();
}
