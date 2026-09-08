import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyStyle,
  restoreStyles,
  learnMessage,
  correctStyle,
  styleContext,
} from '../app/speaking-style.ts';

test('learns only the author and never learns assistant messages', () => {
  let styles = restoreStyles(null);
  const human = {
    id: 'human',
    from: '林屿',
    text: '好呀，先歇会儿～',
    sources: [],
  };
  styles = learnMessage(styles, human);
  assert.equal(styles.林屿.samples.length, 1);
  assert.equal(styles.许知夏.samples.length, 0);
  assert.equal(learnMessage(styles, human), styles);
  assert.equal(
    learnMessage(styles, {
      ...human,
      id: 'ai',
      from: '此间',
      assistantFor: '林屿',
    }),
    styles,
  );
});
test('disabled styles neither collect messages nor expose existing examples', () => {
  const styles = restoreStyles({
    林屿: {
      enabled: false,
      instructions: '叫宝贝',
      samples: [{ id: 'a', text: '宝贝呀', source: 'message' }],
    },
  });
  assert.equal(
    learnMessage(styles, { id: 'b', from: '林屿', text: '今天好累' }),
    styles,
  );
  assert.deepEqual(styleContext(styles.林屿).examples, []);
  assert.ok(!JSON.stringify(styleContext(styles.林屿)).includes('宝贝'));
});
test('corrections are prioritized, replaced by id and survive restoration', () => {
  let style = correctStyle(emptyStyle(), 'r1', '辛苦啦');
  style = correctStyle(style, 'r1', '辛苦啦，先休息');
  assert.equal(style.samples.length, 1);
  const restored = restoreStyles(JSON.parse(JSON.stringify({ 林屿: style })));
  assert.deepEqual(styleContext(restored.林屿).examples, ['辛苦啦，先休息']);
  assert.deepEqual(styleContext(restored.许知夏).examples, []);
});
test('bounded samples and clearing start fresh without scanning old messages', () => {
  let styles = restoreStyles(null);
  for (let i = 0; i < 50; i++)
    styles = learnMessage(styles, {
      id: String(i),
      from: '林屿',
      text: `好呀${i}`,
    });
  assert.equal(styles.林屿.samples.length, 40);
  styles.林屿 = emptyStyle();
  styles = learnMessage(styles, { id: 'new', from: '林屿', text: '新的表达' });
  assert.deepEqual(
    styles.林屿.samples.map((s) => s.id),
    ['new'],
  );
});
