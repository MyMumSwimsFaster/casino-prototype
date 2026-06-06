// src/lib/guestHistory.ts
// Client-only guest history using sessionStorage.
// sessionStorage is scoped to the browser tab/session:
//   - new tab/incognito = empty
//   - refresh = preserved
//   - close tab = cleared

const SESSION_KEY = 'casino_guest_history';

export interface GuestRound {
	game:           string;
	bet?:           number;
	result?:        string;
	netResult?:     number;
	payout?:        number;
	bankrollBefore?: number;
	bankrollAfter?:  number;
	playerHands?:   unknown;
	dealerCards?:   string[];
	dealerScore?:   number;
	selectedBet?:   string;
	playerCards?:   string[];
	bankerCards?:   string[];
	playerScore?:   number;
	bankerScore?:   number;
	playerWon?:     boolean;
	naturalHand?:   boolean;
	insuranceOffered?: boolean; insuranceTaken?: boolean;
	insuranceBet?:  number;    insuranceResult?: string | null;
	insurancePayout?: number;
	perfectPairsBet?: number;  perfectPairsResult?: string | null;
	perfectPairsPayout?: number;
	dealerBustBet?: number;    dealerBustResult?: string | null;
	dealerBustPayout?: number;
	twentyOneThreeBet?: number; twentyOneThreeResult?: string | null;
	twentyOneThreePayout?: number; twentyOneThreeCards?: string[];
	createdAt:      string;  // ISO string
}

export function guestHistoryLoad(): GuestRound[] {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(SESSION_KEY);
		return raw ? JSON.parse(raw) : [];
	} catch { return []; }
}

export function guestHistorySave(round: Omit<GuestRound, 'createdAt'>): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		const history = guestHistoryLoad();
		history.unshift({ ...round, createdAt: new Date().toISOString() });
		// Keep last 200 rounds to avoid unbounded growth
		sessionStorage.setItem(SESSION_KEY, JSON.stringify(history.slice(0, 200)));
	} catch {}
}

export function guestHistoryClear(): void {
	if (typeof sessionStorage === 'undefined') return;
	try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}