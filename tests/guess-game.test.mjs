import test from 'node:test';
import assert from 'node:assert/strict';
import { initialGuessState, submitGuess, guessView, restoreGuessState, nextGuess, isRevealed, guessQuestions } from '../app/guess-game.ts';

test('partner values remain hidden until both submit, then guesses compare to actual choices', () => {
  const first = submitGuess(initialGuessState(), '林屿', { self: 0, guess: 2 });
  const waiting = guessView(first.rounds.evening, '许知夏');
  assert.equal(waiting.partnerSubmitted, true);
  assert.equal(waiting.partner, undefined);
  assert.equal(waiting.revealed, false);
  const both = submitGuess(first, '许知夏', { self: 2, guess: 1 });
  const result = guessView(both.rounds.evening, '林屿');
  assert.equal(result.revealed, true);
  assert.equal(result.own.guess, result.partner.self);
  assert.notEqual(result.partner.guess, result.own.self);
});

test('answers can be revised before reveal and become immutable after reveal', () => {
  const first = submitGuess(initialGuessState(), '许知夏', { self: 0, guess: 0 });
  const edited = submitGuess(first, '许知夏', { self: 3, guess: 1 });
  assert.deepEqual(edited.rounds.evening.许知夏, { self: 3, guess: 1 });
  assert.equal(edited.rounds.evening.林屿, undefined);
  const revealed = submitGuess(edited, '林屿', { self: 1, guess: 2 });
  assert.equal(submitGuess(revealed, '许知夏', { self: 1, guess: 0 }), revealed);
});

test('changing questions preserves completed answers and cannot strand a pending round', () => {
  const initial = initialGuessState();
  assert.notEqual(nextGuess(initial).questionId, initial.questionId);
  const waiting = submitGuess(initial, '林屿', { self: 1, guess: 2 });
  assert.equal(nextGuess(waiting), waiting);
  const revealed = submitGuess(waiting, '许知夏', { self: 2, guess: 1 });
  const next = nextGuess(revealed);
  assert.notEqual(next.questionId, revealed.questionId);
  assert.deepEqual(next.rounds.evening, revealed.rounds.evening);
});

test('saved games retain identities and pending/revealed state across reloads', () => {
  const first = submitGuess(initialGuessState(), '林屿', { self: 0, guess: 3 });
  const restored = restoreGuessState(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(restored, first);
  assert.equal(isRevealed(restored.rounds.evening), false);
  const both = submitGuess(restored, '许知夏', { self: 3, guess: 0 });
  assert.equal(isRevealed(restoreGuessState(JSON.parse(JSON.stringify(both))).rounds.evening), true);
});

test('corrupt storage and invalid choices cannot reveal a fabricated partner response', () => {
  for (const raw of [null, 'bad', 1, { questionId: 'missing', rounds: null }]) assert.deepEqual(restoreGuessState(raw), initialGuessState());
  const restored = restoreGuessState({ questionId: 'evening', rounds: { evening: { 林屿: { self: 9, guess: 0 }, 许知夏: { self: 0, guess: 2 } }, missing: { 林屿: { self: 1, guess: 2 } } } });
  assert.equal(restored.rounds.evening.林屿, undefined);
  assert.equal(restored.rounds.missing, undefined);
  assert.equal(guessView(restored.rounds.evening, '许知夏').revealed, false);
  const initial = initialGuessState();
  assert.equal(submitGuess(initial, '林屿', { self: -1, guess: 0 }), initial);
});

test('finishing the deck preserves history without automatically recycling questions', () => {
  let state = initialGuessState();
  for (const q of guessQuestions) {
    state = { ...state, questionId: q.id };
    state = submitGuess(state, '林屿', { self: 1, guess: 2 });
    state = submitGuess(state, '许知夏', { self: 2, guess: 1 });
  }
  assert.equal(nextGuess(state), state);
  assert.equal(Object.keys(state.rounds).length, guessQuestions.length);
});
