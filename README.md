# Projektdokumentation - Royal Table

## Inhaltsverzeichnis

1. Ausgangslage
2. Lösungsidee
3. Vorgehen & Artefakte
   1. Understand & Define
   2. Sketch
   3. Decide
   4. Prototype
   5. Validate
4. Erweiterungen
5. Projektorganisation
6. KI-Deklaration
7. Anhang

---

# 1. Ausgangslage

## Problem

Online-Casino-Spiele bestehen aus mehreren zusammenhängenden Workflows wie Benutzerverwaltung, Spielablauf, Datenspeicherung und Statistiken. Ziel dieses Projekts war die Entwicklung eines vollständigen webbasierten Casino-Prototyps, der diese Abläufe in einer modernen Benutzeroberfläche vereint.

## Ziele

- Entwicklung eines vollständigen End-to-End-Workflows
- Umsetzung mit SvelteKit und MongoDB
- Speicherung von Spielständen und Benutzerdaten
- Bereitstellung einer benutzerfreundlichen Oberfläche
- Deployment einer lauffähigen Webanwendung

## Primäre Zielgruppe

Spielerinnen und Spieler, welche eine einfache Casino-Anwendung nutzen möchten.

---

# 2. Lösungsidee

## Kernfunktionalität

Die Anwendung ermöglicht:

- Registrierung und Login
- Spielen von Blackjack
- Spielen von Baccarat
- Speicherung von Spielrunden
- Anzeige einer persönlichen Spielhistorie
- Statistische Auswertung der Spielaktivitäten

## Abgrenzung

Es handelt sich um einen Prototyp und nicht um ein Echtgeld-Casino. Der Fokus liegt auf der technischen Umsetzung und dem Benutzererlebnis.

---

# 3. Vorgehen & Artefakte

## 3.1 Understand & Define

### Zielgruppenverständnis

Die Zielgruppe besteht aus Personen, welche einfache Casino-Spiele direkt im Browser spielen möchten.

### Wesentliche Erkenntnisse

- Einfache Navigation ist wichtig.
- Spielregeln müssen jederzeit verfügbar sein.
- Spieler erwarten visuelles Feedback.
- Eine Historie erhöht die Nachvollziehbarkeit der gespielten Runden.

---

## 3.2 Sketch

### Variantenüberblick

Zu Beginn wurden mehrere Layout-Varianten erstellt und miteinander verglichen.

### Skizzen

Die ersten Entwürfe wurden in Figma erstellt. Dabei wurden unterschiedliche Anordnungen von Navigation, Spielbereich und Statistiken getestet.

---

## 3.3 Decide

### Gewählte Variante & Begründung

Gewählt wurde ein modernes Casino-Design mit dunklem Farbschema, goldenen Akzenten und klarer Trennung der einzelnen Bereiche.

### End-to-End-Ablauf

1. Benutzer registriert sich oder spielt als Gast
2. Auswahl eines Spiels
3. Einsatz platzieren
4. Runde spielen
5. Ergebnis anzeigen
6. Speicherung der Daten
7. Anzeige der Historie

### Mockup

Interaktiver Prototyp:

https://www.figma.com/proto/GhyQvLrSNPlWEVNULbYodb/Projekt?node-id=0-1&t=PKECiV8w4YWocnhQ-1

Figma-Datei:

https://www.figma.com/design/GhyQvLrSNPlWEVNULbYodb/Projekt?node-id=0-1&m=dev&t=dxnL578Rf4Mhkrzy-1

---

## 3.4 Prototype

### 3.4.1 Entwurf (Design)

#### Informationsarchitektur

Die Anwendung besteht aus:

- Lobby / Startseite
- Login
- Registrierung
- Blackjack
- Baccarat
- History
- Account

#### User Interface Design

Wichtige Eigenschaften:

- Modernes Casino-Layout
- Dunkles Design
- Goldene Hervorhebungen
- Animationen
- Soundeffekte
- Responsives Layout

#### Designentscheidungen

- Fokus auf Benutzerfreundlichkeit
- Klare visuelle Rückmeldungen
- Einheitliche Gestaltung aller Seiten

---

### 3.4.2 Umsetzung (Technik)

#### Technologie-Stack

- SvelteKit
- TypeScript
- Tailwind CSS
- MongoDB Atlas

#### Tooling

- Visual Studio Code
- Git
- GitHub
- Netlify

#### Struktur & Komponenten

Wichtige Bereiche:

- Authentifizierung
- Blackjack-Komponenten
- Baccarat-Komponenten
- History-System
- Session-Verwaltung
- Datenbankanbindung

#### Daten & Schnittstellen

Gespeichert werden:

- Benutzerkonten
- Passwort-Hashes
- Spielresultate
- Historie
- Statistiken
- Session-Daten

#### Deployment

https://casino-prototype.netlify.app/

#### Besondere Entscheidungen

- Gastmodus ohne Registrierung
- Persistente Benutzerkonten
- Separate Historie für registrierte Benutzer
- Erweiterung um Baccarat und Statistiken

---

## 3.5 Validate

### URL der getesteten Version

https://casino-prototype.netlify.app/

### Ziele der Prüfung

- Verständnis der Navigation
- Verständlichkeit der Spielabläufe
- Bedienbarkeit der Anwendung
- Auffindbarkeit wichtiger Funktionen

### Vorgehen

Moderierte Usability-Tests.

### Stichprobe

Drei Testpersonen mit unterschiedlichem Erfahrungsstand.

### Aufgaben / Szenarien

- Registrierung durchführen
- Login durchführen
- Blackjack spielen
- Baccarat spielen
- Historie aufrufen
- Statistiken prüfen

### Kennzahlen & Beobachtungen

Die meisten Aufgaben konnten erfolgreich abgeschlossen werden. Verbesserungspotenzial zeigte sich insbesondere bei der Auffindbarkeit einzelner Funktionen und der Benutzerführung.

### Zusammenfassung der Resultate

Die Anwendung wurde insgesamt positiv bewertet. Die Testpersonen konnten alle wesentlichen Workflows erfolgreich abschliessen.

### Abgeleitete Verbesserungen

- Verbesserte Navigation
- Zusätzliche Hinweise für Benutzer
- Optimierung der History
- Erweiterung der Spielinformationen

Die vollständige Evaluation befindet sich im separaten Dokument.

---

# 4. Erweiterungen

## 4.1 Benutzerkonten

### Beschreibung & Nutzen

Registrierte Benutzer erhalten eine persistente Historie und persönliche Statistiken.

### Wo umgesetzt

- Frontend
- Backend
- MongoDB

### Aus Evaluation abgeleitet?

Nein

---

## 4.2 Baccarat

### Beschreibung & Nutzen

Zusätzlich zu Blackjack wurde Baccarat implementiert.

### Wo umgesetzt

Frontend und Backend.

### Aus Evaluation abgeleitet?

Nein

---

## 4.3 Sound-System

### Beschreibung & Nutzen

Verbessert das Spielerlebnis durch akustisches Feedback.

### Wo umgesetzt

Frontend.

### Aus Evaluation abgeleitet?

Teilweise.

---

## 4.4 Erweiterte Statistiken

### Beschreibung & Nutzen

Anzeige von Gewinnrate, Gesamtgewinn, Niederlagen und Best-Win.

### Wo umgesetzt

Frontend, Backend und MongoDB.

### Aus Evaluation abgeleitet?

Ja

---

# 5. Projektorganisation

## Repository

GitHub Repository:

https://github.com/MyMumSwimsFaster/casino-prototype

## Commit-Praxis

Während der Entwicklung wurden regelmässig Commits erstellt und auf GitHub veröffentlicht.

---

# 6. KI-Deklaration

## 6.1 KI-Tools

### Eingesetzte Tools

- ChatGPT
- Claude

### Zweck & Umfang

Die KI wurde verwendet für:

- Projektstruktur
- Datenbankanbindung
- Authentifizierung
- API-Routen
- Debugging
- Deployment
- Dokumentation
- UI/UX Verbesserungen

### Eigene Leistung

Alle generierten Vorschläge wurden geprüft, getestet und eigenständig angepasst.

---

## 6.2 Prompt-Vorgehen

Die KI wurde gezielt eingesetzt, um technische Probleme effizient zu lösen und Entwicklungsprozesse zu beschleunigen.

Typische Einsatzbereiche:

- Projektplanung
- MongoDB Integration
- Authentifizierung
- Fehleranalyse
- UI Optimierung
- Deployment

Beispielprompts:

- "Erstelle eine modulare SvelteKit-Struktur für einen Casino-Prototypen."
- "Wie implementiere ich Benutzerkonten mit MongoDB?"
- "Analysiere den Fehler beim Netlify Deployment."
- "Wie kann eine persistente Spielhistorie umgesetzt werden?"

---

## 6.3 Reflexion

Der Einsatz von KI beschleunigte die Entwicklung erheblich und half insbesondere bei technischen Problemen. Gleichzeitig war eine kontinuierliche Überprüfung der generierten Vorschläge notwendig, um Fehler zu vermeiden und die Anforderungen korrekt umzusetzen.

---

# 7. Anhang

## Quellen

- SvelteKit Dokumentation
- MongoDB Dokumentation
- Tailwind CSS Dokumentation
- Netlify Dokumentation

## Mockup

Figma:

https://www.figma.com/design/GhyQvLrSNPlWEVNULbYodb/Projekt?node-id=0-1&m=dev&t=dxnL578Rf4Mhkrzy-1

Interaktiver Prototyp:

https://www.figma.com/proto/GhyQvLrSNPlWEVNULbYodb/Projekt?node-id=0-1&t=PKECiV8w4YWocnhQ-1
