<script lang="ts">
	import { onMount } from 'svelte';
	import { getBankroll, setBankroll, bjPayout, type BjHandResult } from '$lib/bankroll';

	// ─── Types ────────────────────────────────────────────────────────────────
	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
	type Phase = 'setup' | 'player-turn' | 'dealer-turn' | 'result';

	interface Card { rank: Rank; suit: Suit; }

	interface PlayerHand {
		cards: Card[];
		bet: number;
		doubled: boolean;
		done: boolean;
		result: BjHandResult | null;
		payout: number;  // Was in die Bankroll zurückfliesst
	}

	// ─── Deck ─────────────────────────────────────────────────────────────────
	const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
	const SUITS: Suit[] = ['♠','♥','♦','♣'];

	function buildShoe(n = 6): Card[] {
		const s: Card[] = [];
		for (let d = 0; d < n; d++) for (const suit of SUITS) for (const rank of RANKS) s.push({ rank, suit });
		return s;
	}
	function shuffle(cards: Card[]): Card[] {
		const s = [...cards];
		for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
		return s;
	}
	function handScore(cards: Card[]): number {
		let score = cards.reduce((s, c) => {
			if (c.rank === 'A') return s + 11;
			if (['J','Q','K'].includes(c.rank)) return s + 10;
			return s + parseInt(c.rank);
		}, 0);
		let aces = cards.filter(c => c.rank === 'A').length;
		while (score > 21 && aces > 0) { score -= 10; aces--; }
		return score;
	}
	function isSoft(cards: Card[]): boolean {
		const hard = cards.reduce((s, c) => {
			if (c.rank === 'A') return s + 1;
			if (['J','Q','K'].includes(c.rank)) return s + 10;
			return s + parseInt(c.rank);
		}, 0);
		return handScore(cards) !== hard;
	}
	function isSoft17(cards: Card[]): boolean { return handScore(cards) === 17 && isSoft(cards); }
	function isBlackjack(cards: Card[]): boolean { return cards.length === 2 && handScore(cards) === 21; }
	function bjValue(rank: Rank): number {
		if (rank === 'A') return 11;
		if (['J','Q','K','10'].includes(rank)) return 10;
		return parseInt(rank);
	}
	function cardLabel(c: Card): string { return `${c.rank}${c.suit}`; }
	function cardIsRed(c: Card): boolean { return c.suit === '♥' || c.suit === '♦'; }

	// ─── State ────────────────────────────────────────────────────────────────
	let bankroll      = $state(1000);
	let baseBet       = $state<number>(10);
	let betError      = $state('');
	let phase         = $state<Phase>('setup');
	let shoe          = $state<Card[]>([]);
	let dealerCards   = $state<Card[]>([]);
	let holeRevealed  = $state(false);
	let hands         = $state<PlayerHand[]>([]);
	let activeIdx     = $state(0);
	let statusMsg     = $state('');
	let saved         = $state(false);
	let bankrollBefore = 0; // nicht reaktiv — einmalig beim Deal gesetzt

	// Abgeleiteter Netto-Wert für das Result-Template — kein @const nötig
	let displayNetResult = $derived(Math.round((bankroll - bankrollBefore) * 100) / 100);

	onMount(() => { bankroll = getBankroll(); });

	function draw(): Card {
		if (shoe.length < 15) shoe = shuffle(buildShoe(6));
		const c = shoe[0]; shoe = shoe.slice(1); return c;
	}

	// ─── Deal ─────────────────────────────────────────────────────────────────
	function deal() {
		betError = '';
		if (!baseBet || baseBet <= 0) { betError = 'Bitte gültigen Einsatz eingeben.'; return; }
		if (baseBet > bankroll) { betError = 'Nicht genügend Guthaben.'; return; }

		// Einsatz sofort abziehen
		bankrollBefore = bankroll;
		bankroll -= baseBet;
		setBankroll(bankroll);

		shoe          = shuffle(buildShoe(6));
		holeRevealed  = false;
		saved         = false;
		statusMsg     = '';

		const p1 = draw(), p2 = draw(), d1 = draw(), d2 = draw();
		dealerCards = [d1, d2];
		hands = [{
			cards: [p1, p2], bet: baseBet, doubled: false,
			done: false, result: null, payout: 0
		}];
		activeIdx = 0;
		phase = 'player-turn';

		// Dealer Peek
		const uv = bjValue(d1.rank);
		if (uv === 11 || uv === 10) {
			if (isBlackjack(dealerCards)) {
				holeRevealed = true;
				statusMsg = 'Dealer has Blackjack!';
				const r = isBlackjack(hands[0].cards) ? 'push' : 'lose';
				const p = bjPayout(hands[0].bet, r);
				hands = [{ ...hands[0], result: r, done: true, payout: p }];
				bankroll += p;
				setBankroll(bankroll);
				phase = 'result';
				saveRound();
				return;
			} else {
				statusMsg = 'Dealer checked — no Blackjack.';
			}
		}

		// Player BJ
		if (isBlackjack(hands[0].cards)) {
			const p = bjPayout(hands[0].bet, 'blackjack');
			hands = [{ ...hands[0], result: 'blackjack', done: true, payout: p }];
			statusMsg = 'Blackjack! 🎉';
			startDealerTurn();
		}
	}

	// ─── Actions ──────────────────────────────────────────────────────────────
	function ch(): PlayerHand { return hands[activeIdx]; }
	function canHit():    boolean { return phase === 'player-turn' && !ch().done; }
	function canStand():  boolean { return phase === 'player-turn' && !ch().done; }
	function canDouble(): boolean {
		return phase === 'player-turn' && !ch().done
			&& ch().cards.length === 2 && ch().bet <= bankroll;
	}
	function canSplit(): boolean {
		if (phase !== 'player-turn' || ch().done) return false;
		const h = ch();
		return h.cards.length === 2
			&& bjValue(h.cards[0].rank) === bjValue(h.cards[1].rank)
			&& baseBet <= bankroll; // braucht einen weiteren Einsatz
	}

	function updateHand(h: PlayerHand) {
		hands = hands.map((old, i) => i === activeIdx ? h : old);
	}

	function hit() {
		if (!canHit()) return;
		const h = { ...ch(), cards: [...ch().cards, draw()] };
		if (handScore(h.cards) > 21) { h.done = true; h.result = 'bust'; statusMsg = 'Bust!'; }
		updateHand(h);
		if (h.done) advanceHand();
	}

	function stand() {
		if (!canStand()) return;
		updateHand({ ...ch(), done: true });
		advanceHand();
	}

	function doubleDown() {
		if (!canDouble()) return;
		// Zusätzlichen Einsatz abziehen
		bankroll -= ch().bet;
		setBankroll(bankroll);
		const h = { ...ch(), bet: ch().bet * 2, doubled: true, cards: [...ch().cards, draw()], done: true };
		if (handScore(h.cards) > 21) { h.result = 'bust'; statusMsg = 'Bust after Double!'; }
		updateHand(h);
		advanceHand();
	}

	function split() {
		if (!canSplit()) return;
		const h = ch();
		// Zweiten Einsatz abziehen
		bankroll -= baseBet;
		setBankroll(bankroll);
		const isAceSplit = h.cards[0].rank === 'A';
		const hand1: PlayerHand = { cards: [h.cards[0], draw()], bet: baseBet, doubled: false, done: isAceSplit, result: null, payout: 0 };
		const hand2: PlayerHand = { cards: [h.cards[1], draw()], bet: baseBet, doubled: false, done: isAceSplit, result: null, payout: 0 };
		hands = [...hands.slice(0, activeIdx), hand1, hand2, ...hands.slice(activeIdx + 1)];
		if (isAceSplit) { statusMsg = 'Aces split — one card each, standing automatically.'; advanceHand(); }
		else { statusMsg = `Playing hand 1 of 2`; }
	}

	function advanceHand() {
		const next = hands.findIndex((h, i) => i > activeIdx && !h.done);
		if (next !== -1) {
			activeIdx = next;
			statusMsg = `Playing hand ${activeIdx + 1} of ${hands.length}`;
		} else {
			if (hands.every(h => h.result === 'bust')) {
				holeRevealed = true; phase = 'result'; saveRound();
			} else {
				startDealerTurn();
			}
		}
	}

	// ─── Dealer Turn ──────────────────────────────────────────────────────────
	function startDealerTurn() {
		holeRevealed = true;
		phase = 'dealer-turn';
		let dCards = [...dealerCards];
		while (true) {
			const s = handScore(dCards);
			if (s > 17) break;
			if (s === 17) { if (isSoft17(dCards)) statusMsg = 'Dealer stands on soft 17.'; break; }
			dCards = [...dCards, draw()];
		}
		dealerCards = dCards;
		evaluateResults();
	}

	function evaluateResults() {
		const dScore = handScore(dealerCards);
		const dBust  = dScore > 21;
		const dBJ    = isBlackjack(dealerCards);

		hands = hands.map(h => {
			if (h.result !== null) {
				// Bereits gesetzt (Bust, BJ) — nur Payout berechnen wenn noch 0
				const p = h.payout > 0 ? h.payout : bjPayout(h.bet, h.result);
				return { ...h, payout: p };
			}
			const pScore = handScore(h.cards);
			const pBJ    = isBlackjack(h.cards);
			let result: BjHandResult;
			if      (dBust)            result = 'dealer-bust';
			else if (pBJ && !dBJ)      result = 'blackjack';
			else if (pBJ && dBJ)       result = 'push';
			else if (pScore > dScore)   result = 'win';
			else if (pScore === dScore) result = 'push';
			else                        result = 'lose';
			const payout = bjPayout(h.bet, result);
			return { ...h, result, payout };
		});

		// Bankroll mit allen Payouts auffüllen
		const totalPayout = hands.reduce((s, h) => s + h.payout, 0);
		bankroll += totalPayout;
		setBankroll(bankroll);

		statusMsg = '';
		phase = 'result';
		saveRound();
	}

	// ─── Save ─────────────────────────────────────────────────────────────────
	async function saveRound() {
		if (saved) return;
		saved = true;

		const totalPayout = hands.reduce((s, h) => s + h.payout, 0);
		const totalBet    = hands.reduce((s, h) => s + h.bet, 0);
		const netResult   = Math.round((bankroll - bankrollBefore) * 100) / 100;

		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'blackjack',
					bet:  baseBet,
					playerHands: hands.map(h => ({
						cards:   h.cards.map(cardLabel),
						score:   handScore(h.cards),
						bet:     h.bet,
						doubled: h.doubled,
						result:  h.result,
						payout:  h.payout,
					})),
					dealerCards:    dealerCards.map(cardLabel),
					dealerScore:    handScore(dealerCards),
					result:         hands[0].result ?? 'lose',
					payout:         Math.round(totalPayout * 100) / 100,
					bankrollBefore: Math.round(bankrollBefore * 100) / 100,
					bankrollAfter:  Math.round(bankroll * 100) / 100,
					netResult,
				})
			});
		} catch (e) {
			console.error('Failed to save:', e);
		}
	}

	function newRound() {
		phase = 'setup'; dealerCards = []; hands = []; activeIdx = 0;
		holeRevealed = false; statusMsg = ''; saved = false; betError = '';
	}

	function resultLabel(r: BjHandResult | null): string {
		switch (r) {
			case 'blackjack':   return '🎉 Blackjack!';
			case 'win':         return '✅ Win';
			case 'dealer-bust': return '✅ Dealer Bust';
			case 'push':        return '🤝 Push';
			case 'lose':        return '❌ Lose';
			case 'bust':        return '💥 Bust';
			default:            return '';
		}
	}
	function resultColor(r: BjHandResult | null): string {
		switch (r) {
			case 'blackjack': case 'win': case 'dealer-bust': return 'text-emerald-400';
			case 'push':      return 'text-amber-400';
			default:          return 'text-red-400';
		}
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-2xl">
		<div class="flex items-center justify-between">
			<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>
			<!-- Bankroll-Anzeige -->
			<div class="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2">
				<span class="text-xs text-slate-400">Guthaben</span>
				<span class="text-lg font-bold {bankroll <= 0 ? 'text-red-400' : bankroll < 100 ? 'text-amber-400' : 'text-emerald-400'}">
					{bankroll.toFixed(2)} CHF
				</span>
			</div>
		</div>

		<h1 class="mt-6 text-5xl font-bold">🃏 Blackjack</h1>
		<p class="mt-3 text-slate-400">6-Deck Shoe · Dealer stands on soft 17 · Peek rule</p>

		{#if phase === 'setup'}
			<div class="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<label class="block text-sm tracking-wide text-slate-400 uppercase">Einsatz (CHF)</label>
				<input
					type="number" min="1" max={bankroll}
					bind:value={baseBet}
					class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xl font-semibold text-white focus:border-emerald-500 focus:outline-none"
				/>
				{#if betError}
					<p class="mt-2 text-sm text-red-400">{betError}</p>
				{/if}
			</div>

			{#if bankroll <= 0}
				<div class="mt-6 rounded-2xl border border-red-800 bg-red-950/40 px-6 py-4 text-center">
					<p class="text-red-400 font-semibold">Kein Guthaben mehr.</p>
					<a href="/" class="mt-2 inline-block text-sm text-slate-400 hover:text-white">← Zur Startseite (Bankroll zurücksetzen)</a>
				</div>
			{:else}
				<button
					onclick={deal}
					disabled={!baseBet || baseBet <= 0}
					class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-5 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
				>
					🃏 Deal
				</button>
			{/if}

		{:else}
			{#if statusMsg}
				<div class="mt-8 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-center">
					<p class="text-sm text-slate-300">{statusMsg}</p>
				</div>
			{:else}
				<div class="mt-8"></div>
			{/if}

			<!-- Dealer -->
			<div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
				<div class="flex items-center justify-between">
					<p class="text-sm tracking-wide text-slate-400 uppercase font-semibold">Dealer</p>
					{#if holeRevealed}
						<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">{handScore(dealerCards)}</span>
					{:else}
						<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold text-slate-500">
							{dealerCards.length > 0 ? handScore([dealerCards[0]]) : '?'} + ?
						</span>
					{/if}
				</div>
				<div class="mt-4 flex flex-wrap gap-3">
					{#each dealerCards as card, i}
						{#if i === 1 && !holeRevealed}
							<div class="relative flex h-24 w-16 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 shadow-lg">
								<span class="text-3xl text-slate-500">🂠</span>
							</div>
						{:else}
							<div class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
								{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}">
								<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
								<span class="text-2xl font-bold">{card.suit}</span>
								<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Player Hands -->
			{#each hands as hand, hi}
				<div class="mt-4 rounded-2xl border p-5 transition
					{hi === activeIdx && phase === 'player-turn' ? 'border-emerald-500 bg-slate-900' : 'border-slate-800 bg-slate-900'}">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<p class="text-sm tracking-wide text-slate-400 uppercase font-semibold">
								{hands.length > 1 ? `Hand ${hi + 1}` : 'Player'}
							</p>
							{#if hi === activeIdx && phase === 'player-turn'}
								<span class="rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">Your turn</span>
							{/if}
							{#if hand.doubled}
								<span class="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-300">Doubled</span>
							{/if}
						</div>
						<div class="flex items-center gap-3">
							<span class="text-sm text-slate-400">{hand.bet} CHF</span>
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">{handScore(hand.cards)}</span>
						</div>
					</div>
					<div class="mt-4 flex flex-wrap gap-3">
						{#each hand.cards as card}
							<div class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
								{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}">
								<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
								<span class="text-2xl font-bold">{card.suit}</span>
								<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
							</div>
						{/each}
					</div>
					{#if hand.result}
						<p class="mt-3 text-lg font-bold {resultColor(hand.result)}">{resultLabel(hand.result)}</p>
					{/if}
				</div>
			{/each}

			<!-- Action Buttons -->
			{#if phase === 'player-turn'}
				<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<button onclick={hit}       disabled={!canHit()}    class="rounded-2xl bg-emerald-600 py-4 text-lg font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Hit</button>
					<button onclick={stand}     disabled={!canStand()}  class="rounded-2xl bg-slate-700 py-4 text-lg font-semibold transition hover:bg-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Stand</button>
					<button onclick={doubleDown} disabled={!canDouble()} class="rounded-2xl bg-amber-600 py-4 text-lg font-semibold transition hover:bg-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Double</button>
					<button onclick={split}     disabled={!canSplit()}  class="rounded-2xl bg-violet-700 py-4 text-lg font-semibold transition hover:bg-violet-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Split</button>
				</div>
				{#if !canDouble() && phase === 'player-turn' && ch().cards.length === 2 && ch().bet > bankroll}
					<p class="mt-2 text-xs text-amber-400">Double nicht verfügbar — nicht genügend Guthaben.</p>
				{/if}
				{#if !canSplit() && phase === 'player-turn' && ch().cards.length === 2 && bjValue(ch().cards[0].rank) === bjValue(ch().cards[1].rank) && baseBet > bankroll}
					<p class="mt-2 text-xs text-amber-400">Split nicht verfügbar — nicht genügend Guthaben.</p>
				{/if}
			{/if}

			<!-- Result -->
			{#if phase === 'result'}
				<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
					<p class="text-sm tracking-wide text-slate-400 uppercase">Ergebnis</p>
					<div class="mt-3 flex flex-col gap-2">
						{#each hands as hand, hi}
							<div class="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-3">
								<span class="text-slate-300">{hands.length > 1 ? `Hand ${hi + 1}` : 'Deine Hand'}</span>
								<div class="flex items-center gap-4">
									<span class="text-sm text-slate-400">{hand.bet} CHF</span>
									{#if hand.payout > 0}
										<span class="text-sm text-emerald-400">+{hand.payout.toFixed(2)} CHF</span>
									{/if}
									<span class="font-bold {resultColor(hand.result)}">{resultLabel(hand.result)}</span>
								</div>
							</div>
						{/each}
					</div>
					<!-- Netto-Ergebnis -->
					<div class="mt-4 flex items-center justify-between border-t border-slate-700 pt-4">
						<span class="text-sm text-slate-400">Netto</span>
						<span class="text-xl font-bold {displayNetResult > 0 ? 'text-emerald-400' : displayNetResult < 0 ? 'text-red-400' : 'text-amber-400'}">
							{displayNetResult > 0 ? '+' : ''}{displayNetResult.toFixed(2)} CHF
						</span>
					</div>
					<div class="mt-2 flex items-center justify-between">
						<span class="text-sm text-slate-400">Neues Guthaben</span>
						<span class="text-lg font-bold text-white">{bankroll.toFixed(2)} CHF</span>
					</div>
					{#if saved}
						<p class="mt-3 text-sm text-slate-500">✓ Runde gespeichert</p>
					{/if}
				</div>
				<button onclick={newRound} class="mt-6 w-full rounded-2xl border border-slate-700 bg-slate-900 px-8 py-4 text-xl font-semibold transition hover:bg-slate-800 active:scale-95">
					↩ Neue Runde
				</button>
			{/if}
		{/if}
	</div>
</main>