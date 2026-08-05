import {joinRoom,selfId} from '@trystero-p2p/mqtt';

const hash=new URLSearchParams(location.hash.slice(1));
const roomId=hash.get('room'),password=hash.get('pw'),privateKey=hash.get('k');
const role=hash.get('role')==='guest'?'guest':'host';
const accelerated=hash.get('fast')==='1';
const isHost=role==='host';
const $=id=>document.getElementById(id);
let api=null,room=null,revision=0,applying=false,connected=false,currentState=null,finaleShown=false,photoUrl=null,privateData=null;

function base64Key(value){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function decryptAsset(path,keyBytes){
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok) throw new Error('Privater Inhalt konnte nicht geladen werden.');
  const data=new Uint8Array(await response.arrayBuffer());
  const key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['decrypt']);
  return crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},key,data.slice(12));
}
async function loadPrivateData(){
  if(!privateKey) throw new Error('Privater Schlüssel fehlt.');
  const key=base64Key(privateKey);
  const [image,message]=await Promise.all([
    decryptAsset('assets/private/moment.enc',key),decryptAsset('assets/private/message.enc',key)
  ]);
  privateData=JSON.parse(new TextDecoder().decode(message));
  photoUrl=URL.createObjectURL(new Blob([image],{type:'image/jpeg'}));
  const guestName=privateData.eyebrow.split(',').at(-1)?.trim()||'Gast';
  const hostName=privateData.signature.match(/Dein\s+([^\n❤️]+)/)?.[1]?.trim()||'Host';
  return {hostName,guestName};
}
function setConnection(text,tone='waiting'){
  $('online-status').textContent=text;
  $('online-lobby').dataset.tone=tone;
  $('connection-pill').textContent=text;
  $('connection-pill').dataset.tone=tone;
}
function showLobby(title,copy){
  $('online-title').textContent=title;$('online-copy').textContent=copy;
  $('online-lobby').classList.remove('hidden');
}
function hideLobby(){ $('online-lobby').classList.add('hidden');$('connection-pill').classList.remove('hidden'); }
function cleanState(state){ return JSON.parse(JSON.stringify(state)); }
function validProposal(next){
  if(!currentState||currentState.currentPlayer!==1||!next?.players||next.players.length!==2) return false;
  const terminal=['round-over','game-over'].includes(next.phase);
  if(next.round!==currentState.round||(!terminal&&next.players[0].total!==currentState.players[0].total)) return false;
  return next.currentPlayer===1||next.currentPlayer===0||terminal;
}
async function sendSafe(action,data,target){ try{await action.send(data,target?{target}:undefined);}catch{} }
function applyState(state,rev){
  if(!state||rev<revision)return;
  revision=rev;currentState=cleanState(state);applying=true;
  try{api.importState(cleanState(currentState));}finally{applying=false;}
  hideLobby();updateFinale(currentState);
}
function chime(){
  try{const c=new (window.AudioContext||window.webkitAudioContext)();[523.25,659.25,783.99].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*.16;o.frequency.value=f;g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.08,t+.04);g.gain.exponentialRampToValueAtTime(.001,t+.55);o.connect(g).connect(c.destination);o.start(t);o.stop(t+.58);});}catch{}
}
function hearts(){
  const area=$('romance-hearts');area.replaceChildren();
  for(let i=0;i<24;i++){const h=document.createElement('span');h.textContent=i%4?'♥':'♡';h.style.left=`${3+Math.random()*94}%`;h.style.fontSize=`${14+Math.random()*22}px`;h.style.setProperty('--duration',`${5+Math.random()*4}s`);h.style.setProperty('--delay',`${Math.random()*3}s`);area.append(h);}
}
function showFinale(){
  if(finaleShown||!privateData)return;finaleShown=true;
  if($('result-modal').open)$('result-modal').close();
  $('romance-date').textContent=privateData.date;$('romance-photo').src=photoUrl;
  $('romance-eyebrow').textContent=privateData.eyebrow;$('romance-title').textContent=privateData.title;
  $('romance-body').textContent=privateData.body;$('romance-signature').textContent=privateData.signature;
  $('romance-bg').style.backgroundImage=`url("${photoUrl}")`;
  $('romance-finale').classList.remove('hidden');hearts();chime();
  if(navigator.vibrate)navigator.vibrate([30,50,30]);
}
function updateFinale(state){
  if(state.phase==='game-over'&&state.winnerIds.includes(1))setTimeout(showFinale,1700);
}
async function init(){
  if(!roomId||!password){showLobby('Privater Link unvollständig','Raum oder Verbindungsschlüssel fehlt.');setConnection('Link unvollständig','error');return;}
  showLobby('Privates Spiel wird vorbereitet','Die verschlüsselte Einladung wird geöffnet …');
  setConnection('Wird vorbereitet …');
  if(!window.tiefstapelOnline)await new Promise(resolve=>window.addEventListener('tiefstapel:ready',resolve,{once:true}));
  api=window.tiefstapelOnline;
  if($('setup').open)$('setup').close();
  let names;
  try{names=await loadPrivateData();}catch(error){setConnection(error.message,'error');$('online-copy').textContent=error.message;return;}
  $('online-role').textContent=isHost?names.hostName:names.guestName;
  showLobby(isHost?`${names.hostName} wartet`:`${names.guestName} tritt bei`,isHost?'Öffne den zweiten Einladungslink auf dem anderen Handy.':'Verbindung zu deinem Mitspieler wird hergestellt …');
  setConnection('Partner wird gesucht …');
  room=joinRoom({appId:'tiefstapel-private-moment-v1',password,warnOnRelayFailure:false},roomId,{onJoinError:()=>setConnection('Verbindung wird erneut versucht …','waiting')});
  const stateAction=room.makeAction('state');
  const proposalAction=room.makeAction('proposal');
  const surpriseAction=room.makeAction('surprise');
  stateAction.onMessage=(payload)=>{if(!isHost)applyState(payload.state,payload.revision);};
  proposalAction.onMessage=(payload,context)=>{
    if(!isHost)return;
    if(!validProposal(payload.state)){sendSafe(stateAction,{state:currentState,revision},context.peerId);return;}
    revision+=1;applyState(payload.state,revision);sendSafe(stateAction,{state:currentState,revision});
  };
  surpriseAction.onMessage=()=>showFinale();
  room.onPeerJoin=peerId=>{
    connected=true;setConnection('Verbunden','online');
    if(isHost&&currentState)sendSafe(stateAction,{state:currentState,revision},peerId);
  };
  room.onPeerLeave=()=>{connected=false;setConnection('Verbindung unterbrochen – warte …','waiting');};
  window.addEventListener('tiefstapel:state',event=>{
    if(applying||!event.detail?.state)return;
    const state=cleanState(event.detail.state);
    if(isHost){revision+=1;currentState=state;sendSafe(stateAction,{state,revision});updateFinale(state);}
    else if(connected)sendSafe(proposalAction,{state,baseRevision:revision});
  });
  if(isHost){api.start([names.hostName,names.guestName],{accelerated});currentState=cleanState(api.state());revision=1;}
  else setConnection('Partner wird gesucht …');
  let taps=0,tapTimer;
  document.querySelector('.brand').addEventListener('click',()=>{if(!isHost)return;taps++;clearTimeout(tapTimer);tapTimer=setTimeout(()=>taps=0,1800);if(taps>=5){taps=0;showFinale();sendSafe(surpriseAction,{at:Date.now()});}});
  window.__onlineTest={role,selfId,roomId,get connected(){return connected;},get revision(){return revision;},state:()=>currentState,triggerFinale:()=>{showFinale();sendSafe(surpriseAction,{at:Date.now()});}};
}
$('romance-close').addEventListener('click',()=>$('romance-finale').classList.add('hidden'));
window.addEventListener('pagehide',()=>{room?.leave();if(photoUrl)URL.revokeObjectURL(photoUrl);});
init();
