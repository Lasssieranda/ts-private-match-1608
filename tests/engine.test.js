import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeck, createGame, startRound, revealInitialCard, drawFromDiscard, drawFromDeck,
  swapDrawnCard, discardDrawnAndReveal, scoreRound, findCompleteColumns,
  chooseBotAction, chooseBotDeckResolution
} from '../src/engine.js';

function completeInitialReveal(game) {
  while (game.phase === 'initial-reveal') {
    const index = game.players[game.currentPlayer].grid.findIndex(card => !card.revealed && !card.removed);
    revealInitialCard(game, index);
  }
}

test('Deck enthält 150 Karten in der vorgesehenen Verteilung', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 150);
  assert.equal(deck.filter(v => v === -2).length, 5);
  assert.equal(deck.filter(v => v === -1).length, 10);
  assert.equal(deck.filter(v => v === 0).length, 15);
  for (let value = 1; value <= 12; value++) assert.equal(deck.filter(v => v === value).length, 10);
});

test('Erste Auswahlphase lässt jeden Spieler genau zwei eigene Karten aufdecken', () => {
  const game = createGame([{name:'A',type:'human'},{name:'B',type:'human'}], () => 0.42);
  startRound(game);
  for (const player of game.players) {
    assert.equal(player.grid.length, 12);
    assert.equal(player.grid.filter(c => c.revealed).length, 0);
  }
  assert.equal(game.phase, 'initial-reveal');
  assert.equal(game.currentPlayer, 0);
  revealInitialCard(game, 3);
  assert.equal(game.players[0].grid.filter(c => c.revealed).length, 1);
  assert.equal(game.currentPlayer, 0);
  assert.throws(() => revealInitialCard(game, 3), /verdeckte eigene Karte/);
  revealInitialCard(game, 7);
  assert.equal(game.players[0].grid.filter(c => c.revealed).length, 2);
  assert.equal(game.currentPlayer, 1);
  assert.equal(game.phase, 'initial-reveal');
});

test('Höchste Summe der zwei Startkarten bestimmt den ersten Zug', () => {
  const game = createGame([{name:'A',type:'human'},{name:'B',type:'human'}], () => 0.42);
  startRound(game);
  game.players[0].grid[0].value = 2;
  game.players[0].grid[1].value = 3;
  game.players[1].grid[0].value = 8;
  game.players[1].grid[1].value = -1;
  revealInitialCard(game, 0);
  revealInitialCard(game, 1);
  revealInitialCard(game, 0);
  revealInitialCard(game, 1);
  assert.equal(game.phase, 'choose-pile');
  assert.equal(game.currentPlayer, 1);
  assert.match(game.log.at(-1), /B startet mit der höchsten Startsumme/);
});

test('Offene Ablagekarte muss getauscht werden', () => {
  const game = createGame([{name:'A',type:'human'},{name:'B',type:'bot'}], () => 0.42);
  startRound(game);
  completeInitialReveal(game);
  const acting = game.currentPlayer;
  const top = game.discard.at(-1);
  drawFromDiscard(game);
  const old = game.players[acting].grid[0].value;
  swapDrawnCard(game, 0);
  assert.equal(game.players[acting].grid[0].value, top);
  assert.equal(game.players[acting].grid[0].revealed, true);
  assert.equal(game.discard.at(-1), old);
});

test('Verdeckte Ziehkarte darf abgelegt werden, dann wird eine Karte aufgedeckt', () => {
  const game = createGame([{name:'A',type:'human'},{name:'B',type:'bot'}], () => 0.42);
  startRound(game);
  completeInitialReveal(game);
  const acting = game.currentPlayer;
  const hidden = game.players[acting].grid.findIndex(c => !c.revealed);
  drawFromDeck(game);
  discardDrawnAndReveal(game, hidden);
  assert.equal(game.players[acting].grid[hidden].revealed, true);
  assert.equal(game.phase, 'choose-pile');
  assert.equal(game.currentPlayer, (acting + 1) % game.players.length);
});

test('Drei gleiche offene Karten einer Spalte werden erkannt', () => {
  const grid = Array.from({length:12}, (_,i) => ({value:i, revealed:true, removed:false}));
  for (const i of [1,5,9]) grid[i].value = 4;
  assert.deepEqual(findCompleteColumns(grid), [1]);
});

test('Finisher verdoppelt nur einen positiven Rundenscore, wenn jemand gleichauf oder besser ist', () => {
  const result = scoreRound([10, 8, 15], 0);
  assert.deepEqual(result, [20, 8, 15]);
  assert.deepEqual(scoreRound([-1, -2], 0), [-1, -2]);
  assert.deepEqual(scoreRound([7, 9], 0), [7, 9]);
});

test('Vier Computer können ein vollständiges Spiel bis zum regulären Spielende austragen', () => {
  let seed = 123456789;
  const rng = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const game = createGame(Array.from({length:4},(_,i)=>({name:`CPU ${i+1}`,type:'bot',difficulty:'normal'})), rng);
  startRound(game);
  let actions = 0;
  while (game.phase !== 'game-over' && actions < 10000) {
    if (game.phase === 'round-over') { startRound(game); continue; }
    if (game.phase === 'initial-reveal') {
      const index = game.players[game.currentPlayer].grid.findIndex(card => !card.revealed && !card.removed);
      revealInitialCard(game, index); actions++; continue;
    }
    const action = chooseBotAction(game);
    if (action.pile === 'discard') {
      drawFromDiscard(game); swapDrawnCard(game, action.index);
    } else {
      drawFromDeck(game);
      const resolution = chooseBotDeckResolution(game);
      resolution.mode === 'swap' ? swapDrawnCard(game, resolution.index) : discardDrawnAndReveal(game, resolution.index);
    }
    actions++;
  }
  assert.equal(game.phase, 'game-over');
  assert.ok(game.players.some(player => player.total >= 100));
  assert.ok(game.winnerIds.length >= 1);
  assert.ok(game.round >= 2);
});
