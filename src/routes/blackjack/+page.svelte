<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { getBankroll, setBankroll, bjPayout, type BjHandResult } from '$lib/bankroll';
	import { recordRoundDirect, type RoundOutcome } from '$lib/stats';
	import { sfx, getMuted, toggleMuted as _toggleMuted } from '$lib/sounds';
	import GameOver from '$lib/components/GameOver.svelte';

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
		payout: number;
		// Animationsindex: ab welchem globalen Index wurden die Karten dieser Hand hinzugefügt
		cardDealIndexes: number[];
	}

	// ─── Chips ────────────────────────────────────────────────────────────────
	const CHIPS = [
		{ value: 1,   label: '1',   bg: 'bg-slate-100',   border: 'border-slate-300', text: 'text-slate-900' },
		{ value: 5,   label: '5',   bg: 'bg-red-600',     border: 'border-red-400',   text: 'text-white'     },
		{ value: 25,  label: '25',  bg: 'bg-emerald-600', border: 'border-emerald-400',text: 'text-white'    },
		{ value: 100, label: '100', bg: 'bg-slate-900',   border: 'border-slate-400', text: 'text-white'     },
		{ value: 500, label: '500', bg: 'bg-violet-700',  border: 'border-yellow-400',text: 'text-yellow-300'},
	] as const;

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
	let baseBet       = $state(0);
	let betError      = $state('');
	let phase         = $state<Phase>('setup');
	// gameOver reaktiv — feuert sofort wenn bankroll <= 0 nach einer Runde
	let gameOver      = $derived(bankroll <= 0 && phase === 'result');
	let shoe          = $state<Card[]>([]);
	let dealerCards   = $state<Card[]>([]);
	let dealerDealIndexes = $state<number[]>([]); // Animationsindizes für Dealer-Karten
	let holeRevealed  = $state(false);
	let hands         = $state<PlayerHand[]>([]);
	let activeIdx     = $state(0);
	let statusMsg     = $state('');
	let saved         = $state(false);
	let bankrollBefore = 0;
	let globalCardIdx = 0; // Zählt jede ausgeteilte Karte für Delay-Berechnung

	let displayNetResult = $derived(Math.round((bankroll - bankrollBefore) * 100) / 100);

	let muted = $state(false);
	function toggleMute() { muted = _toggleMuted(); }

	onMount(() => {
		bankroll = getBankroll();
		muted = getMuted();
	});



	// ─── Chip helpers ─────────────────────────────────────────────────────────
	function addChip(value: number) {
		if (baseBet + value > bankroll) return;
		betError = '';
		baseBet += value;
		sfx.chipClick();
	}
	function clearBet() { baseBet = 0; betError = ''; }

	function draw(): Card {
		if (shoe.length < 15) shoe = shuffle(buildShoe(6));
		const c = shoe[0]; shoe = shoe.slice(1); return c;
	}

	// ─── Deal ─────────────────────────────────────────────────────────────────
	function deal() {
		betError = '';
		if (baseBet <= 0)       { betError = 'Bitte zuerst Einsatz wählen.'; return; }
		if (baseBet > bankroll) { betError = 'Nicht genügend Guthaben.'; return; }

		bankrollBefore = bankroll;
		bankroll -= baseBet;
		setBankroll(bankroll);

		shoe          = shuffle(buildShoe(6));
		holeRevealed  = false;
		saved         = false;
		statusMsg     = '';
		globalCardIdx = 0;

		const p1 = draw(), p2 = draw(), d1 = draw(), d2 = draw();
		// Casino-Reihenfolge: P1, D1, P2, D2
		dealerCards        = [d1, d2];
		dealerDealIndexes  = [1, 3]; // D1 = idx 1, D2 (hole) = idx 3
		hands = [{
			cards: [p1, p2], bet: baseBet, doubled: false,
			done: false, result: null, payout: 0,
			cardDealIndexes: [0, 2], // P1 = idx 0, P2 = idx 2
		}];
		globalCardIdx = 4;
		activeIdx = 0;
		phase = 'player-turn';
		// Gestaffelte Kartengeräusche für den initialen Deal
		[0, 140, 280, 420].forEach(delay => setTimeout(() => sfx.cardDeal(), delay));

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
				setTimeout(() => { const r = hands[0].result; if (r === 'push') sfx.win(); else sfx.lose(); }, 400);
				return;
			} else {
				statusMsg = 'Dealer checked — no Blackjack.';
			}
		}

		if (isBlackjack(hands[0].cards)) {
			const p = bjPayout(hands[0].bet, 'blackjack');
			hands = [{ ...hands[0], result: 'blackjack', done: true, payout: p }];
			statusMsg = 'Blackjack! 🎉';
			sfx.blackjack();
			startDealerTurn();
		}
	}

	// ─── Actions ──────────────────────────────────────────────────────────────
	function ch(): PlayerHand { return hands[activeIdx]; }
	function canHit():    boolean { return phase === 'player-turn' && !ch().done; }
	function canStand():  boolean { return phase === 'player-turn' && !ch().done; }
	function canDouble(): boolean {
		return phase === 'player-turn' && !ch().done && ch().cards.length === 2 && ch().bet <= bankroll;
	}
	function canSplit(): boolean {
		if (phase !== 'player-turn' || ch().done) return false;
		const h = ch();
		return h.cards.length === 2
			&& bjValue(h.cards[0].rank) === bjValue(h.cards[1].rank)
			&& baseBet <= bankroll;
	}

	function updateHand(h: PlayerHand) {
		hands = hands.map((old, i) => i === activeIdx ? h : old);
	}

	function hit() {
		if (!canHit()) return;
		sfx.cardDeal();
		const newCard = draw();
		const newIdx  = globalCardIdx++;
		const h = {
			...ch(),
			cards: [...ch().cards, newCard],
			cardDealIndexes: [...ch().cardDealIndexes, newIdx],
		};
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
		bankroll -= ch().bet;
		setBankroll(bankroll);
		const newCard = draw();
		const newIdx  = globalCardIdx++;
		const h = {
			...ch(),
			bet: ch().bet * 2,
			doubled: true,
			cards: [...ch().cards, newCard],
			cardDealIndexes: [...ch().cardDealIndexes, newIdx],
			done: true,
		};
		if (handScore(h.cards) > 21) { h.result = 'bust'; statusMsg = 'Bust after Double!'; }
		updateHand(h);
		advanceHand();
	}

	function split() {
		if (!canSplit()) return;
		const h = ch();
		bankroll -= baseBet;
		setBankroll(bankroll);
		const isAceSplit = h.cards[0].rank === 'A';
		const c1 = draw(), c2 = draw();
		const i1 = globalCardIdx++, i2 = globalCardIdx++;
		const hand1: PlayerHand = {
			cards: [h.cards[0], c1], bet: baseBet, doubled: false, done: isAceSplit, result: null, payout: 0,
			cardDealIndexes: [h.cardDealIndexes[0], i1],
		};
		const hand2: PlayerHand = {
			cards: [h.cards[1], c2], bet: baseBet, doubled: false, done: isAceSplit, result: null, payout: 0,
			cardDealIndexes: [h.cardDealIndexes[1], i2],
		};
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
		let dIndexes = [...dealerDealIndexes];
		while (true) {
			const s = handScore(dCards);
			if (s > 17) break;
			if (s === 17) { if (isSoft17(dCards)) statusMsg = 'Dealer stands on soft 17.'; break; }
			dCards = [...dCards, draw()];
			dIndexes = [...dIndexes, globalCardIdx++];
		}
		dealerCards = dCards;
		dealerDealIndexes = dIndexes;
		evaluateResults();
	}

	function evaluateResults() {
		const dScore = handScore(dealerCards);
		const dBust  = dScore > 21;
		const dBJ    = isBlackjack(dealerCards);

		hands = hands.map(h => {
			if (h.result !== null) {
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

		const totalPayout = hands.reduce((s, h) => s + h.payout, 0);
		bankroll += totalPayout;
		setBankroll(bankroll);
		statusMsg = '';
		phase = 'result';
		saveRound();
		// Sound basierend auf Gesamtergebnis der Runde
		const hasBJ  = hands.some(h => h.result === 'blackjack');
		const hasWin = hands.some(h => h.result === 'win' || h.result === 'dealer-bust');
		const allLost = hands.every(h => h.result === 'lose' || h.result === 'bust');
		if (hasBJ)       setTimeout(() => sfx.blackjack(), 200);
		else if (hasWin) setTimeout(() => sfx.win(), 200);
		else if (allLost) setTimeout(() => sfx.lose(), 200);
	}

	// ─── Save ─────────────────────────────────────────────────────────────────
	async function saveRound() {
		if (saved) return;
		saved = true;
		const totalPayout = hands.reduce((s, h) => s + h.payout, 0);
		const netResult   = Math.round((bankroll - bankrollBefore) * 100) / 100;
		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'blackjack', bet: baseBet,
					playerHands: hands.map(h => ({
						cards: h.cards.map(cardLabel), score: handScore(h.cards),
						bet: h.bet, doubled: h.doubled, result: h.result, payout: h.payout,
					})),
					dealerCards: dealerCards.map(cardLabel), dealerScore: handScore(dealerCards),
					result: hands[0].result ?? 'lose',
					payout: Math.round(totalPayout * 100) / 100,
					bankrollBefore: Math.round(bankrollBefore * 100) / 100,
					bankrollAfter:  Math.round(bankroll * 100) / 100,
					netResult,
				})
			});
		} catch (e) { console.error('Failed to save:', e); }
	}

	function handleGameOverReset() {
		// gameOver wird automatisch false wenn bankroll > 0 (via $derived)
		bankroll = 1000;
		baseBet  = 0;
		phase    = 'setup';
	}

	function newRound() {
		phase = 'setup'; dealerCards = []; dealerDealIndexes = []; hands = []; activeIdx = 0;
		holeRevealed = false; statusMsg = ''; saved = false;
		betError = ''; baseBet = 0; globalCardIdx = 0;
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

	// Delay in ms basierend auf dem globalen Deal-Index
	function dealDelay(idx: number): number { return idx * 140; }
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-2xl">

		<!-- Header -->
		<div class="flex items-center justify-between">
			<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>
			<div class="flex items-center gap-2">
				<!-- Mute Toggle -->
				<button
					onclick={toggleMute}
					class="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base transition hover:bg-slate-800"
					title={muted ? 'Sound an' : 'Sound aus'}
					aria-label={muted ? 'Sound einschalten' : 'Sound ausschalten'}
				>
					{muted ? '🔇' : '🔊'}
				</button>
				<div class="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2">
					<span class="text-xs text-slate-400">Guthaben</span>
					<span class="text-lg font-bold {bankroll <= 0 ? 'text-red-400' : bankroll < 100 ? 'text-amber-400' : 'text-emerald-400'}">
						{bankroll.toFixed(2)} CHF
					</span>
				</div>
			</div>
		</div>

		<h1 class="mt-6 text-5xl font-bold">🃏 Blackjack</h1>
		<p class="mt-3 text-slate-400">6-Deck Shoe · Dealer stands on soft 17 · Peek rule</p>

		<!-- ══ SETUP ══════════════════════════════════════════════════════════ -->
		{#if phase === 'setup'}

				<!-- Einsatz-Anzeige -->
				<div class="mt-10 flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5">
					<div>
						<p class="text-xs tracking-widest text-slate-500 uppercase">Einsatz</p>
						<p class="mt-1 text-4xl font-bold {baseBet > 0 ? 'text-white' : 'text-slate-600'}">
							{baseBet > 0 ? baseBet.toFixed(2) : '0.00'} <span class="text-xl font-normal text-slate-400">CHF</span>
						</p>
					</div>
					{#if baseBet > 0}
						<button onclick={clearBet}
							class="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-400 transition hover:border-red-600 hover:text-red-400 active:scale-95">
							✕ Clear Bet
						</button>
					{/if}
				</div>
				{#if betError}<p class="mt-2 text-sm text-red-400">{betError}</p>{/if}

				<!-- Chips -->
				<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<p class="mb-4 text-xs tracking-widest text-slate-500 uppercase">Chips wählen</p>
					<div class="flex flex-wrap justify-center gap-4">
						{#each CHIPS as chip}
							{@const disabled = baseBet + chip.value > bankroll}
							<button onclick={() => addChip(chip.value)} {disabled}
								class="group relative flex h-16 w-16 flex-col items-center justify-center rounded-full border-4 font-bold shadow-lg
									transition duration-150 select-none
									{chip.bg} {chip.border} {chip.text}
									{disabled ? 'cursor-not-allowed opacity-30' : 'hover:scale-110 hover:shadow-xl active:scale-95 cursor-pointer'}">
								<span class="pointer-events-none absolute inset-2 rounded-full border-2 border-white/20"></span>
								<span class="relative z-10 text-sm font-extrabold leading-none">{chip.label}</span>
								<span class="relative z-10 text-[9px] font-semibold leading-none opacity-70">CHF</span>
							</button>
						{/each}
					</div>
				</div>

				<button onclick={deal} disabled={baseBet <= 0}
					class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-5 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
					🃏 Deal
				</button>

		<!-- ══ GAME ═══════════════════════════════════════════════════════════ -->
		{:else}
			{#if statusMsg}
				<div class="mt-8 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-center"
					transition:fade={{ duration: 200 }}>
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
						<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold"
							transition:fade={{ duration: 300 }}>
							{handScore(dealerCards)}
						</span>
					{:else}
						<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold text-slate-500">
							{dealerCards.length > 0 ? handScore([dealerCards[0]]) : '?'} + ?
						</span>
					{/if}
				</div>

				<div class="mt-4 flex flex-wrap gap-3">
					{#each dealerCards as card, i (i)}
						{@const dealIdx = dealerDealIndexes[i] ?? i}
						{@const isHole  = i === 1 && !holeRevealed}
						<div
							style="animation-delay: {dealDelay(dealIdx)}ms"
							class="card-enter"
						>
							{#if isHole}
								<!-- Hole Card — verdeckt -->
								<div class="relative flex h-24 w-16 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 shadow-lg">
									<div class="absolute inset-1 rounded-lg bg-slate-700/50 card-back-pattern"></div>
									<span class="relative z-10 text-3xl text-slate-500">🂠</span>
								</div>
							{:else if i === 1 && holeRevealed}
								<!-- Hole Card wird aufgedeckt — Flip-Animation -->
								<div class="card-flip">
									<div class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
										{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}">
										<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
										<span class="text-2xl font-bold">{card.suit}</span>
										<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
									</div>
								</div>
							{:else}
								<div class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
									{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}">
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
									<span class="text-2xl font-bold">{card.suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- ── Player Hands ────────────────────────────────────────────── -->
			{#each hands as hand, hi}
				{@const isBust = hand.result === 'bust'}
				{@const isBJ   = hand.result === 'blackjack'}
				<div class="mt-4 rounded-2xl border p-5 transition-all duration-300
					{hi === activeIdx && phase === 'player-turn' ? 'border-emerald-500 bg-slate-900' : 'border-slate-800 bg-slate-900'}
					{isBust ? 'bust-shake' : ''}
					{isBJ ? 'bj-glow' : ''}">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<p class="text-sm tracking-wide text-slate-400 uppercase font-semibold">
								{hands.length > 1 ? `Hand ${hi + 1}` : 'Player'}
							</p>
							{#if hi === activeIdx && phase === 'player-turn'}
								<span class="rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300"
									transition:fade={{ duration: 200 }}>Your turn</span>
							{/if}
							{#if hand.doubled}
								<span class="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-300"
									transition:fade={{ duration: 200 }}>Doubled</span>
							{/if}
						</div>
						<div class="flex items-center gap-3">
							<span class="text-sm text-slate-400">{hand.bet} CHF</span>
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">{handScore(hand.cards)}</span>
						</div>
					</div>

					<div class="mt-4 flex flex-wrap gap-3">
						{#each hand.cards as card, ci (ci)}
							{@const dealIdx = hand.cardDealIndexes[ci] ?? ci}
							<div style="animation-delay: {dealDelay(dealIdx)}ms" class="card-enter">
								<div class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg
									{cardIsRed(card) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}
									{isBust ? 'opacity-70' : ''}">
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{card.rank}</span>
									<span class="text-2xl font-bold">{card.suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{card.rank}</span>
								</div>
							</div>
						{/each}
					</div>

					{#if hand.result}
						<p class="mt-3 text-lg font-bold {resultColor(hand.result)}"
							transition:fly={{ y: 8, duration: 250 }}>
							{resultLabel(hand.result)}
						</p>
					{/if}
				</div>
			{/each}

			<!-- Action Buttons -->
			{#if phase === 'player-turn'}
				<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
					transition:fly={{ y: 16, duration: 250 }}>
					<button onclick={hit}        disabled={!canHit()}    class="rounded-2xl bg-emerald-600 py-4 text-lg font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Hit</button>
					<button onclick={stand}      disabled={!canStand()}  class="rounded-2xl bg-slate-700 py-4 text-lg font-semibold transition hover:bg-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Stand</button>
					<button onclick={doubleDown} disabled={!canDouble()} class="rounded-2xl bg-amber-600 py-4 text-lg font-semibold transition hover:bg-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Double</button>
					<button onclick={split}      disabled={!canSplit()}  class="rounded-2xl bg-violet-700 py-4 text-lg font-semibold transition hover:bg-violet-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Split</button>
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
				<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6"
					transition:fly={{ y: 20, duration: 350 }}>
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
				<button onclick={newRound}
					class="mt-6 w-full rounded-2xl border border-slate-700 bg-slate-900 px-8 py-4 text-xl font-semibold transition hover:bg-slate-800 active:scale-95"
					transition:fly={{ y: 16, duration: 300, delay: 150 }}>
					↩ Neue Runde
				</button>
			{/if}
		{/if}
	</div>
</main>

{#if gameOver}
	<GameOver onReset={handleGameOverReset} />
{/if}

<style>
	/* ── Karte erscheint: slide von oben + fade ─────────────────────────────── */
	.card-enter {
		animation: cardSlideIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes cardSlideIn {
		from {
			opacity: 0;
			transform: translateY(-28px) scale(0.92);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* ── Hole Card aufdecken: horizontaler Flip ─────────────────────────────── */
	.card-flip {
		animation: cardFlip 420ms cubic-bezier(0.4, 0, 0.2, 1) both;
		transform-style: preserve-3d;
	}
	@keyframes cardFlip {
		0%   { transform: rotateY(90deg) scale(0.9); opacity: 0.3; }
		60%  { transform: rotateY(-8deg) scale(1.04); opacity: 1; }
		100% { transform: rotateY(0deg) scale(1); opacity: 1; }
	}

	/* ── Blackjack Glow ─────────────────────────────────────────────────────── */
	.bj-glow {
		animation: bjGlow 800ms ease-out both;
	}
	@keyframes bjGlow {
		0%   { box-shadow: 0 0 0px 0px rgba(52, 211, 153, 0); }
		30%  { box-shadow: 0 0 24px 8px rgba(52, 211, 153, 0.55); }
		100% { box-shadow: 0 0 8px 2px rgba(52, 211, 153, 0.15); }
	}

	/* ── Bust: kurzes rotes Shake ───────────────────────────────────────────── */
	.bust-shake {
		animation: bustShake 440ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
		border-color: rgb(239 68 68 / 0.6) !important;
	}
	@keyframes bustShake {
		0%,100% { transform: translateX(0); }
		15%     { transform: translateX(-6px); }
		30%     { transform: translateX(5px); }
		45%     { transform: translateX(-4px); }
		60%     { transform: translateX(3px); }
		75%     { transform: translateX(-2px); }
	}

	/* ── Kartenrückseite Muster ─────────────────────────────────────────────── */
	.card-back-pattern {
		background-image: repeating-linear-gradient(
			45deg,
			transparent,
			transparent 3px,
			rgba(100, 116, 139, 0.15) 3px,
			rgba(100, 116, 139, 0.15) 6px
		);
	}
</style>