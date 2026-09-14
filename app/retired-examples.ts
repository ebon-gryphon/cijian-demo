import type { Entry } from './journal-model';
// Exact content fingerprints retire untouched shipped examples without matching user keywords.
const retired = new Set([
  'f32af2b8a5da19e1c2ef6a303e438ea298e98838dbcc8466a61404274018ca38',
  'd51be73dbce01d494dfe61dbfaaa98c13b7b65d8d21fb236cbe46f2af4b8a509',
  '654de749ecc3b2092a082aa337210ea60399dde640231cd474beae03e09d1edd',
  '356bf6fafd504edaaaa526f2171eddcbe71dd0e042e37a734a713f7064327fa0',
  '1110c3ffab006f95466ec3572ea17c2ed9c4e88f650bcebf4c61cf7d541589b1',
  'b35204036c32ebf63c354f8d297d40c87642fd2b4546fccc1dcc9f93b9bb3eb3',
  'eab863d095f3b67bcb975f841063a5a60c801c2e50595bd61e0b4f24ab0f7d3b',
  '7ec5e57a66c3e434d6d1775fea945a20c7ef87d34845071c88fb5e740214560d',
  '4f79b8624cd73d33fb5d9151894f42473ed04e82f8426be419c687da7b25a68b',
  '93f44e995b251a4fd2d5ff7b8e9b5e160f5de457e13dc64cd95fbc2941606716',
  'd14dd8e427efd99aecc4366574a364fb88c4cdb826c7caca0a72e9d2aba750bd',
  'def01d5ae16b1b92bbd8d05eec879fb7ecddba09c2d61e2302482ff6cf991f4b',
  'bb0be39ded390fba13080fbab74a061087e15a7effb9c7449a68c0b663527f70',
  '9f87a1d7ee5de5dc567a03d7ae450b76022b5ba4c6d357fbf4c3f03df37cd1fa',
  '81ea3d7b7f26e4a9fe4e140bb75040821332072551d5f3634e5cb76e95309328',
  '9e7e048ff3eb7d208326b5bd410ab020a754a402561d6b5ffdd9ace8e08815d5',
  '2f3df9ba75b992ac16c2ec0ec384afd36b10a617ac9073bba3d07e3875cd0984',
  '092d68e3220591e11afe484522b457183b4eaf999af5bfce05146c5eb1dde840',
  '57d37abdde0f9faba4ee9baca1990d692952014f44d3b8e211eb74739bc72c6a',
  '0033922a381b3b95b34f93b779f1666583ab115aa11380c8c7cde24e68efbf1c',
  'e3c47f3a0e4e00a059a5b80942f6a9a9ef720c50a6d9555e5a326941d73bd86c',
  '8091d1ba609f6764a960b3a9aeb87ed93710315ce197e58f5e2dd5c33dd827c3',
  '8d956daa44c66e4d605d2239f9e4f7551ced9a57adc1aba4da0336e28b9b7b53',
  'a05eebf40213a93b92e1f6a9034814d94b4718f772130f066a1b2f48b2d76b7a',
  'f2936436e5b4fef3bb4d6e14a2ef925fd6f2b45286ce26d39d53b09928dd1e1b',
  'b2080a15c99968a5e1f1c941722585b4b0b275981b9f209bfb74319e3a5c9178',
  '9cc4ba74c9eb14ff9a57efa926ced3ce1889b7b53d6496f025457718c10fbeb4',
  '668a52bce7d73de53bc599a44bea3e182453bb15a8e69f494b18075dd66f8d3d',
  '5d2954e47728bb0a66dd663a10eaeb76b97b9b161b2b3bfaa37f1ce415718bcb',
  '490e82b45be5032eb3ba23ed90af0010b193258b739133f00edcbba5c705b5cd',
  'cac8c2b3b2ad977897bef524a88eae3dd8c1491da108d4aa7778788f487cbdd7',
  '497c5421214248bfc50803b3e3412628893c52060ba35a2ea5568d26cb88174e',
  '479a4a6a14a3995a4f550c1f6025c8235b1fae4ddc5495cf3acd078537140a99',
  'f2ad8fbd83ccb7cf9339f606ccafb2bd6e4f72bdcae761767afc77b04e5ffb56',
]);
const retiredImageHashes = new Set([
  '117e76b788cf43a018c23446f1eab7f8c451ba12d0ee8c205b7264a5c46f9d7f',
  '4baa619b5fa54837d96953f4407c8611f9d2b614d47cc0fef9353c23edf1516a',
  '888811f5fc54f12ab04b6e3f67171e532756ff3135af691dc9c6f2ea632f544c',
]);
async function digestText(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
export async function isRetiredExample(entry: Entry): Promise<boolean> {
  const content = JSON.stringify([
    entry.title,
    entry.story,
    entry.notes.host,
    entry.notes.guest,
  ]);
  if (!retired.has(await digestText(content))) return false;
  for (const picture of entry.pictures) {
    if (
      /^\/memories\/(rainy-noodles|west-lake|weekend-breakfast)\.jpg$/.test(
        picture.src,
      )
    )
      continue;
    if (
      picture.src.startsWith('data:image/jpeg;base64,') &&
      retiredImageHashes.has(await digestText(picture.src))
    )
      continue;
    return false;
  }
  return true;
}
export async function withoutRetiredExamples(
  entries: Entry[],
): Promise<Entry[]> {
  const flags = await Promise.all(entries.map(isRetiredExample));
  return entries.filter((_, i) => !flags[i]);
}
