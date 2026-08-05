# TIEFSTAPEL – Private Online-Partie

Mobile Zwei-Spieler-Ausgabe mit verschlüsselter WebRTC-Synchronisierung. Spielzustände laufen direkt zwischen den Geräten. Persönliche Medien und Texte liegen ausschließlich als AES-GCM-verschlüsselte Binärdaten vor; Raum-, Verbindungs- und Medienschlüssel werden nur über das URL-Fragment übergeben.

## Entwicklung

```bash
npm install
npm run build
npm test
npm run check
```

## Safari-Übergabe

Falls Telegram oder WhatsApp beim Wechsel zu Safari das private URL-Fragment entfernt, im Spiel auf **„Safari-Link kopieren“** tippen und den kopierten Link vollständig in Safaris Adresszeile einsetzen.
