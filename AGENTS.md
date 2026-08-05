# TIEFSTAPEL Private Online Agent Notes

- This repository is separate from the stable normal TIEFSTAPEL game.
- Mobile-first PWA for exactly two human roles over encrypted WebRTC.
- Never track `.surprise-key`, `private-links.txt`, `qa-private/`, scripts containing generated links, or decrypted personal media/copy.
- Personal payloads under `assets/private/` must remain AES-GCM encrypted.
- Core rules remain in `src/engine.js`; synchronization is in `src/online-controller.js` and its generated bundle.
- After controller edits run `npm run build`, then `npm test` and `npm run check`.
- Bump the service-worker cache namespace after app-shell changes.
- Verify with two separate browser contexts: connection, role guard, bidirectional turns, equal final state, and finale on both.
