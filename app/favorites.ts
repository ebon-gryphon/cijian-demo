import type { Message, Person } from './demo';

// Deliberately not a Memory: no sharing, confirmation, tags, or assistant retrieval path.
export type PrivateFavorite = {
  id: string;
  owner: Person;
  visibility: 'private';
  source: {
    messageId: string;
    speaker: Person;
    text: string;
    sentAt: number | null;
  };
  note: string;
  savedAt: number;
};
export function canFavorite(message: Message, person: Person) {
  return (
    message.from !== '此间' && message.from !== person && !message.assistantFor
  );
}
export function ownFavorites(favorites: PrivateFavorite[], person: Person) {
  return favorites.filter((f) => f.owner === person);
}
export function saveFavorite(
  favorites: PrivateFavorite[],
  message: Message,
  person: Person,
  note: string,
  now: number,
): PrivateFavorite[] {
  if (!canFavorite(message, person)) return favorites;
  const existing = favorites.find(
    (f) => f.owner === person && f.source.messageId === message.id,
  );
  if (existing) return editFavorite(favorites, existing.id, person, note);
  return [
    ...favorites,
    {
      id: `favorite:${person}:${message.id}`,
      owner: person,
      visibility: 'private',
      source: {
        messageId: message.id,
        speaker: message.from as Person,
        text: message.text,
        sentAt: message.sentAt ?? null,
      },
      note: note.trim().slice(0, 600),
      savedAt: now,
    },
  ];
}
export function editFavorite(
  favorites: PrivateFavorite[],
  id: string,
  person: Person,
  note: string,
) {
  return favorites.map((f) =>
    f.id === id && f.owner === person
      ? { ...f, note: note.trim().slice(0, 600) }
      : f,
  );
}
export function removeFavorite(
  favorites: PrivateFavorite[],
  id: string,
  person: Person,
) {
  return favorites.filter((f) => f.id !== id || f.owner !== person);
}
export function restoreFavorite(
  favorites: PrivateFavorite[],
  item: PrivateFavorite,
  person: Person,
) {
  return item.owner !== person ||
    favorites.some(
      (f) => f.owner === person && f.source.messageId === item.source.messageId,
    )
    ? favorites
    : [...favorites, item];
}
export function parseFavorites(value: unknown): PrivateFavorite[] {
  if (!Array.isArray(value)) return [];
  const people = ['林屿', '许知夏'];
  const validTime = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const result: PrivateFavorite[] = [];
  for (const f of value) {
    if (
      !f ||
      !people.includes(f.owner) ||
      !f.source ||
      !people.includes(f.source.speaker) ||
      f.owner === f.source.speaker ||
      typeof f.source.messageId !== 'string' ||
      typeof f.source.text !== 'string' ||
      typeof f.note !== 'string' ||
      !validTime(f.savedAt)
    )
      continue;
    if (
      result.some(
        (item) =>
          item.owner === f.owner &&
          item.source.messageId === f.source.messageId,
      )
    )
      continue;
    result.push({
      id: `favorite:${f.owner}:${f.source.messageId}`,
      owner: f.owner,
      visibility: 'private',
      source: {
        messageId: f.source.messageId,
        speaker: f.source.speaker,
        text: f.source.text,
        sentAt: validTime(f.source.sentAt) ? f.source.sentAt : null,
      },
      note: f.note.slice(0, 600),
      savedAt: f.savedAt,
    });
  }
  return result;
}
