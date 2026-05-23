// src/lib/sounds.ts
// Casino Sound System — SSR-safe, browser-only, mute-persistent
// Alle Sounds aus /static/sounds/ — kein externes Netzwerk.

import { browser } from '$app/environment';

const MUTE_KEY = 'casino_muted';

// ─── Mute-State ───────────────────────────────────────────────────────────────

export function getMuted(): boolean {
	if (!browser) return false;
	return localStorage.getItem(MUTE_KEY) === 'true';
}

export function setMuted(muted: boolean): void {
	if (!browser) return;
	localStorage.setItem(MUTE_KEY, String(muted));
}

export function toggleMuted(): boolean {
	const next = !getMuted();
	setMuted(next);
	return next;
}

// ─── Intern: Audio-Cache ──────────────────────────────────────────────────────
// Jede Datei wird einmalig geladen und danach gecacht.
// HTMLAudioElement erlaubt mehrfaches play() durch cloneNode().

const cache: Record<string, HTMLAudioElement> = {};

function getAudio(src: string): HTMLAudioElement {
	if (!cache[src]) {
		cache[src] = new Audio(src);
		cache[src].preload = 'auto';
	}
	return cache[src];
}

function play(src: string, volume = 1.0): void {
	if (!browser || getMuted()) return;
	try {
		// cloneNode ermöglicht overlapping playback (z.B. schnelles Chip-Klicken)
		const el = getAudio(src).cloneNode() as HTMLAudioElement;
		el.volume = Math.max(0, Math.min(1, volume));
		el.play().catch(() => {
			// Autoplay-Block oder fehlende Datei — still ignorieren
		});
	} catch {
		// Kein Crash wenn Audio nicht verfügbar
	}
}

// ─── Öffentliche Sound-API ────────────────────────────────────────────────────

export const sfx = {
	/** Karte wird ausgeteilt oder aufgedeckt */
	cardDeal:  () => play('/sounds/card-deal.wav',   0.55),

	/** Chip wird auf den Einsatz-Stack gelegt */
	chipClick: () => play('/sounds/chip-click.wav',  0.7),

	/** Runde gewonnen (Win, Dealer Bust) */
	win:       () => play('/sounds/win.wav',          0.75),

	/** Runde verloren (Lose, Bust) */
	lose:      () => play('/sounds/lose.wav',         0.65),

	/** Blackjack — 3:2 Auszahlung */
	blackjack: () => play('/sounds/blackjack.wav',    0.8),

	/** Baccarat Natural Hand (8 oder 9 mit ersten zwei Karten) */
	natural:   () => play('/sounds/natural.wav',      0.75),
} as const;