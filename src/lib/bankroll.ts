// src/lib/bankroll.ts
// Bankroll storage — localStorage for guests, MongoDB API for logged-in users.
// The key insight: when a user is logged in, we always sync to/from the server.

import { browser } from '$app/environment';

const STORAGE_KEY    = 'casino_bankroll';
const USER_KEY       = 'casino_user';       // stores { id, username, email } when logged in
const DEFAULT_BANKROLL = 1000;  // guest default; registered users get 2000 via welcome bonus at registration

// ── User session (client-side cache of server session) ───────────────────────

export interface CasinoUser {
	id:       string;
	username: string;
	email:    string;
}

/** Returns the logged-in user from localStorage cache, or null for guests. */
export function getCachedUser(): CasinoUser | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(USER_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch { return null; }
}

/** Called after login/register — caches user locally so games know about it. */
export function setCachedUser(user: CasinoUser | null): void {
	if (!browser) return;
	if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
	else      localStorage.removeItem(USER_KEY);
}

/** Returns true when a user is logged in. */
export function isLoggedIn(): boolean {
	return getCachedUser() !== null;
}

// ── Bankroll ─────────────────────────────────────────────────────────────────

/**
 * Reads bankroll.
 * - Logged-in: from localStorage (already synced from server on login/page load).
 * - Guest: from localStorage, defaults to 2000.
 */
export function getBankroll(): number {
	if (!browser) return DEFAULT_BANKROLL;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw === null) return DEFAULT_BANKROLL;
	const val = parseFloat(raw);
	return isNaN(val) ? DEFAULT_BANKROLL : val;
}

/**
 * Writes bankroll locally.
 * If logged in, also persists to MongoDB in the background.
 */
export function setBankroll(amount: number): void {
	if (!browser) return;
	const rounded = Math.round(amount * 100) / 100;
	localStorage.setItem(STORAGE_KEY, String(rounded));

	// Background sync to server for logged-in users
	if (isLoggedIn()) {
		fetch('/api/auth/bankroll', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ bankroll: rounded }),
		}).catch(() => {}); // silent — game must not break if API fails
	}
}

/**
 * Resets bankroll to 1000 CHF (guest default).
 * Registered users do NOT get their welcome bonus again — only the base 1000.
 * Syncs to server for logged-in users.
 */
export function resetBankroll(): void {
	setBankroll(DEFAULT_BANKROLL);
}

/**
 * Called on login/register success — loads bankroll from server and caches user.
 * Returns the loaded bankroll so the UI can update immediately.
 */
export async function loadUserSession(user: CasinoUser, bankroll: number): Promise<void> {
	setCachedUser(user);
	localStorage.setItem(STORAGE_KEY, String(bankroll));
}

/**
 * Called on logout — clears user cache but keeps guest bankroll separate.
 */
export function clearUserSession(): void {
	if (!browser) return;
	setCachedUser(null);
	// Reset to guest default so the next guest session starts fresh
	localStorage.setItem(STORAGE_KEY, String(DEFAULT_BANKROLL));
}

// ── Payout calculations (unchanged) ─────────────────────────────────────────

export type BjHandResult = 'blackjack' | 'win' | 'dealer-bust' | 'push' | 'lose' | 'bust';

export function bjPayout(bet: number, result: BjHandResult): number {
	switch (result) {
		case 'blackjack':   return Math.round(bet * 2.5 * 100) / 100;
		case 'win':
		case 'dealer-bust': return bet * 2;
		case 'push':        return bet;
		case 'lose':
		case 'bust':
		default:            return 0;
	}
}

export type BaccaratSelectedBet = 'Player' | 'Banker' | 'Tie';
export type BaccaratResult      = 'Player wins' | 'Banker wins' | 'Tie';

export function baccaratPayout(
	bet: number,
	selectedBet: BaccaratSelectedBet,
	result: BaccaratResult
): number {
	if (selectedBet === 'Player') {
		if (result === 'Player wins') return bet * 2;
		if (result === 'Tie')         return bet;
		return 0;
	}
	if (selectedBet === 'Banker') {
		if (result === 'Banker wins') return Math.round(bet * 1.95 * 100) / 100;
		if (result === 'Tie')         return bet;
		return 0;
	}
	if (result === 'Tie') return bet * 9;
	return 0;
}