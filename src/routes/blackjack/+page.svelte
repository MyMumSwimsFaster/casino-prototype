<script lang="ts">
	// ─── Types ────────────────────────────────────────────────────────────────

	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

	// Phasen der Runde
	type Phase = 'setup' | 'player-turn' | 'dealer-turn' | 'result';

	// Ergebnis pro Hand
	type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'dealer-bust';

	interface Card {
		rank: Rank;
		suit: Suit;
	}

	interface PlayerHand {
		cards: Card[];
		bet: number;           // kann durch Double verdoppelt werden
		doubled: boolean;
		done: boolean;         // Stand oder Bust oder Double
		result: HandResult | null;
	}

	// ─── Deck helpers ─────────────────────────────────────────────────────────

	const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
	const SUITS: Suit[] = ['♠','♥','♦','♣'];

	function buildShoe(numDecks = 6): Card[] {
		const shoe: Card[] = [];
		for (let d = 0; d < numDecks; d++)
			for (const suit of SUITS)
				for (const rank of RANKS)
					shoe.push({ rank, suit });
		return shoe;
	}

	function shuffle(cards: Card[]): Card[] {
		const s = [...cards];
		for (let i = s.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[s[i], s[j]] = [s[j], s[i]];
		}
		return s;
	}

	// Handwert: Asse werden von 11 auf 1 reduziert, solange Bust
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

	// Soft-Hand: mindestens ein Ass zaehlt als 11
	function isSoft(cards: Card[]): boolean {
		const hardScore = cards.reduce((s, c) => {
			if (c.rank === 'A') return s + 1;
			if (['J','Q','K'].includes(c.rank)) return s + 10;
			return s + parseInt(c.rank);
		}, 0);
		return handScore(cards) !== hardScore;
	}

	// Soft 17
	function isSoft17(cards: Card[]): boolean {
		return handScore(cards) === 17 && isSoft(cards);
	}

	// Blackjack: genau 2 Karten und Score 21
	function isBlackjack(cards: Card[]): boolean {
		return cards.length === 2 && handScore(cards) === 21;
	}

	// BJ-Wert fuer Split-Vergleich und Peek
	function bjValue(rank: Rank): number {
		if (rank === 'A') return 11;
		if (['J','Q','K','10'].includes(rank)) return 10;
		return parseInt(rank);
	}

	function cardLabel(c: Card): string { return `${c.rank}${c.suit}`; }

	function isRed(c: Card): boolean {
		return c.suit === 'hearts' || c.suit === '♥' || c.suit === '♦';
	}

	// ─── Component state ─────────────────────────────────────────────────────

	let baseBet        = $state<number>(10);
	let phase          = $state<Phase>('setup');
	let shoe           = $state<Card[]>([]);
	let dealerCards    = $state<Card[]>([]);
	let holeRevealed   = $state(false);
	let hands          = $state<PlayerHand[]>([]);
	let activeIdx      = $state(0);
	let statusMsg      = $state('');
	let saved          = $state(false);

	// ─── Shoe / Draw ─────────────────────────────────────────────────────────

	function initShoe() {
		shoe = shuffle(buildShoe(6));
	}

	function draw(): Card {
		if (shoe.length < 15) shoe = shuffle(buildShoe(6));
		const card = shoe[0];
		shoe = shoe.slice(1);
		return card;
	}

	// ─── Deal ─────────────────────────────────────────────────────────────────

	function deal() {
		if (!baseBet || baseBet <= 0) return;
		initShoe();
		holeRevealed = false;
		saved        = false;
		statusMsg    = '';

		const p1 = draw(), p2 = draw();
		const d1 = draw(), d2 = draw();

		dealerCards = [d1, d2];
		hands = [{
			cards:   [p1, p2],
			bet:     baseBet,
			doubled: false,
			done:    false,
			result:  null
		}];
		activeIdx = 0;
		phase = 'player-turn';

		// Dealer Peek
		const upcardVal = bjValue(d1.rank);
		if (upcardVal === 11 || upcardVal === 10) {
			if (isBlackjack(dealerCards)) {
				holeRevealed = true;
				statusMsg    = 'Dealer has Blackjack!';
				const playerAlsoBJ = isBlackjack(hands[0].cards);
				hands = [{
					...hands[0],
					result: playerAlsoBJ ? 'push' : 'lose',
					done: true
				}];
				phase = 'result';
				saveRound();
				return;
			} else {
				statusMsg = 'Dealer checked — no Blackjack.';
			}
		}

		// Player BJ
		if (isBlackjack(hands[0].cards)) {
			hands = [{ ...hands[0], result: 'blackjack', done: true }];
			statusMsg = 'Blackjack! 🎉';
			startDealerTurn();
		}
	}

	// ─── Player Actions ───────────────────────────────────────────────────────

	function currentHand(): PlayerHand { return hands[activeIdx]; }

	function canHit():    boolean { return phase === 'player-turn' && !currentHand().done; }
	function canStand():  boolean { return phase === 'player-turn' && !currentHand().done; }
	function canDouble(): boolean {
		return phase === 'player-turn' && !currentHand().done && currentHand().cards.length === 2;
	}
	function canSplit(): boolean {
		if (phase !== 'player-turn' || currentHand().done) return false;
		const h = currentHand();
		return h.cards.length === 2 && bjValue(h.cards[0].rank) === bjValue(h.cards[1].rank);
	}

	function hit() {
		if (!canHit()) return;
		const h = { ...currentHand() };
		h.cards = [...h.cards, draw()];
		if (handScore(h.cards) > 21) {
			h.done   = true;
			h.result = 'bust';
			statusMsg = 'Bust!';
		}
		updateHand(h);
		if (h.done) advanceHand();
	}

	function stand() {
		if (!canStand()) return;
		const h = { ...currentHand(), done: true };
		updateHand(h);
		advanceHand();
	}

	function doubleDown() {
		if (!canDouble()) return;
		const h = { ...currentHand() };
		h.bet    *= 2;
		h.doubled = true;
		h.cards   = [...h.cards, draw()];
		h.done    = true;
		if (handScore(h.cards) > 21) {
			h.result  = 'bust';
			statusMsg = 'Bust after Double!';
		}
		updateHand(h);
		advanceHand();
	}

	function split() {
		if (!canSplit()) return;
		const h = currentHand();
		const [c1, c2] = h.cards;
		const isAceSplit = c1.rank === 'A';

		const hand1: PlayerHand = {
			cards:   [c1, draw()],
			bet:     baseBet,
			doubled: false,
			done:    isAceSplit,
			result:  null
		};
		const hand2: PlayerHand = {
			cards:   [c2, draw()],
			bet:     baseBet,
			doubled: false,
			done:    isAceSplit,
			result:  null
		};

		hands = [
			...hands.slice(0, activeIdx),
			hand1,
			hand2,
			...hands.slice(activeIdx + 1)
		];

		if (isAceSplit) {
			// Ace split: vereinfacht — je eine Karte, automatisch Stand
			// Kein Re-Split, kein weiterer Hit. Stabil und eindeutig.
			statusMsg = 'Aces split — one card each, standing automatically.';
			advanceHand();
		} else {
			statusMsg = `Playing hand 1 of 2`;
		}
	}

	function updateHand(h: PlayerHand) {
		hands = hands.map((old, i) => i === activeIdx ? h : old);
	}

	function advanceHand() {
		const next = hands.findIndex((h, i) => i > activeIdx && !h.done);
		if (next !== -1) {
			activeIdx = next;
			statusMsg = `Playing hand ${activeIdx + 1} of ${hands.length}`;
		} else {
			const allBust = hands.every(h => h.result === 'bust');
			if (allBust) {
				holeRevealed = true;
				phase = 'result';
				saveRound();
			} else {
				startDealerTurn();
			}
		}
	}

	// ─── Dealer Turn ─────────────────────────────────────────────────────────

	function startDealerTurn() {
		holeRevealed = true;
		phase = 'dealer-turn';

		let dCards = [...dealerCards];
		while (true) {
			const score = handScore(dCards);
			if (score > 17) break;
			if (score === 17) {
				if (isSoft17(dCards)) {
					// Soft 17: Dealer stands
					statusMsg = 'Dealer stands on soft 17.';
				}
				break;
			}
			dCards = [...dCards, draw()];
		}
		dealerCards = dCards;
		evaluateResults();
	}

	// ─── Results ─────────────────────────────────────────────────────────────

	function evaluateResults() {
		const dScore = handScore(dealerCards);
		const dBust  = dScore > 21;
		const dBJ    = isBlackjack(dealerCards);

		hands = hands.map(h => {
			if (h.result !== null) return h; // bereits gesetzt (Bust etc.)
			const pScore = handScore(h.cards);
			const pBJ    = isBlackjack(h.cards);

			let result: HandResult;
			if      (dBust)              result = 'dealer-bust';
			else if (pBJ && !dBJ)        result = 'blackjack';
			else if (pBJ && dBJ)         result = 'push';
			else if (pScore > dScore)     result = 'win';
			else if (pScore === dScore)   result = 'push';
			else                          result = 'lose';

			return { ...h, result };
		});

		phase = 'result';
		saveRound();
	}

	// ─── Save ─────────────────────────────────────────────────────────────────

	async function saveRound() {
		if (saved) return;
		saved = true;

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
						result:  h.result
					})),
					dealerCards: dealerCards.map(cardLabel),
					dealerScore: handScore(dealerCards),
					result: hands[0].result ?? 'lose'
				})
			});
		} catch (e) {
			console.error('Failed to save:', e);
		}
	}

	// ─── New Round ────────────────────────────────────────────────────────────

	function newRound() {
		phase        = 'setup';
		dealerCards  = [];
		hands        = [];
		activeIdx    = 0;
		holeRevealed = false;
		statusMsg    = '';
		saved        = false;
	}

	// ─── UI helpers ───────────────────────────────────────────────────────────

	function resultLabel(r: HandResult | null): string {
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

	function resultColor(r: HandResult | null): string {
		switch (r) {
			case 'blackjack':
			case 'win':
			case 'dealer-bust': return 'text-emerald-400';
			case 'push':        return 'text-amber-400';
			default:            return 'text-red-400';
		}
	}

	function cardIsRed(c: Card): boolean {
		return c.suit === '♥' || c.suit === '♦';
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-2xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<h1 class="mt-6 text-5xl font-bold">🃏 Blackjack</h1>
		<p class="mt-3 text-slate-400">6-Deck Shoe · Dealer stands on soft 17 · Peek rule</p>

		<!-- ══ SETUP ══════════════════════════════════════════════════════════ -->
		{#if phase === 'setup'}
			<div class="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<label class="block text-sm tracking-wide text-slate-400 uppercase">Einsatz (CHF)</label>
				<input
					type="number"
					min="1"
					bind:value={baseBet}
					class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xl font-semibold text-white focus:border-emerald-500 focus:outline-none"
				/>
			</div>

			<button
				onclick={deal}
				disabled={!baseBet || baseBet <= 0}
				class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-5 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				🃏 Deal
			</button>

		<!-- ══ GAME ═══════════════════════════════════════════════════════════ -->
		{:else}

			<!-- Status banner -->
			{#if statusMsg}
				<div class="mt-8 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-center">
					<p class="text-sm text-slate-300">{statusMsg}</p>
				</div>
			{:else}
				<div class="mt-8"></div>
			{/if}

			<!-- ── Dealer ──────────────────────────────────────────────────── -->
			<div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
				<div class="flex items-center justify-between">
					<p class="text-sm tracking-wide text-slate-400 uppercase font-semibold">Dealer</p>
					{#if holeRevealed}
						<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">
							{handScore(dealerCards)}
						</span>
					{:else}
						<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold text-slate-500">
							{dealerCards.length > 0 ? handScore([dealerCards[0]]) : '?'} + ?
						</span>
					{/if}
				</div>

				<div class="mt-4 flex flex-wrap gap-3">
					{#each dealerCards as card, i}
						{#if i === 1 && !holeRevealed}
							<!-- Hole card verdeckt -->
							<div class="relative flex h-24 w-16 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 shadow-lg">
								<span class="text-3xl text-slate-500">🂠</span>
							</div>
						{:else}
							<div
								class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
								{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}"
							>
								<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
								<span class="text-2xl font-bold">{card.suit}</span>
								<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- ── Player Hands ────────────────────────────────────────────── -->
			{#each hands as hand, hi}
				<div class="mt-4 rounded-2xl border p-5 transition
					{hi === activeIdx && phase === 'player-turn'
						? 'border-emerald-500 bg-slate-900'
						: 'border-slate-800 bg-slate-900'}"
				>
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
							<div
								class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
								{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}"
							>
								<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
								<span class="text-2xl font-bold">{card.suit}</span>
								<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
							</div>
						{/each}
					</div>

					{#if hand.result}
						<p class="mt-3 text-lg font-bold {resultColor(hand.result)}">
							{resultLabel(hand.result)}
						</p>
					{/if}
				</div>
			{/each}

			<!-- ── Player Action Buttons ────────────────────────────────────── -->
			{#if phase === 'player-turn'}
				<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<button
						onclick={hit}
						disabled={!canHit()}
						class="rounded-2xl bg-emerald-600 py-4 text-lg font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Hit
					</button>
					<button
						onclick={stand}
						disabled={!canStand()}
						class="rounded-2xl bg-slate-700 py-4 text-lg font-semibold transition hover:bg-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Stand
					</button>
					<button
						onclick={doubleDown}
						disabled={!canDouble()}
						class="rounded-2xl bg-amber-600 py-4 text-lg font-semibold transition hover:bg-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Double
					</button>
					<button
						onclick={split}
						disabled={!canSplit()}
						class="rounded-2xl bg-violet-700 py-4 text-lg font-semibold transition hover:bg-violet-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Split
					</button>
				</div>
			{/if}

			<!-- ── Result Summary ──────────────────────────────────────────── -->
			{#if phase === 'result'}
				<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
					<p class="text-sm tracking-wide text-slate-400 uppercase">Ergebnis</p>
					<div class="mt-3 flex flex-col gap-2">
						{#each hands as hand, hi}
							<div class="flex items-center justify-between rounded-xl bg-slate-800/50 px-4 py-3">
								<span class="text-slate-300">{hands.length > 1 ? `Hand ${hi + 1}` : 'Deine Hand'}</span>
								<div class="flex items-center gap-4">
									<span class="text-sm text-slate-400">{hand.bet} CHF</span>
									<span class="font-bold {resultColor(hand.result)}">{resultLabel(hand.result)}</span>
								</div>
							</div>
						{/each}
					</div>
					{#if saved}
						<p class="mt-4 text-sm text-slate-500">✓ Runde gespeichert</p>
					{/if}
				</div>

				<button
					onclick={newRound}
					class="mt-6 w-full rounded-2xl border border-slate-700 bg-slate-900 px-8 py-4 text-xl font-semibold transition hover:bg-slate-800 active:scale-95"
				>
					↩ Neue Runde
				</button>
			{/if}

		{/if}
	</div>
</main>