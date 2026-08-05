# Project State

Version 0.3.0: separate private Zwei-Handy-Testausgabe.

## Funktionen
- Zwei menschliche Rollen auf getrennten Browsern
- Direkte verschlüsselte WebRTC-Synchronisierung
- Rollenbasierter Zugschutz
- Host-bestätigte Zustände und Reconnect-Resync
- Beschleunigter privater Testmodus
- AES-GCM-verschlüsseltes persönliches Finale
- Versteckte Host-Auslösung als Absicherung

## Prüfung
- `npm run build`
- `npm test`
- `npm run check`
- Zwei getrennte Browser-Kontexte müssen Verbindung, Zugschutz, vollständige Partie, identischen Endstand und Finale bestätigen.
