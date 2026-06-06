# Royal Table – Casino Prototype

## Projektbeschreibung

Royal Table ist ein moderner Casino-Prototyp, der im Rahmen des Moduls Prototyping entwickelt wurde.

Ziel des Projekts war die Entwicklung einer webbasierten Anwendung mit einem vollständigen End-to-End-Workflow. Die Anwendung ermöglicht das Spielen von Blackjack und Baccarat, die Verwaltung von Benutzerkonten, die Speicherung von Spielständen sowie die Analyse vergangener Spielrunden.

Während des Projekts wurde besonderer Wert auf Benutzerfreundlichkeit, visuelles Feedback, moderne UI-Gestaltung sowie die Umsetzung eines realistischen Casino-Erlebnisses gelegt.

---

# Ziel des Prototyps

Ziel war die Umsetzung eines funktionsfähigen Casino-Prototyps mit folgenden Kernanforderungen:

1. Benutzer registrieren oder als Gast spielen
2. Spiel auswählen
3. Einsatz platzieren
4. Spielrunde durchführen
5. Ergebnis anzeigen
6. Daten speichern
7. Spielhistorie anzeigen
8. Benutzerbezogene Statistiken verwalten

---

# Verwendete Technologien

* SvelteKit
* TypeScript
* Tailwind CSS
* MongoDB Atlas
* Netlify
* Git
* GitHub
* Visual Studio Code

---

# Umgesetzte Funktionen

## Benutzerverwaltung

* Registrierung neuer Benutzer
* Login und Logout
* Passwort-Hashing
* Session-Verwaltung
* Persistente Speicherung der Benutzerdaten

## Blackjack

* Hit
* Stand
* Double Down
* Split
* Insurance
* Side Bets
* Blackjack-Erkennung
* Dealer Peek
* Automatische Dealer-Logik

## Baccarat

* Player Bet
* Banker Bet
* Tie Bet
* Automatische Baccarat-Regeln
* Natural Hands
* Cinematic Card Reveal
* Autoplay-Modus
* Manuelle Kartenaufdeckung

## Spielhistorie

* Speicherung gespielter Runden
* Anzeige vergangener Spiele
* Benutzerbezogene Historie
* Session Journal

## Statistik

* Anzahl gespielter Hände
* Gewinnrate
* Anzahl Siege
* Anzahl Niederlagen
* Gesamtgewinn / Gesamtverlust
* Beste Runde

## Benutzeroberfläche

* Modernes Casino-Design
* Animationen
* Soundeffekte
* Visuelles Feedback
* Responsive Gestaltung
* Konsistente Benutzerführung

---

# Datenbank

Die Anwendung verwendet MongoDB Atlas zur persistenten Datenspeicherung.

Gespeichert werden unter anderem:

* Benutzerkonten
* Passwort-Hashes
* Spielhistorie
* Session-Daten
* Statistiken
* Spielresultate

---

# Deployment

Die Anwendung wurde mit Netlify veröffentlicht und ist online verfügbar.

Deployment URL:

https://casino-prototype.netlify.app/

---

# GitHub Repository

https://github.com/MyMumSwimsFaster/casino-prototype

---

# Vorgehen

Die Entwicklung erfolgte anhand der im Modul vermittelten Phasen:

## Understand / Define

Analyse der Anforderungen und Definition der Kernfunktionen eines Casino-Prototyps.

## Sketch

Erstellung von Mockups und ersten Oberflächenentwürfen.

## Decide

Auswahl der finalen Lösung sowie Definition der wichtigsten Workflows.

## Prototype

Implementierung der Anwendung mit SvelteKit, MongoDB und Netlify.

## Validate

Durchführung einer Usability-Evaluation mit drei Testpersonen sowie anschliessende Analyse und Verbesserung der Anwendung auf Basis der gewonnenen Erkenntnisse.

---

# Bezug zum Mockup

Die Anwendung basiert auf einem zuvor erstellten Figma-Prototyp. Während der Entwicklungsphase wurden verschiedene Iterationen durchgeführt, um die Benutzerführung, die Spielabläufe sowie das visuelle Design zu verbessern.

Interaktiver Prototyp (Figma):

https://www.figma.com/proto/GhyQvLrSNPlWEVNULbYodb/Projekt?node-id=0-1&t=PKECiV8w4YWocnhQ-1

Figma-Projekt:

https://www.figma.com/design/GhyQvLrSNPlWEVNULbYodb/Projekt?node-id=0-1&m=dev&t=dxnL578Rf4Mhkrzy-1

Im Verlauf der Entwicklung wurden verschiedene Elemente gegenüber dem ursprünglichen Entwurf angepasst. Dazu gehören insbesondere die Navigation, das visuelle Feedback während des Spiels, die Gestaltung der History, die Benutzerkonten sowie zusätzliche Funktionen wie Side Bets, Auto Play, Soundeffekte und die persistente Speicherung von Spielständen.

Das finale Produkt orientiert sich weiterhin am ursprünglichen Konzept, wurde jedoch aufgrund von Usability-Erkenntnissen, technischem Feedback sowie zusätzlichen Erweiterungen kontinuierlich weiterentwickelt.

---

# Usability Evaluation

Die Anwendung wurde mit drei Testpersonen unterschiedlicher Erfahrungsstufen evaluiert.

Während der Durchführung wurden zentrale Workflows beobachtet und dokumentiert. Die Evaluation umfasste Aufgaben zu Navigation, Spielverständnis, Blackjack, Baccarat, History sowie Benutzerführung.

Auf Basis der Erkenntnisse wurden verschiedene Verbesserungen umgesetzt, beispielsweise:

* Optimierung der Benutzerführung
* Verbesserungen im Layout
* Klareres visuelles Feedback
* Anpassungen bei Animationen
* Erweiterung von Hilfestellungen und Informationen

Die vollständige Evaluation befindet sich im separaten Dokument der Usability-Evaluation.

---

# Erweiterungen über den Mindestumfang hinaus

Folgende Funktionen wurden zusätzlich zum Mindestumfang umgesetzt:

* Benutzerkonten
* Authentifizierung
* MongoDB-basierte Sessions
* Baccarat als zweites Spiel
* Side Bets
* Sound-System
* Autoplay-Modus
* Erweiterte Statistiken
* Benutzerbezogene Historie
* Premium Casino User Interface
* Verbesserte Animationen und visuelles Feedback

---

# Einsatz von KI-Tools

Für die Entwicklung wurden KI-Tools unterstützend eingesetzt.

Verwendete Werkzeuge:

* ChatGPT
* Claude

Die KI wurde insbesondere genutzt für:

* Strukturierung des Projekts
* Unterstützung bei der Entwicklung
* Fehlersuche und Debugging
* Optimierung von UI und UX
* Deployment-Probleme
* Dokumentation

Alle generierten Vorschläge wurden geprüft, getestet und eigenständig angepasst.

Die Verantwortung für den finalen Code lag jederzeit beim Entwickler.

---

# Promptvorgehen / KI-Workflow

Während der Entwicklung wurde KI gezielt eingesetzt, um technische Probleme effizient zu lösen und Entwicklungsprozesse zu beschleunigen.

Einsatzbereiche:

* Planung der Projektstruktur
* Entwicklung der Datenbankanbindung
* Authentifizierung
* API-Routen
* MongoDB Integration
* UI-Verbesserungen
* Deployment
* Fehleranalyse
* Dokumentation

Beispiele verwendeter Prompts:

* „Erstelle eine modulare SvelteKit-Struktur für einen Casino-Prototypen.“
* „Wie implementiere ich Benutzerkonten mit MongoDB in SvelteKit?“
* „Analysiere den Fehler beim Netlify Deployment.“
* „Wie kann eine persistente Spielhistorie umgesetzt werden?“
* „Verbessere die Benutzerführung und das visuelle Feedback.“
* „Wie kann Baccarat mit automatischen Regeln umgesetzt werden?“

Die generierten Vorschläge wurden analysiert, getestet und den Projektanforderungen angepasst.

---

# Aktueller Stand

Der Prototyp ist funktionsfähig und online verfügbar.

Alle zentralen Workflows funktionieren vollständig:

* Registrierung
* Login
* Blackjack
* Baccarat
* Speicherung von Spielrunden
* Historie
* Statistiken
* Deployment

Der entwickelte Funktionsumfang übersteigt den definierten Mindestumfang deutlich.
