export const ROWS = 3;
export const COLS = 4;
export const SAVE_VERSION = 1;

const PHASES = new Set(['initial-reveal','choose-pile','must-swap','deck-choice','round-over','game-over']);
const DIFFICULTIES = new Set(['easy','normal','hard']);
const CARD_MIN = -2;
const CARD_MAX = 12;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIntegerBetween(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function savedCard(value) {
  if (!isObject(value) || !isIntegerBetween(value.value, CARD_MIN, CARD_MAX) || typeof value.revealed !== 'boolean' || typeof value.removed !== 'boolean') {
    throw new Error('Ungültige Karte im gespeicherten Spiel.');
  }
  if (value.removed && !value.revealed) throw new Error('Entfernte Karten müssen aufgedeckt sein.');
  return { value: value.value, revealed: value.revealed, removed: value.removed };
}

function savedCardList(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum || !value.every(card => isIntegerBetween(card, CARD_MIN, CARD_MAX))) {
    throw new Error(`Ungültiger ${label} im gespeicherten Spiel.`);
  }
  return [...value];
}

function savedPlayer(value, index) {
  if (!isObject(value) || value.id !== index || typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 40 || /[\u0000-\u001f\u007f]/.test(value.name)) {
    throw new Error('Ungültiger Spieler im gespeicherten Spiel.');
  }
  if (!['human','bot'].includes(value.type) || !DIFFICULTIES.has(value.difficulty) || !isIntegerBetween(value.total, -1000000, 1000000)) {
    throw new Error('Ungültige Spielerwerte im gespeicherten Spiel.');
  }
  if (!Array.isArray(value.grid) || value.grid.length !== ROWS * COLS) throw new Error('Ungültige Auslage im gespeicherten Spiel.');
  if (value.roundScore !== null && !isIntegerBetween(value.roundScore, -1000, 1000)) throw new Error('Ungültige Rundenwertung im gespeicherten Spiel.');
  return {
    id: index,
    name: value.name,
    type: value.type,
    difficulty: value.difficulty,
    total: value.total,
    grid: value.grid.map(savedCard),
    roundScore: value.roundScore
  };
}

export function createSavedGame(game) {
  const { rng, ...data } = game;
  return { version: SAVE_VERSION, game: data };
}

export function restoreSavedGame(payload, rng = Math.random) {
  const legacy = isObject(payload) && !Object.prototype.hasOwnProperty.call(payload, 'version') && Array.isArray(payload.players);
  if (!legacy && (!isObject(payload) || payload.version !== SAVE_VERSION || !isObject(payload.game))) {
    throw new Error('Der gespeicherte Spielstand hat eine unbekannte Version.');
  }
  const value = legacy ? payload : payload.game;
  if (!Array.isArray(value.players) || value.players.length < 2 || value.players.length > 4) throw new Error('Ungültige Spielerzahl im gespeicherten Spiel.');
  const players = value.players.map(savedPlayer);
  if (!PHASES.has(value.phase) || !isIntegerBetween(value.currentPlayer, 0, players.length - 1) || !isIntegerBetween(value.round, 1, 10000)) {
    throw new Error('Ungültiger Spielzustand im gespeicherten Spiel.');
  }
  const playerIndex = candidate => candidate === null || isIntegerBetween(candidate, 0, players.length - 1);
  if (!playerIndex(value.roundFinisher) || !playerIndex(value.previousFinisher)) throw new Error('Ungültiger Rundenstatus im gespeicherten Spiel.');
  if (value.finalTurnsLeft !== null && !isIntegerBetween(value.finalTurnsLeft, 0, players.length - 1)) throw new Error('Ungültige Schlusszüge im gespeicherten Spiel.');
  if (!Array.isArray(value.initialReveals) || value.initialReveals.length !== players.length || !value.initialReveals.every(count => isIntegerBetween(count, 0, 2))) {
    throw new Error('Ungültige Startaufdeckung im gespeicherten Spiel.');
  }
  if (!Array.isArray(value.winnerIds) || value.winnerIds.length > players.length || !value.winnerIds.every(id => isIntegerBetween(id, 0, players.length - 1)) || new Set(value.winnerIds).size !== value.winnerIds.length) {
    throw new Error('Ungültige Gewinner im gespeicherten Spiel.');
  }
  if (!Array.isArray(value.log) || value.log.length > 500 || !value.log.every(line => typeof line === 'string' && line.length <= 240)) {
    throw new Error('Ungültiges Spielprotokoll im gespeicherten Spiel.');
  }
  const deck = savedCardList(value.deck, 150, 'Nachziehstapel');
  const discard = savedCardList(value.discard, 150, 'Ablagestapel');
  const drawnCard = value.drawnCard === null ? null : value.drawnCard;
  if (drawnCard !== null && !isIntegerBetween(drawnCard, CARD_MIN, CARD_MAX)) throw new Error('Ungültige Ziehkarte im gespeicherten Spiel.');
  if (![null,'deck','discard'].includes(value.drawSource)) throw new Error('Ungültige Ziehquelle im gespeicherten Spiel.');
  if (value.phase === 'must-swap' && (drawnCard === null || value.drawSource !== 'discard')) throw new Error('Unvollständiger Tauschzustand im gespeicherten Spiel.');
  if (value.phase === 'deck-choice' && (drawnCard === null || value.drawSource !== 'deck')) throw new Error('Unvollständige Ziehentscheidung im gespeicherten Spiel.');
  if (!['must-swap','deck-choice'].includes(value.phase) && (drawnCard !== null || value.drawSource !== null)) throw new Error('Unerwartete Ziehkarte im gespeicherten Spiel.');
  if (value.phase === 'initial-reveal') {
    players.forEach((player, index) => {
      if (player.grid.filter(card => card.revealed && !card.removed).length !== value.initialReveals[index]) throw new Error('Widersprüchliche Startaufdeckung im gespeicherten Spiel.');
      if (player.grid.some(card => card.removed)) throw new Error('Entfernte Karte während der Startaufdeckung.');
    });
    if (value.initialReveals[value.currentPlayer] >= 2 || value.initialReveals.some((count, index) => index < value.currentPlayer ? count !== 2 : index > value.currentPlayer ? count !== 0 : false)) {
      throw new Error('Unspielbare Reihenfolge der Startaufdeckung.');
    }
  } else if (!value.initialReveals.every(count => count === 2)) throw new Error('Unvollständige Startaufdeckung im gespeicherten Spiel.');
  if (value.phase === 'choose-pile') {
    if (discard.length === 0 || (deck.length === 0 && discard.length <= 1)) throw new Error('Keine vollständige Stapelwahl zum Fortsetzen verfügbar.');
  }
  if (['choose-pile','must-swap','deck-choice'].includes(value.phase) && !players[value.currentPlayer].grid.some(card => !card.removed)) {
    throw new Error('Keine aktive Karte zum Fortsetzen des Zuges.');
  }
  if (['round-over','game-over'].includes(value.phase)) {
    if (players.some(player => !Number.isInteger(player.roundScore))) throw new Error('Fehlende Rundenwertung im gespeicherten Spiel.');
  } else if (players.some(player => player.roundScore !== null)) throw new Error('Unerwartete Rundenwertung im gespeicherten Spiel.');
  if (value.phase === 'game-over' ? value.winnerIds.length === 0 : value.winnerIds.length !== 0) throw new Error('Widersprüchlicher Gewinnerstatus im gespeicherten Spiel.');
  if ((value.roundFinisher === null) !== (value.finalTurnsLeft === null)) throw new Error('Widersprüchlicher Rundenabschluss im gespeicherten Spiel.');

  return {
    players,
    deck,
    discard,
    currentPlayer: value.currentPlayer,
    drawnCard,
    drawSource: value.drawSource,
    phase: value.phase,
    round: value.round,
    roundFinisher: value.roundFinisher,
    finalTurnsLeft: value.finalTurnsLeft,
    previousFinisher: value.previousFinisher,
    winnerIds: [...value.winnerIds],
    initialReveals: [...value.initialReveals],
    log: [...value.log],
    rng
  };
}

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
  }
  game.initialReveals = game.players.map(() => 0);
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
  game.phase = 'initial-reveal';
  game.currentPlayer = 0;
  game.log = [`Runde ${game.round} beginnt. Jeder Spieler deckt zwei Karten auf.`];
  return game;
}

export function revealInitialCard(game, index) {
  requirePhase(game, 'initial-reveal');
  const playerIndex = game.currentPlayer;
  const player = game.players[playerIndex];
  const card = player.grid[index];
  if (!card || card.removed || card.revealed) throw new Error('Bitte eine verdeckte eigene Karte wählen.');
  if ((game.initialReveals?.[playerIndex] ?? 0) >= 2) throw new Error('Dieser Spieler hat bereits zwei Startkarten aufgedeckt.');
  card.revealed = true;
  game.initialReveals[playerIndex] = (game.initialReveals[playerIndex] ?? 0) + 1;
  game.log.push(`${player.name} deckt eine Startkarte auf.`);
  if (game.initialReveals[playerIndex] === 2) {
    if (playerIndex < game.players.length - 1) game.currentPlayer += 1;
    else {
      let best = -Infinity;
      game.players.forEach((candidate, i) => {
        const sum = candidate.grid.filter(c => c.revealed).reduce((n, c) => n + c.value, 0);
        if (sum > best) { best = sum; game.currentPlayer = i; }
      });
      game.phase = 'choose-pile';
      game.log.push(`${game.players[game.currentPlayer].name} startet mit der höchsten Startsumme.`);
    }
  }
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

export function chooseBotMandatorySwap(game) {
  requirePhase(game, 'must-swap');
  const player = game.players[game.currentPlayer];
  const live = player.grid.map((card, index) => ({ ...card, index })).filter(card => !card.removed);
  const hidden = live.find(card => !card.revealed);
  if (hidden) return hidden.index;
  const worst = live.filter(card => card.revealed).sort((a, b) => b.value - a.value)[0];
  if (!worst) throw new Error('Keine Karte zum Tauschen verfügbar.');
  return worst.index;
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
