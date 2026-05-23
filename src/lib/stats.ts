// src/lib/stats.ts
// Session-Statistiken mit localStorage-Persistenz.
// SSR-safe: alle localStorage-Zugriffe hinter browser-Check.

import { browser } from '$app/environment';

const STATS_KEY   = 'casino_stats';
const BANKROLL_START_KEY = 'casino_session_start';
const DEFAULT_BANKROLL = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionStats {
	handsPlayed:          number;
	wins:                 number;   // Win + Blackjack + Dealer-Bust
	losses:               number;   // Lose + Bust
	pushes:               number;
	biggestWin:           number;   // Grösster einzelner Nettogewinn einer Runde
	sessionStartBankroll: number;   // Bankroll beim Start der Session
}

const DEFAULT_STATS: SessionStats = {
	handsPlayed:          0,
	wins:                 0,
	losses:               0,
	pushes:               0,
	biggestWin:           0,
	sessionStartBankroll: DEFAULT_BANKROLL,
};

// ─── Lesen / Schreiben ────────────────────────────────────────────────────────

export function getStats(): SessionStats {
	if (!browser) return { ...DEFAULT_STATS };
	try {
		const raw = localStorage.getItem(STATS_KEY);
		if (!raw) return initStats();
		return { ...DEFAULT_STATS, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULT_STATS };
	}
}

export function setStats(stats: SessionStats): void {
	if (!browser) return;
	localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// Setzt Stats zurück, übernimmt aktuelle Bankroll als neuen Session-Start
export function resetStats(currentBankroll: number): void {
	if (!browser) return;
	const fresh: SessionStats = {
		...DEFAULT_STATS,
		sessionStartBankroll: currentBankroll,
	};
	localStorage.setItem(STATS_KEY, JSON.stringify(fresh));
	localStorage.setItem(BANKROLL_START_KEY, String(currentBankroll));
}

// Initialisiert Stats beim allerersten Besuch
function initStats(): SessionStats {
	const stats: SessionStats = { ...DEFAULT_STATS };
	localStorage.setItem(STATS_KEY, JSON.stringify(stats));
	return stats;
}

// ─── Update-Helfer ────────────────────────────────────────────────────────────

export type RoundOutcome = 'win' | 'loss' | 'push';

/**
 * Erfasst eine abgeschlossene Runde.
 * @param outcome   'win' | 'loss' | 'push'
 * @param netResult Nettogewinn dieser Runde (positiv = Gewinn, negativ = Verlust, 0 = Push)
 * @param hands     Anzahl gespielter Hände (1 normal, 2 bei Split)
 */
export function recordRound(
	outcome: RoundOutcome,
	netResult: number,
	hands = 1
): void {
	if (!browser) return;
	const stats = getStats();

	stats.handsPlayed += hands;

	if (outcome === 'win') {
		stats.wins += hands;
		if (netResult > stats.biggestWin) stats.biggestWin = Math.round(netResult * 100) / 100;
	} else if (outcome === 'loss') {
		stats.losses += hands;
	} else {
		stats.pushes += hands;
	}

	setStats(stats);
}

// ─── Direktes Update (atomar: lesen + schreiben in einem Schritt) ────────────
// Vermeidet Race Conditions wenn mehrere Hands schnell hintereinander gespeichert werden

export function recordRoundDirect(
	outcome: RoundOutcome,
	netResult: number,
	numHands = 1
): void {
	if (!browser) return;
	const stats = getStats();

	stats.handsPlayed += numHands;

	if (outcome === 'win') {
		stats.wins += numHands;
		if (netResult > stats.biggestWin) stats.biggestWin = Math.round(netResult * 100) / 100;
	} else if (outcome === 'loss') {
		stats.losses += numHands;
	} else {
		stats.pushes += numHands;
	}

	setStats(stats);
}

// ─── Berechnete Werte ─────────────────────────────────────────────────────────

export function winRate(stats: SessionStats): number {
	const finished = stats.wins + stats.losses + stats.pushes;
	if (finished === 0) return 0;
	return Math.round((stats.wins / finished) * 1000) / 10; // eine Dezimalstelle
}

export function sessionProfit(stats: SessionStats, currentBankroll: number): number {
	return Math.round((currentBankroll - stats.sessionStartBankroll) * 100) / 100;
}