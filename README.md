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

## Promptvorgehen / KI-Workflow

Während der Entwicklung wurde KI-Unterstützung gezielt eingesetzt, um technische Probleme effizient zu lösen und die Entwicklung des Prototyps zu beschleunigen.

Die KI wurde insbesondere für folgende Bereiche verwendet:

- Planung der Projektstruktur in SvelteKit
- Entwicklung des End-to-End-Workflows
- Integration von MongoDB Atlas
- Erstellung von API-Routen
- Debugging von State-Management und Event-Handling
- Deployment mit Netlify
- Verbesserung von UI/UX und Benutzerfeedback
- Dokumentation und technische Strukturierung

Beispiele für verwendete Prompts:

- „Erstelle eine modulare SvelteKit-Struktur für einen Casino-Prototypen mit mehreren Routen.“
- „Wie implementiere ich eine persistente Speicherung von Spielrunden mit MongoDB Atlas in SvelteKit?“
- „Wie kann ein End-to-End-Workflow für Blackjack technisch umgesetzt werden?“
- „Analysiere den Fehler beim Deployment auf Netlify und identifiziere mögliche Ursachen.“
- „Wie können API-Routes in SvelteKit genutzt werden, um Spielrunden serverseitig zu speichern?“
- „Wie kann eine History-Seite erstellt werden, welche MongoDB-Daten serverseitig lädt und darstellt?“
- „Verbessere die Benutzerführung und das visuelle Feedback im aktuellen UI.“
- „Wie kann das bestehende Mockup technisch vereinfacht und stabil implementiert werden?“

Die generierten Vorschläge wurden analysiert, getestet und an die Anforderungen des Projekts angepasst.