// src/lib/bankroll.ts
// Zentraler Bankroll-Store mit localStorage-Persistenz.
// Nur im Browser verwenden — SSR-safe durch browser-Check.

import { browser } from '$app/environment';

const STORAGE_KEY = 'casino_bankroll';
const DEFAULT_BANKROLL = 1000;

// ── Lesen / Schreiben ─────────────────────────────────────────────────────────

export function getBankroll(): number {
	if (!browser) return DEFAULT_BANKROLL;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return DEFAULT_BANKROLL;
	const val = parseFloat(raw);
	return isNaN(val) ? DEFAULT_BANKROLL : val;
}

export function setBankroll(amount: number): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, String(Math.round(amount * 100) / 100));
}

export function resetBankroll(): void {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, String(DEFAULT_BANKROLL));
}

// ── Auszahlungsberechnung Blackjack ───────────────────────────────────────────
// Gibt zurück, wie viel zurück in die Bankroll fliesst (bei Verlust: 0).
// Der Einsatz wurde bereits beim Deal abgezogen.

export type BjHandResult = 'blackjack' | 'win' | 'dealer-bust' | 'push' | 'lose' | 'bust';

export function bjPayout(bet: number, result: BjHandResult): number {
	switch (result) {
		case 'blackjack':    return Math.round(bet * 2.5 * 100) / 100; // 3:2 = Einsatz × 2.5
		case 'win':
		case 'dealer-bust':  return bet * 2;                            // 1:1 = Einsatz × 2
		case 'push':         return bet;                                 // Einsatz zurück
		case 'lose':
		case 'bust':
		default:             return 0;                                   // Verloren
	}
}

// ── Auszahlungsberechnung Baccarat ────────────────────────────────────────────

export type BaccaratSelectedBet = 'Player' | 'Banker' | 'Tie';
export type BaccaratResult = 'Player wins' | 'Banker wins' | 'Tie';

export function baccaratPayout(
	bet: number,
	selectedBet: BaccaratSelectedBet,
	result: BaccaratResult
): number {
	if (selectedBet === 'Player') {
		if (result === 'Player wins') return bet * 2;         // 1:1
		if (result === 'Tie')         return bet;              // Push bei Tie
		return 0;                                              // Verloren
	}
	if (selectedBet === 'Banker') {
		if (result === 'Banker wins') return Math.round(bet * 1.95 * 100) / 100; // 0.95:1
		if (result === 'Tie')         return bet;              // Push bei Tie
		return 0;
	}
	// Tie-Wette
	if (result === 'Tie') return bet * 9;                     // 8:1
	return 0;                                                  // Verloren
}