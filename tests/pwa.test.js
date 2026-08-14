import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = async path => readFile(new URL(path, root), 'utf8');

test('HTML enthält iPhone- und PWA-Metadaten sowie zentrale Spielbereiche', async () => {
  const html = await text('index.html');
  for (const token of ['viewport-fit=cover','apple-mobile-web-app-capable','manifest.webmanifest','id="board"','id="setup"','id="install-btn"']) assert.match(html, new RegExp(token));
});

test('Manifest ist installierbar und deklariert beide Icons', async () => {
  const manifest = JSON.parse(await text('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait');
  assert.ok(manifest.icons.some(i => i.sizes === '192x192'));
  assert.ok(manifest.icons.some(i => i.sizes === '512x512'));
});

test('Service Worker cached die vollständige App-Shell', async () => {
  const sw = await text('sw.js');
  for (const token of ['index.html','src/app.js','src/engine.js','styles.css','manifest.webmanifest','skipWaiting','clients.claim']) assert.match(sw, new RegExp(token.replace('.', '\\.')));
});

test('Mobile CSS nutzt sichere Bereiche und ausreichend große Touchziele', async () => {
  const css = await text('styles.css');
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Icons sind echte, nicht-triviale PNG-Dateien', async () => {
  for (const file of ['icons/icon-192.png','icons/icon-512.png']) {
    const data = await readFile(new URL(file, root));
    assert.deepEqual([...data.subarray(0,8)], [137,80,78,71,13,10,26,10]);
    assert.ok((await stat(new URL(file, root))).size > 1000);
  }
});

test('Premium-Redesign hat vier Wertfarben und Eckzahlen', async () => {
  const html = await text('index.html');
  const css = await text('styles.css');
  const app = await text('src/app.js');
  const sw = await text('sw.js');
  for (const token of ['--page:', '--felt:', '.value-blue', '.value-green', '.value-yellow', '.value-red', '.card[data-value]::before', '.card[data-value]::after']) {
    assert.ok(css.includes(token), `CSS-Merkmal fehlt: ${token}`);
  }
  assert.match(app, /data-value=/);
  assert.match(app, /opponent-table/);
  for (const token of ['.opponent-table','.mini-card.back','.mini-card.open']) assert.ok(css.includes(token), `Gegnertisch-Stil fehlt: ${token}`);
  assert.match(app, /publicActions/);
  assert.match(app, /actionForSeat/);
  for (const token of ['id="discard-stage"','id="turn-trail"','id="self-action"','id="other-action"']) assert.match(html,new RegExp(token));
  for (const token of ['.discard-stage','.turn-trail','.turn-lane-self','.turn-lane-other']) assert.ok(css.includes(token));
  assert.match(sw, /tiefstapel-heart-v10/);
  assert.match(html, /src\/app\.js\?v=038/);
  assert.match(html, /online\.bundle\.js\?v=038/);
});

test('Private Online-Version enthält Rollen-, Sync- und Finale-Oberflächen', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const app = await readFile(new URL('src/app.js', root), 'utf8');
  const online = await readFile(new URL('src/online-controller.js', root), 'utf8');
  assert.match(html, /online-lobby/);
  assert.match(html, /romance-finale/);
  assert.match(app, /canLocalAct/);
  assert.match(app, /tiefstapelOnline/);
  assert.match(online, /from '@trystero-p2p\/mqtt'/);
  assert.match(online, /joinRoom/);
  assert.match(html, /id="safari-copy"/);
  assert.match(html, /Safari-Link kopieren/);
  assert.match(online, /navigator\.clipboard\.writeText\(location\.href\)/);
  assert.match(app, /const viewPlayerIndex=onlineRoom\?localPlayerIndex:game\.currentPlayer/);
  assert.match(app, /const viewed=game\.players\[viewPlayerIndex\]/);
  assert.match(app, /revealInitialCard/);
  assert.match(app, /Wähle deine ersten zwei Karten/);
  assert.match(online, /proposalAction/);
  assert.match(online, /room\.onPeerJoin=peerId=>\{\s*connected=true;hideLobby\(\)/);
  assert.match(online, /crypto\.subtle\.decrypt/);
});

test('Persönliche Inhalte liegen nur verschlüsselt vor', async () => {
  const image = await readFile(new URL('assets/private/moment.enc', root));
  const message = await readFile(new URL('assets/private/message.enc', root));
  assert.notDeepEqual([...image.subarray(0, 3)], [255, 216, 255]);
  assert.notEqual(message[0], 123);
  assert.ok(image.length > 50000);
});
