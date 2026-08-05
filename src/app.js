import {
  createGame, startRound, revealInitialCard, drawFromDiscard, drawFromDeck, swapDrawnCard,
  discardDrawnAndReveal, chooseBotAction, chooseBotDeckResolution
} from './engine.js?v=035';

const $ = id => document.getElementById(id);
const els = {
  setup:$('setup'), setupForm:$('setup-form'), humans:$('human-count'), bots:$('bot-count'), difficulty:$('difficulty'),
  setupError:$('setup-error'), continueBtn:$('continue-btn'), scorebar:$('scorebar'), opponents:$('opponents'), board:$('board'),
  deck:$('deck-pile'), discard:$('discard-pile'), deckCount:$('deck-count'), discardValue:$('discard-value'),
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

function valueClass(value){ return value <= 0 ? 'value-blue' : value <= 4 ? 'value-green' : value <= 8 ? 'value-yellow' : 'value-red'; }
function isHumanTurn(){ return game && game.players[game.currentPlayer]?.type === 'human'; }
function canLocalAct(){ return isHumanTurn() && (!onlineRoom || game.currentPlayer === localPlayerIndex); }
function liveCards(player){ return player.grid.filter(card => !card.removed); }
function hiddenCount(player){ return liveCards(player).filter(card => !card.revealed).length; }
function esc(text){ const d=document.createElement('div'); d.textContent=text; return d.innerHTML; }

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
  const copy={...game,rng:undefined};
  localStorage.setItem(saveKey,JSON.stringify(copy));
  els.continueBtn.classList.remove('hidden');
}
function load(){
  try{
    const data=JSON.parse(localStorage.getItem(saveKey));
    if(!data?.players?.length) return false;
    game={...data,rng:Math.random}; revealMode=false; return true;
  }catch{return false;}
}

function cardMarkup(card,index,mini=false){
  if(card.removed) return `<button class="${mini?'mini-card':'card'} removed" data-index="${index}" disabled></button>`;
  if(!card.revealed) return `<button class="${mini?'mini-card':'card'} back" data-index="${index}" aria-label="Verdeckte Karte"></button>`;
  return `<button class="${mini?'mini-card open':'card '+valueClass(card.value)}" data-index="${index}" data-value="${card.value}" aria-label="Karte ${card.value}">${card.value}</button>`;
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
  els.roundLabel.textContent=`Runde ${game.round}`;
  els.turnLabel.textContent=game.phase==='round-over'?'Runde beendet':game.phase==='game-over'?'Spiel beendet':game.phase==='initial-reveal'?`${current.name} wählt Startkarten`:`${current.name} ist dran`;
  els.deckCount.textContent=game.deck.length;
  const top=game.discard.at(-1);
  els.discardValue.textContent=top ?? '–';
  els.discard.className=`pile card ${valueClass(top ?? 0)}`;
  els.discard.dataset.value=top ?? '–';
  els.scorebar.innerHTML=game.players.map((p,i)=>`<div class="score-chip ${i===game.currentPlayer?'active':''}"><span>${esc(p.name)}</span><b>${p.total}</b></div>`).join('');
  els.opponents.innerHTML=game.players.map((p,i)=>({p,i})).filter(x=>x.i!==viewPlayerIndex).map(({p,i})=>`<div><div class="mini-player ${i===game.currentPlayer?'active':''}" title="${esc(p.name)}">${p.grid.map((c,j)=>cardMarkup(c,j,true)).join('')}</div></div>`).join('');
  els.board.innerHTML=viewed.grid.map((c,i)=>cardMarkup(c,i)).join('');
  els.board.classList.toggle('selecting',canLocalAct()&&['initial-reveal','must-swap','deck-choice'].includes(game.phase));
  els.board.classList.toggle('reveal-mode',revealMode);
  els.drawnPanel.classList.toggle('hidden',game.drawnCard===null);
  if(game.drawnCard!==null){ els.drawnCard.textContent=game.drawnCard; els.drawnCard.dataset.value=game.drawnCard; els.drawnCard.className=`card drawn ${valueClass(game.drawnCard)}`; }
  els.discardDrawn.classList.toggle('hidden',game.phase!=='deck-choice'||!canLocalAct());
  els.discardDrawn.textContent=revealMode?'Verdeckte Karte antippen …':'Ablegen & Karte aufdecken';
  els.deck.disabled=!canLocalAct()||game.phase!=='choose-pile';
  els.discard.disabled=els.deck.disabled;
  const initialLeft=2-(game.initialReveals?.[game.currentPlayer]??0);
  els.status.textContent=game.phase==='initial-reveal'?(canLocalAct()?`Noch ${initialLeft} auswählen`:onlineRoom?'Partner wählt':'Computer wählt'):game.roundFinisher!==null&&game.phase==='choose-pile'?`Noch ${game.finalTurnsLeft} Zug/Züge`:canLocalAct()?'Dein Zug':onlineRoom?'Partner ist dran':'Computer denkt …';

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
  if(!game||!['initial-reveal','choose-pile'].includes(game.phase)||game.players[game.currentPlayer].type!=='bot') return;
  botTimer=setTimeout(runBotTurn,620);
}
function runBotTurn(){
  if(!game||!['initial-reveal','choose-pile'].includes(game.phase)||game.players[game.currentPlayer].type!=='bot') return;
  if(game.phase==='initial-reveal'){
    const index=game.players[game.currentPlayer].grid.findIndex(card=>!card.revealed&&!card.removed);
    revealInitialCard(game,index); tone('flip'); render(); return;
  }
  const action=chooseBotAction(game), before=game.log.length;
  if(action.pile==='discard'){
    drawFromDiscard(game); render();
    botTimer=setTimeout(()=>{ swapDrawnCard(game,action.index); announceColumns(before); render(); },420);
  }else{
    drawFromDeck(game); render();
    botTimer=setTimeout(()=>{
      const resolution=chooseBotDeckResolution(game);
      resolution.mode==='swap'?swapDrawnCard(game,resolution.index):discardDrawnAndReveal(game,resolution.index);
      announceColumns(before); render();
    },520);
  }
}

function showResult(){
  if(els.result.open) return;
  const over=game.phase==='game-over';
  const title=over?'Spiel entschieden':`Runde ${game.round} beendet`;
  const winnerNames=game.winnerIds.map(id=>game.players.find(p=>p.id===id)?.name).join(' & ');
  els.resultContent.innerHTML=`<p class="eyebrow">${over?'ENDSTAND':'WERTUNG'}</p><h2>${title}</h2>${over?`<p><b>${esc(winnerNames)}</b> gewinnt mit der niedrigsten Punktzahl.</p>`:'<p>Die Kartenwerte wurden zum Gesamtstand addiert.</p>'}<table class="result-table">${game.players.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.roundScore>=0?'+':''}${p.roundScore}</td><td><b>${p.total}</b></td></tr>`).join('')}</table><button class="primary" id="result-action">${over?'Neues Spiel':'Nächste Runde'}</button><button class="ghost" data-close="result-modal">Punktestand ansehen</button>`;
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
