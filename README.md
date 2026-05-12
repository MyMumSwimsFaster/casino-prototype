# Casino Prototype

## Projektbeschreibung

Diese Webanwendung ist ein Prototyp für ein einfaches Casino-Spiel. Der Hauptworkflow basiert auf Blackjack: Nutzer können einen Einsatz eingeben, eine Spielrunde starten, ein Ergebnis erhalten und die gespielten Runden in einer History einsehen.

Der Prototyp wurde im Rahmen des Moduls Prototyping umgesetzt.

## Ziel des Prototyps

Ziel ist es, einen funktionierenden End-to-End-Workflow umzusetzen:

1. Startseite öffnen
2. Blackjack auswählen
3. Einsatz eingeben
4. Runde starten
5. Ergebnis anzeigen
6. Spielrunde in MongoDB speichern
7. gespeicherte Runden in der History anzeigen

## Verwendete Technologien

- SvelteKit
- TypeScript
- Tailwind CSS
- MongoDB Atlas
- Git / GitHub
- Netlify

## Hauptfunktionen

- Blackjack-Runde starten
- Einsatzbetrag eingeben
- zufälliges Spielergebnis berechnen
- Ergebnis speichern
- gespeicherte Spielrunden anzeigen
- Deployment über Netlify

## Datenbank

Die Spielrunden werden in MongoDB gespeichert. Pro Spielrunde werden folgende Daten gespeichert:

- Spieltyp
- Einsatzbetrag
- Punktzahl Spieler
- Punktzahl Dealer
- Ergebnis
- Erstellungsdatum

## Deployment

Die Anwendung ist online über Netlify erreichbar:

https://casino-prototype.netlify.app/

## GitHub Repository

https://github.com/MyMumSwimsFaster/casino-prototype

## Bezug zum Mockup

Das finale UI wurde vereinfacht und angepasst, damit der Hauptworkflow stabil funktioniert. Das Casino-Thema, dunkle Farbschema, Blackjack-Ablauf, Einsatz und Ergebnisanzeige wurden übernommen.

## Einsatz von KI-Tools

Für die Entwicklung wurde KI-Unterstützung verwendet, insbesondere für:

- Strukturierung des SvelteKit-Projekts
- Unterstützung bei der MongoDB-Anbindung
- Erstellung und Verbesserung von Code
- Debugging von Fehlern
- Formulierung der Dokumentation

Der Code wurde geprüft, getestet und eigenständig angepasst.

## Aktueller Stand

Der Prototyp ist als Zwischenergebnis funktionsfähig. Der Hauptworkflow funktioniert vollständig und die Daten werden persistent gespeichert.

## Mögliche Erweiterungen

- Baccarat als weiterer Workflow
- echte Blackjack-Kartenlogik
- Gewinn-/Verluststatistiken
- Filterfunktion in der History
- Benutzerkonten
- Admin-Ansicht