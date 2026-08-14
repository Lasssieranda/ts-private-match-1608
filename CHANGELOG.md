# Changelog

## 0.3.10 – 2026-08-14
- Die Ziehkarte-auf-Zielkarte-Geste wurde auf Wunsch zurückgenommen; vorherige Bedienung wiederhergestellt.
- Privater App-Cache sicher auf `tiefstapel-heart-v13` / `?v=041` angehoben.

## 0.3.8 – 2026-08-14
- Regelkonforme Daumen-Ziehgeste auch in der privaten Zwei-Handy-Partie: erlaubte Tauschkarte nach oben zur Ablage ziehen, sonst ruhiges Zurückfedern.
- Die Geste bleibt an die lokale Rolle und den gültigen Zug gebunden; Spielstand, Synchronisierung und private Inhalte bleiben unverändert.
- App-Shell auf `?v=039`, privater Offline-Cache auf `tiefstapel-heart-v11`.

## 0.3.7 – 2026-08-14
- Partnerauslage als klarer, sichtbarer 3×4-Tisch mit eigenen Kartenrückseiten, offenen Werten und entfernten Kartenlücken.
- Aktiver Partnertisch erhält eine zurückhaltende Hervorhebung; die große eigene Auslage bleibt privat und unverändert.
- App-Shell auf `?v=038`, privater Offline-Cache auf `tiefstapel-heart-v10`.

## 0.3.6 – 2026-08-14
- Ruhiger fester eigener Spieltisch mit gestapeltem Ablagebereich auch in der privaten Zwei-Handy-Partie.
- Neue getrennte Zugspur zeigt parallel den letzten eigenen und den letzten Partnerzug; sie speichert ausschließlich öffentliche Aktionen.
- Private Online-Synchronisierung, verschlüsselte persönliche Inhalte und Finale bleiben unverändert.
- App-Shell auf `?v=037`, privater Offline-Cache auf `tiefstapel-heart-v9`.

## 0.3.4 – 2026-08-05
- Online-Auslage bleibt dauerhaft beim lokalen Spieler.
- Gegnerkarten blitzen beim Zugwechsel nicht mehr in der großen Auslage auf.
- Offline-Hot-Seat-Verhalten bleibt unverändert.
- Safari-App- und Service-Worker-Version aktualisiert.

## 0.3.3 – 2026-08-05
- Alle zwölf Karten beginnen verdeckt.
- Jeder Spieler wählt und deckt seine ersten zwei Karten selbst auf.
- Die höchste Summe der Startkarten bestimmt den ersten Zug; Gleichstände werden fair ausgelost.
- Dauerhaften Lukas-Host und Jahrestagsjob an die neue Startphase angepasst.
- App-, Engine-, Bundle- und Service-Worker-Version für Safari aktualisiert.

## 0.3.2 – 2026-08-05
- Dauerhaften „Safari-Link kopieren“-Button ergänzt.
- Vollständige private Einladung inklusive URL-Fragment wird sicher kopiert.
- Zuverlässiger Übergang aus Telegram- und WhatsApp-In-App-Browsern zu Safari.
- Bundle und Service-Worker-Cache erneut versioniert.

## 0.3.1 – 2026-08-05
- Signalisierung von Nostr auf redundante MQTT-WebSocket-Broker umgestellt.
- Verbindungsaufbau auf Safari und über unterschiedliche Netze robuster gemacht.
- Service-Worker-Cache auf `tiefstapel-heart-v2` aktualisiert.

## 0.3.0 – 2026-08-05
- Separate Zwei-Handy-Ausgabe mit privatem Einladungsraum.
- Verschlüsselte direkte WebRTC-Synchronisierung für genau zwei Rollen.
- Rollenbasierter Zugschutz und Host-bestätigte Zustände.
- Reconnect-Synchronisierung und beschleunigter Verbindungstest.
- Persönliches Finale nur aus AES-GCM-verschlüsselten Daten.

## 0.2.0 – 2026-08-05
- Klassisches helles Kartendesign aus dem stabilen Basisspiel übernommen.
