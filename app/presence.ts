import type { Person } from './demo';

export const AWAY_DELAY = 2 * 60 * 1000;
export type Presence = { manualBusy: boolean; awaySince: number | null };
export type PresenceMap = Record<Person, Presence>;
export const initialPresence: PresenceMap = {
  林屿: { manualBusy: true, awaySince: null },
  许知夏: { manualBusy: false, awaySince: null },
};
export type PresenceEvent = 'leave' | 'return' | 'busy' | 'takeover';

export function transitionPresence(
  state: Presence,
  event: PresenceEvent,
  now: number,
): Presence {
  if (event === 'busy') return { ...state, manualBusy: true };
  if (event === 'takeover') return { manualBusy: false, awaySince: null };
  if (event === 'return')
    return state.awaySince === null ? state : { ...state, awaySince: null };
  return state.awaySince === null ? { ...state, awaySince: now } : state;
}
export function presenceStatus(state: Presence, now: number) {
  if (state.manualBusy) return 'busy';
  if (state.awaySince === null) return 'online';
  return now - state.awaySince >= AWAY_DELAY ? 'away' : 'grace';
}
export function canReceive(state: Presence, enabled: boolean, now: number) {
  const status = presenceStatus(state, now);
  return enabled && (status === 'busy' || status === 'away');
}
export function presenceLabel(state: Presence, now: number) {
  const status = presenceStatus(state, now);
  return status === 'busy'
    ? '忙碌'
    : status === 'away' || status === 'grace'
      ? '暂时离开'
      : '在线';
}
export function restorePresence(
  saved: unknown,
  legacyBusy: unknown,
): PresenceMap {
  const values = saved as Partial<PresenceMap> | undefined;
  const old = legacyBusy as Partial<Record<Person, boolean>> | undefined;
  const result = {} as PresenceMap;
  for (const person of ['林屿', '许知夏'] as Person[]) {
    const v = values?.[person];
    result[person] =
      v && typeof v.manualBusy === 'boolean'
        ? {
            manualBusy: v.manualBusy,
            awaySince:
              typeof v.awaySince === 'number' && Number.isFinite(v.awaySince)
                ? v.awaySince
                : null,
          }
        : {
            manualBusy:
              typeof old?.[person] === 'boolean'
                ? old[person]!
                : initialPresence[person].manualBusy,
            awaySince: null,
          };
  }
  return result;
}

// Event adapters stay separate from the state machine so tab/window changes can be tested without a browser.
export function observePresence(
  doc: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  leave: () => void,
  back: () => void,
) {
  const returnIfVisible = () => {
    if (doc.visibilityState !== 'hidden') back();
  };
  const visibility = () => {
    if (doc.visibilityState === 'hidden') leave();
    else back();
  };
  visibility();
  doc.addEventListener('visibilitychange', visibility);
  win.addEventListener('blur', leave);
  win.addEventListener('focus', returnIfVisible);
  win.addEventListener('pagehide', leave);
  win.addEventListener('pageshow', visibility);
  return () => {
    doc.removeEventListener('visibilitychange', visibility);
    win.removeEventListener('blur', leave);
    win.removeEventListener('focus', returnIfVisible);
    win.removeEventListener('pagehide', leave);
    win.removeEventListener('pageshow', visibility);
  };
}
