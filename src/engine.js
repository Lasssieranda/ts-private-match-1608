export const ROWS = 3;
export const COLS = 4;

export function buildDeck() {
  const deck = [];
  const add = (value, count) => { for (let i = 0; i < count; i++) deck.push(value); };
  add(-2, 5); add(-1, 10); add(0, 15);
  for (let value = 1; value <= 12; value++) add(value, 10);
  return deck;
}

export function shuffle(items, rng = Math.random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createGame(playerConfigs, rng = Math.random) {
  if (!Array.isArray(playerConfigs) || playerConfigs.length < 2 || playerConfigs.length > 4) {
    throw new Error('TIEFSTAPEL benötigt 2 bis 4 Spieler.');
  }
  return {
    players: playerConfigs.map((p, i) => ({
      id: i,
      name: p.name || `Spieler ${i + 1}`,
      type: p.type === 'bot' ? 'bot' : 'human',
      difficulty: p.difficulty || 'normal',
      total: Number(p.total) || 0,
      grid: [],
      roundScore: null
    })),
    deck: [], discard: [], currentPlayer: 0, drawnCard: null, drawSource: null,
    phase: 'setup', round: 0, roundFinisher: null, finalTurnsLeft: null,
    previousFinisher: null, winnerIds: [], log: [], rng
  };
}

function drawDeckRaw(game) {
  if (game.deck.length === 0) {
    if (game.discard.length <= 1) throw new Error('Keine Karten mehr verfügbar.');
    const top = game.discard.pop();
    game.deck = shuffle(game.discard.splice(0), game.rng);
    game.discard.push(top);
  }
  return game.deck.pop();
}

export function startRound(game) {
  game.round += 1;
  game.deck = shuffle(buildDeck(), game.rng);
  game.discard = [];
  game.drawnCard = null;
  game.drawSource = null;
  game.roundFinisher = null;
  game.finalTurnsLeft = null;
  game.winnerIds = [];
  for (const player of game.players) {
    player.grid = Array.from({ length: 12 }, () => ({ value: drawDeckRaw(game), revealed: false, removed: false }));
    player.roundScore = null;
    const indexes = shuffle([...Array(12).keys()], game.rng).slice(0, 2);
    for (const i of indexes) player.grid[i].revealed = true;
  }
  game.discard.push(drawDeckRaw(game));
  if (game.previousFinisher !== null) {
    game.currentPlayer = game.previousFinisher;
  } else {
    let best = -Infinity;
    game.players.forEach((player, index) => {
      const sum = player.grid.filter(c => c.revealed).reduce((n, c) => n + c.value, 0);
      if (sum > best) { best = sum; game.currentPlayer = index; }
    });
  }
  game.phase = 'choose-pile';
  game.log = [`Runde ${game.round} beginnt. ${game.players[game.currentPlayer].name} startet.`];
  return game;
}

function requirePhase(game, phase) {
  if (game.phase !== phase) throw new Error(`Aktion in Phase ${game.phase} nicht erlaubt.`);
}

export function drawFromDiscard(game) {
  requirePhase(game, 'choose-pile');
  game.drawnCard = game.discard.pop();
  game.drawSource = 'discard';
  game.phase = 'must-swap';
  return game.drawnCard;
}

export function drawFromDeck(game) {
  requirePhase(game, 'choose-pile');
  game.drawnCard = drawDeckRaw(game);
  game.drawSource = 'deck';
  game.phase = 'deck-choice';
  return game.drawnCard;
}

function activeCard(game, index) {
  const card = game.players[game.currentPlayer].grid[index];
  if (!card || card.removed) throw new Error('Diese Kartenposition ist nicht verfügbar.');
  return card;
}

export function swapDrawnCard(game, index) {
  if (!['must-swap', 'deck-choice'].includes(game.phase) || game.drawnCard === null) throw new Error('Keine Karte zum Tauschen gezogen.');
  const card = activeCard(game, index);
  const oldValue = card.value;
  card.value = game.drawnCard;
  card.revealed = true;
  game.discard.push(oldValue);
  game.log.push(`${game.players[game.currentPlayer].name} tauscht eine Karte.`);
  game.drawnCard = null;
  game.drawSource = null;
  return finishTurn(game);
}

export function discardDrawnAndReveal(game, index) {
  requirePhase(game, 'deck-choice');
  const card = activeCard(game, index);
  if (card.revealed) throw new Error('Es muss eine verdeckte Karte aufgedeckt werden.');
  game.discard.push(game.drawnCard);
  game.drawnCard = null;
  game.drawSource = null;
  card.revealed = true;
  game.log.push(`${game.players[game.currentPlayer].name} legt die Ziehkarte ab und deckt eine Karte auf.`);
  return finishTurn(game);
}

export function findCompleteColumns(grid) {
  const complete = [];
  for (let col = 0; col < COLS; col++) {
    const cards = [grid[col], grid[col + COLS], grid[col + COLS * 2]];
    if (cards.every(c => c && !c.removed && c.revealed) && cards.every(c => c.value === cards[0].value)) complete.push(col);
  }
  return complete;
}

export function clearCompleteColumns(game, playerIndex = game.currentPlayer) {
  const player = game.players[playerIndex];
  const columns = findCompleteColumns(player.grid);
  for (const col of columns) {
    for (const index of [col, col + COLS, col + COLS * 2]) {
      game.discard.push(player.grid[index].value);
      player.grid[index].removed = true;
    }
    game.log.push(`${player.name} räumt eine Dreier-Spalte ab.`);
  }
  return columns;
}

export function rawPlayerScore(player) {
  return player.grid.reduce((sum, card) => sum + (card.removed ? 0 : card.value), 0);
}

export function scoreRound(rawScores, finisherIndex) {
  const scores = [...rawScores];
  const finisher = scores[finisherIndex];
  const hasEqualOrLowerOpponent = scores.some((score, i) => i !== finisherIndex && score <= finisher);
  if (finisher > 0 && hasEqualOrLowerOpponent) scores[finisherIndex] *= 2;
  return scores;
}

function closeRound(game) {
  const raw = game.players.map(rawPlayerScore);
  const scores = scoreRound(raw, game.roundFinisher);
  game.players.forEach((player, i) => {
    player.roundScore = scores[i];
    player.total += scores[i];
    player.grid.forEach(card => { if (!card.removed) card.revealed = true; });
  });
  game.previousFinisher = game.roundFinisher;
  const reachedEnd = game.players.some(p => p.total >= 100);
  if (reachedEnd) {
    const minimum = Math.min(...game.players.map(p => p.total));
    game.winnerIds = game.players.filter(p => p.total === minimum).map(p => p.id);
    game.phase = 'game-over';
  } else {
    game.phase = 'round-over';
  }
  game.log.push(`Runde ${game.round} ist beendet.`);
}

export function finishTurn(game) {
  const acting = game.currentPlayer;
  clearCompleteColumns(game, acting);
  const player = game.players[acting];
  const allVisible = player.grid.every(card => card.removed || card.revealed);

  if (game.roundFinisher === null && allVisible) {
    game.roundFinisher = acting;
    game.finalTurnsLeft = game.players.length - 1;
    game.log.push(`${player.name} beendet die Runde. Alle anderen haben noch einen Zug.`);
  } else if (game.roundFinisher !== null && acting !== game.roundFinisher) {
    game.finalTurnsLeft -= 1;
  }

  if (game.roundFinisher !== null && game.finalTurnsLeft === 0) {
    closeRound(game);
    return game;
  }

  game.currentPlayer = (acting + 1) % game.players.length;
  game.phase = 'choose-pile';
  return game;
}

export function getVisibleState(game) {
  return {
    ...game,
    rng: undefined,
    deck: Array(game.deck.length).fill(null)
  };
}

export function chooseBotAction(game) {
  const player = game.players[game.currentPlayer];
  const live = player.grid.map((card, index) => ({ ...card, index })).filter(c => !c.removed);
  const revealed = live.filter(c => c.revealed);
  const hidden = live.filter(c => !c.revealed);
  const worst = revealed.sort((a, b) => b.value - a.value)[0];
  const discard = game.discard.at(-1);
  const threshold = player.difficulty === 'easy' ? 7 : player.difficulty === 'hard' ? 4 : 5;

  if (discard <= threshold && (hidden.length || (worst && discard < worst.value))) {
    return { pile: 'discard', index: hidden[0]?.index ?? worst.index, mode: 'swap' };
  }
  return { pile: 'deck' };
}

export function chooseBotDeckResolution(game) {
  const player = game.players[game.currentPlayer];
  const live = player.grid.map((card, index) => ({ ...card, index })).filter(c => !c.removed);
  const hidden = live.filter(c => !c.revealed);
  const revealed = live.filter(c => c.revealed).sort((a, b) => b.value - a.value);
  const worst = revealed[0];
  const drawn = game.drawnCard;
  const threshold = player.difficulty === 'easy' ? 8 : player.difficulty === 'hard' ? 4 : 6;
  if ((worst && drawn < worst.value) || (hidden.length && drawn <= threshold)) {
    return { mode: 'swap', index: worst && drawn < worst.value ? worst.index : hidden[0].index };
  }
  if (hidden.length) return { mode: 'reveal', index: hidden[0].index };
  return { mode: 'swap', index: worst.index };
}
