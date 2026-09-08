import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL_SETTINGS,
  normalizeModelSettings,
  restoreModelSettings,
  modelSettingsIssue,
  modelDisplayName,
} from '../app/model-settings.ts';

test('missing and malformed settings restore to safe defaults for each person', () => {
  assert.deepEqual(normalizeModelSettings(null), DEFAULT_MODEL_SETTINGS);
  const restored = restoreModelSettings({
    林屿: { provider: 'unknown', apiKey: 42, model: 'invented' },
  });
  assert.deepEqual(restored.林屿, DEFAULT_MODEL_SETTINGS);
  assert.deepEqual(restored.许知夏, DEFAULT_MODEL_SETTINGS);
  assert.notEqual(restored.林屿, restored.许知夏);
});

test('provider presets keep only supported models and never retain a custom url', () => {
  assert.deepEqual(
    normalizeModelSettings({
      provider: 'deepseek',
      apiKey: '  secret  ',
      model: 'not-a-model',
      baseUrl: 'https://example.com',
    }),
    {
      provider: 'deepseek',
      apiKey: 'secret',
      model: 'deepseek-v4-flash',
      baseUrl: '',
    },
  );
});

test('custom settings validate key, model and endpoint before saving', () => {
  const custom = normalizeModelSettings({
    provider: 'custom',
    apiKey: 'key',
    model: 'my-model',
    baseUrl: 'https://api.example.com/v1',
  });
  assert.equal(modelSettingsIssue(custom), '');
  assert.equal(modelDisplayName(custom), 'my-model');
  assert.equal(
    modelSettingsIssue({ ...custom, apiKey: '' }),
    '请先填写 API Key',
  );
  assert.equal(
    modelSettingsIssue({ ...custom, baseUrl: 'file:///tmp/api' }),
    '请填写有效的 API 地址',
  );
});

test('preset models use their readable labels', () => {
  assert.equal(modelDisplayName(DEFAULT_MODEL_SETTINGS), 'GPT-5.2');
});
