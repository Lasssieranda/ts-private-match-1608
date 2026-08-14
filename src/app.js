import {
  createGame, startRound, revealInitialCard, drawFromDiscard, drawFromDeck, swapDrawnCard,
  discardDrawnAndReveal, chooseBotAction, chooseBotDeckResolution, chooseBotMandatorySwap,
  createSavedGame, restoreSavedGame
} from './engine.js?v=037';

const $ = id => document.getElementById(id);
const els = {
  setup:$('setup'), setupForm:$('setup-form'), humans:$('human-count'), bots:$('bot-count'), difficulty:$('difficulty'),
  setupError:$('setup-error'), continueBtn:$('continue-btn'), scorebar:$('scorebar'), opponents:$('opponents'), board:$('board'),
  deck:$('deck-pile'), discard:$('discard-pile'), deckCount:$('deck-count'), discardValue:$('discard-value'), selfAction:$('self-action'), otherAction:$('other-action'),
  roundLabel:$('round-label'), turnLabel:$('turn-label'), instruction:$('instruction'), drawnPanel:$('drawn-panel'),
  drawnCard:$('drawn-card'), discardDrawn:$('discard-drawn'), status:$('status-pill'), result:$('result-modal'), resultContent:$('result-content'), toast:$('toast')
};
let game = null;
let revealMode = false;
let botTimer = null;
let deferredInstallPrompt = null;
let soundOn = localStorage.getItem('tiefstapel-sound') !== 'off';
let audioContext = null;
const onlineParams = new URLSearchParams(location.hash.slice(1));
const onlineRoom = onlineParams.get('room');
const onlineRole = onlineParams.get('role');
const localPlayerIndex = onlineRole === 'guest' ? 1 : 0;
const saveKey = onlineRoom ? `tiefstapel-online-${onlineRoom}` : 'tiefstapel-save';
const BOT_PHASES = ['initial-reveal','choose-pile','must-swap','deck-choice'];

function valueClass(value){ return value <= 0 ? 'value-blue' : value <= 4 ? 'value-green' : value <= 8 ? 'value-yellow' : 'value-red'; }
function isHumanTurn(){ return game && game.players[game.currentPlayer]?.type === 'human'; }
function canLocalAct(){ return isHumanTurn() && (!onlineRoom || game.currentPlayer === localPlayerIndex); }
function liveCards(player){ return player.grid.filter(card => !card.removed); }
function hiddenCount(player){ return liveCards(player).filter(card => !card.revealed).length; }
function esc(text){ const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }
function actionCopy(action){
  const actor=action?.actorIndex === null || action?.actorIndex === undefined ? null : game.players[action.actorIndex]?.name;
  if(!action) return 'Noch keine öffentliche Aktion.';
  if(action.type==='take-discard') return `${actor} nimmt ${action.cardValue} von der Ablage.`;
  if(action.type==='swap') return `${actor} legt ${action.cardValue} ab.`;
  if(action.type==='discard-and-reveal') return `${actor} legt ${action.cardValue} ab und deckt auf.`;
  if(action.type==='clear-column') return `${actor} räumt eine Dreier-Spalte ab.`;
  return 'Runde beginnt.';
}
function actionForSeat(seat,own){
  const actions=(game.publicActions?.length?game.publicActions:[game.lastPublicAction]).filter(Boolean);
  const action=[...actions].reverse().find(item=>item.actorIndex!==null&&(own?item.actorIndex===seat:item.actorIndex!==seat));
  return action?actionCopy(action):own?'Du hast noch keine öffentliche Aktion.':'Dein Partner hat noch keine öffentliche Aktion.';
}

function tone(kind='tap'){
  if(!soundOn) return;
  try{
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioContext.createOscillator(), gain=audioContext.createGain();
    const notes={tap:280,flip:470,column:720,finish:560};
    osc.frequency.setValueAtTime(notes[kind]||320,audioContext.currentTime);
    if(kind==='column') osc.frequency.exponentialRampToValueAtTime(1080,audioContext.currentTime+.16);
    gain.gain.setValueAtTime(.055,audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.18);
    osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime+.18);
  }catch{}
}
function haptic(pattern=12){ if(navigator.vibrate) navigator.vibrate(pattern); }
function toast(message){ els.toast.textContent=message; els.toast.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>els.toast.classList.remove('show'),1700); }

function save(){
  if(!game) return;
  localStorage.setItem(saveKey,JSON.stringify(createSavedGame(game)));
  els.continueBtn.classList.remove('hidden');
}
function load(){
  try{
    const data=JSON.parse(localStorage.getItem(saveKey));
    game=restoreSavedGame(data); revealMode=false; els.setupError.textContent=''; return true;
  }catch{
    localStorage.removeItem(saveKey);
    els.continueBtn.classList.add('hidden');
    els.setupError.textContent='Der gespeicherte Spielstand war ungültig und wurde entfernt.';
    return false;
  }
}

function cardMarkup(card,index,mini=false){
  if(mini){
    if(card.removed) return '<span class="mini-card removed" aria-hidden="true"></span>';
    if(!card.revealed) return '<span class="mini-card back" aria-hidden="true"></span>';
    return `<span class="mini-card open" aria-hidden="true">${card.value}</span>`;
  }
  if(card.removed) return `<button type="button" class="card removed" data-index="${index}" aria-label="Kartenposition ${index+1} entfernt" disabled></button>`;
  if(!card.revealed) return `<button type="button" class="card back" data-index="${index}" aria-label="Verdeckte Karte ${index+1}"><span class="card-back-mark" aria-hidden="true">▼</span></button>`;
  return `<button type="button" class="card ${valueClass(card.value)}" data-index="${index}" data-value="${card.value}" aria-label="Karte ${index+1}: Wert ${card.value}"><span class="card-value">${card.value}</span></button>`;
}

function exportState(){
  if(!game) return null;
  return {...game,rng:undefined,__revealMode:revealMode};
}

function render({broadcast=true}={}){
  if(!game) return;
  const current=game.players[game.currentPlayer];
  const viewPlayerIndex=onlineRoom?localPlayerIndex:game.currentPlayer;
  const viewed=game.players[viewPlayerIndex];
  document.body.dataset.phase=game.phase;
  els.roundLabel.textContent=`Runde ${game.round}`;
  els.turnLabel.textContent=game.phase==='round-over'?'Runde beendet':game.phase==='game-over'?'Spiel beendet':game.phase==='initial-reveal'?`${current.name} wählt Startkarten`:`${current.name} ist dran`;
  els.deckCount.textContent=game.deck.length;
  const top=game.discard.at(-1);
  els.discardValue.textContent=top ?? '–';
  els.discard.className=`pile card ${valueClass(top ?? 0)}`;
  els.discard.dataset.value=top ?? '–';
  els.selfAction.textContent=actionForSeat(viewPlayerIndex,true);
  els.otherAction.textContent=actionForSeat(viewPlayerIndex,false);
  els.scorebar.innerHTML=game.players.map((p,i)=>`<div class="score-chip ${i===game.currentPlayer?'active':''}"><i class="player-dot" aria-hidden="true"></i><span class="score-meta"><span>${esc(p.name)}</span><small>${i===game.currentPlayer?'Am Zug':'Gesamt'}</small></span><b>${p.total}</b></div>`).join('');
  els.opponents.innerHTML=game.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewPlayerIndex).map(({p,i})=>{
    const hidden=hiddenCount(p), removed=p.grid.filter(card=>card.removed).length, open=liveCards(p).length-hidden;
    return `<div class="opponent"><span class="opponent-name" aria-hidden="true">${esc(p.name)}</span><span class="opponent-summary sr-only">${esc(p.name)}: ${open} offen, ${hidden} verdeckt, ${removed} entfernt.</span><div class="mini-player ${i===game.currentPlayer?'active':''}" aria-hidden="true">${p.grid.map((c,j)=>cardMarkup(c,j,true)).join('')}</div></div>`;
  }).join('');
  els.board.innerHTML=viewed.grid.map((c,i)=>cardMarkup(c,i)).join('');
  const canSelect=canLocalAct()&&['initial-reveal','must-swap','deck-choice'].includes(game.phase);
  els.board.classList.toggle('selecting',canSelect);
  els.board.classList.toggle('initial-select',canSelect&&game.phase==='initial-reveal');
  els.board.classList.toggle('swap-select',canSelect&&(game.phase==='must-swap'||(game.phase==='deck-choice'&&!revealMode)));
  els.board.classList.toggle('reveal-mode',revealMode);
  els.drawnPanel.classList.toggle('hidden',game.drawnCard===null);
  if(game.drawnCard!==null){ els.drawnCard.innerHTML=`<span class="card-value">${game.drawnCard}</span>`; els.drawnCard.dataset.value=game.drawnCard; els.drawnCard.className=`card drawn ${valueClass(game.drawnCard)}`; }
  els.discardDrawn.classList.toggle('hidden',game.phase!=='deck-choice'||!canLocalAct());
  els.discardDrawn.textContent=revealMode?'Verdeckte Karte antippen …':'Ablegen & Karte aufdecken';
  els.deck.disabled=!canLocalAct()||game.phase!=='choose-pile';
  els.discard.disabled=els.deck.disabled;
  const initialLeft=2-(game.initialReveals?.[game.currentPlayer]??0);
  const statusText={
    'initial-reveal':canLocalAct()?'Startwahl':onlineRoom?'Partner wählt':'CPU wählt',
    'choose-pile':canLocalAct()?'Ziehen':onlineRoom?'Partner ist dran':'CPU denkt',
    'must-swap':'Tauschen', 'deck-choice':revealMode?'Aufdecken':'Entscheiden',
    'round-over':'Wertung', 'game-over':'Endstand'
  };
  const resultReady=['round-over','game-over'].includes(game.phase);
  els.status.textContent=statusText[game.phase]||'Bereit';
  els.status.disabled=!resultReady;
  els.status.setAttribute('aria-label',resultReady?'Wertung wieder öffnen':els.status.textContent);
  els.status.classList.toggle('result-ready',resultReady);

  if(game.phase==='initial-reveal') els.instruction.textContent=canLocalAct()?`Wähle deine ersten zwei Karten – noch ${initialLeft}.`:`${current.name} deckt zwei Startkarten auf …`;
  if(game.phase==='choose-pile') els.instruction.textContent=canLocalAct()?'Wähle Nachziehstapel oder Ablage.':onlineRoom?'Warte auf den anderen Zug …':'Computer denkt nach …';
  if(game.phase==='must-swap') els.instruction.textContent='Tippe auf eine Karte, um sie zu tauschen.';
  if(game.phase==='deck-choice') els.instruction.textContent=revealMode?'Tippe auf eine verdeckte Karte.':'Tausche – oder lege die Ziehkarte ab.';
  save();
  if(['round-over','game-over'].includes(game.phase)) showResult(); else scheduleBot();
  const detail={state:exportState(),broadcast};
  window.dispatchEvent(new CustomEvent('tiefstapel:rendered',{detail}));
  if(broadcast) window.dispatchEvent(new CustomEvent('tiefstapel:state',{detail}));
}

function startNewGame(){
  const humans=Number(els.humans.value), bots=Number(els.bots.value), total=humans+bots;
  if(total<2||total>4){ els.setupError.textContent='Bitte insgesamt 2 bis 4 Spieler wählen.'; return; }
  const players=[];
  for(let i=0;i<humans;i++) players.push({name:humans===1?'Du':`Spieler ${i+1}`,type:'human'});
  for(let i=0;i<bots;i++) players.push({name:`CPU ${i+1}`,type:'bot',difficulty:els.difficulty.value});
  game=createGame(players); startRound(game); revealMode=false; els.setup.close(); tone('finish'); render();
}

function handlePile(source){
  if(!canLocalAct()||game.phase!=='choose-pile') return;
  revealMode=false; source==='deck'?drawFromDeck(game):drawFromDiscard(game); tone('flip'); haptic(); render();
}
function handleCard(index){
  if(!canLocalAct()||!game) return;
  try{
    if(game.phase==='initial-reveal'){
      revealInitialCard(game,index); tone('flip'); haptic();
    }else if(game.phase==='must-swap'||(game.phase==='deck-choice'&&!revealMode)){
      const before=game.log.length; swapDrawnCard(game,index); tone('flip'); haptic(); announceColumns(before);
    }else if(game.phase==='deck-choice'&&revealMode){
      const before=game.log.length; discardDrawnAndReveal(game,index); revealMode=false; tone('flip'); haptic(); announceColumns(before);
    }else return;
    render();
  }catch(error){ toast(error.message); haptic([20,30,20]); }
}
function announceColumns(logStart){
  if(game.log.slice(logStart).some(line=>line.includes('Dreier-Spalte'))){ tone('column'); haptic([20,35,45]); toast('Dreier-Spalte abgeräumt!'); }
}

function scheduleBot(){
  clearTimeout(botTimer);
  if(!game||!BOT_PHASES.includes(game.phase)||game.players[game.currentPlayer].type!=='bot') return;
  const delay={ 'initial-reveal':620, 'choose-pile':620, 'must-swap':420, 'deck-choice':520 }[game.phase];
  botTimer=setTimeout(runBotTurn,delay);
}
function runBotTurn(){
  if(!game||!BOT_PHASES.includes(game.phase)||game.players[game.currentPlayer].type!=='bot') return;
  if(game.phase==='initial-reveal'){
    const index=game.players[game.currentPlayer].grid.findIndex(card=>!card.revealed&&!card.removed);
    revealInitialCard(game,index); tone('flip'); render(); return;
  }
  if(game.phase==='choose-pile'){
    const action=chooseBotAction(game);
    action.pile==='discard'?drawFromDiscard(game):drawFromDeck(game);
    tone('flip'); render(); return;
  }
  const before=game.log.length;
  if(game.phase==='must-swap') swapDrawnCard(game,chooseBotMandatorySwap(game));
  else {
    const resolution=chooseBotDeckResolution(game);
    resolution.mode==='swap'?swapDrawnCard(game,resolution.index):discardDrawnAndReveal(game,resolution.index);
  }
  announceColumns(before); render();
}

function showResult(){
  if(els.result.open) return;
  const over=game.phase==='game-over';
  const title=over?'Spiel entschieden':`Runde ${game.round} beendet`;
  const winnerNames=game.winnerIds.map(id=>game.players.find(p=>p.id===id)?.name).join(' & ');
  els.resultContent.innerHTML=`<p class="eyebrow">${over?'ENDSTAND':'WERTUNG'}</p><h2 id="result-title">${title}</h2>${over?`<p><b>${esc(winnerNames)}</b> gewinnt mit der niedrigsten Punktzahl.</p>`:'<p>Die Kartenwerte wurden zum Gesamtstand addiert.</p>'}<table class="result-table">${game.players.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.roundScore>=0?'+':''}${p.roundScore}</td><td><b>${p.total}</b></td></tr>`).join('')}</table><button class="primary" id="result-action">${over?'Neues Spiel':'Nächste Runde'}</button><button class="ghost" data-close="result-modal">Punktestand ansehen</button>`;
  els.result.showModal(); tone('finish');
  $('result-action').onclick=()=>{ els.result.close(); if(over){ els.setup.showModal(); }else{ startRound(game); render(); } };
  els.resultContent.querySelector('[data-close]').onclick=()=>els.result.close();
}

els.setupForm.addEventListener('submit',event=>{ event.preventDefault(); startNewGame(); });
els.continueBtn.addEventListener('click',event=>{ event.preventDefault(); if(load()){ els.setup.close(); render(); } });
els.deck.addEventListener('click',()=>handlePile('deck'));
els.discard.addEventListener('click',()=>handlePile('discard'));
els.board.addEventListener('click',event=>{ const card=event.target.closest('[data-index]'); if(card) handleCard(Number(card.dataset.index)); });
els.discardDrawn.addEventListener('click',()=>{ if(!canLocalAct()) return; revealMode=!revealMode; tone('tap'); render(); });
$('rules-btn').onclick=()=>$('info-modal').showModal();
$('menu-btn').onclick=()=>{ clearTimeout(botTimer); els.setup.showModal(); };
$('sound-btn').onclick=()=>{ soundOn=!soundOn; localStorage.setItem('tiefstapel-sound',soundOn?'on':'off'); $('sound-btn').textContent=soundOn?'Ton an':'Ton aus'; tone('tap'); };
els.status.onclick=()=>{ if(game&&['round-over','game-over'].includes(game.phase)) showResult(); };
document.addEventListener('click',event=>{ const id=event.target.dataset.close; if(id) $(id).close(); });
window.addEventListener('beforeinstallprompt',event=>{ event.preventDefault(); deferredInstallPrompt=event; });
$('install-btn').onclick=async()=>{ if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; }else $('install-modal').showModal(); };
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
$('sound-btn').textContent=soundOn?'Ton an':'Ton aus';
if(localStorage.getItem(saveKey)) els.continueBtn.classList.remove('hidden');
if(!els.setup.open) els.setup.showModal();

window.tiefstapelOnline={
  role:onlineRole,
  localPlayerIndex,
  state:()=>exportState(),
  importState(data){
    if(!data?.players?.length) throw new Error('Ungültiger Online-Spielstand.');
    revealMode=Boolean(data.__revealMode);
    const clean={...data}; delete clean.__revealMode;
    game={...clean,rng:Math.random};
    if(els.setup.open) els.setup.close();
    render({broadcast:false});
  },
  start(names,{accelerated=false}={}){
    game=createGame(names.map(name=>({name,type:'human'})));
    startRound(game);
    if(accelerated){
      const values=[[12,11,10,9,8,7,6,5,4,3,2,1],[-2,-1,0,1,2,3,4,5,6,7,8,9]];
      game.players.forEach((player,i)=>player.grid.forEach((card,j)=>{card.value=values[i][j];card.revealed=j>1;}));
      game.players[0].total=90; game.players[1].total=0; game.currentPlayer=0;
      game.log.push('Beschleunigter privater Verbindungstest gestartet.');
    }
    revealMode=false;
    if(els.setup.open) els.setup.close();
    render();
  }
};
window.dispatchEvent(new Event('tiefstapel:ready'));
