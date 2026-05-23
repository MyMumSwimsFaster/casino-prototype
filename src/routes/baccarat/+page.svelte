<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { getBankroll, setBankroll, baccaratPayout, type BaccaratSelectedBet, type BaccaratResult } from '$lib/bankroll';
	import { recordRound, type RoundOutcome } from '$lib/stats';

	// ─── Types ────────────────────────────────────────────────────────────────
	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
	type Phase = 'setup' | 'dealing' | 'reveal-initial' | 'reveal-p3' | 'reveal-b3' | 'result';

	interface Card { rank: Rank; suit: Suit; value: number; }

	interface DealtRound {
		playerCards: Card[];
		bankerCards: Card[];
		playerScore: number;
		bankerScore: number;
		naturalHand: boolean;
		playerDrewThird: boolean;
		bankerDrewThird: boolean;
		result: BaccaratResult;
	}

	// ─── Chips ────────────────────────────────────────────────────────────────
	const CHIPS = [
		{ value: 1,   label: '1',   bg: 'bg-slate-100',   border: 'border-slate-300', text: 'text-slate-900' },
		{ value: 5,   label: '5',   bg: 'bg-red-600',     border: 'border-red-400',   text: 'text-white'     },
		{ value: 25,  label: '25',  bg: 'bg-emerald-600', border: 'border-emerald-400',text: 'text-white'    },
		{ value: 100, label: '100', bg: 'bg-slate-900',   border: 'border-slate-400', text: 'text-white'     },
		{ value: 500, label: '500', bg: 'bg-violet-700',  border: 'border-yellow-400',text: 'text-yellow-300'},
	] as const;

	// ─── Deck helpers ─────────────────────────────────────────────────────────
	const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
	const SUITS: Suit[] = ['♠','♥','♦','♣'];

	function cv(rank: Rank): number {
		if (rank === 'A') return 1;
		if (['10','J','Q','K'].includes(rank)) return 0;
		return parseInt(rank);
	}
	function buildDeck(): Card[] {
		const d: Card[] = [];
		for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit, value: cv(rank) });
		return d;
	}
	function shuffle(deck: Card[]): Card[] {
		const d = [...deck];
		for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
		return d;
	}
	function handValue(cards: Card[]): number { return cards.reduce((s, c) => s + c.value, 0) % 10; }
	function cardLabel(c: Card): string { return `${c.rank}${c.suit}`; }
	function isRed(c: Card): boolean { return c.suit === '♥' || c.suit === '♦'; }

	// ─── Punto Banco logic ────────────────────────────────────────────────────
	function computeRound(): DealtRound {
		const deck = shuffle(buildDeck());
		let idx = 0;
		const draw = () => deck[idx++];
		const pc: Card[] = [draw(), draw()];
		const bc: Card[] = [draw(), draw()];
		let pv = handValue(pc), bv = handValue(bc);
		const naturalHand = pv >= 8 || bv >= 8;
		let playerDrewThird = false, bankerDrewThird = false, playerThirdValue: number | null = null;
		if (!naturalHand) {
			if (pv <= 5) { const t = draw(); pc.push(t); playerThirdValue = t.value; playerDrewThird = true; pv = handValue(pc); }
			if (playerDrewThird) {
				const t = playerThirdValue!;
				let bd = false;
				if (bv <= 2) bd = true;
				else if (bv === 3) bd = t !== 8;
				else if (bv === 4) bd = t >= 2 && t <= 7;
				else if (bv === 5) bd = t >= 4 && t <= 7;
				else if (bv === 6) bd = t === 6 || t === 7;
				if (bd) { bc.push(draw()); bankerDrewThird = true; bv = handValue(bc); }
			} else {
				if (bv <= 5) { bc.push(draw()); bankerDrewThird = true; bv = handValue(bc); }
			}
		}
		const ps = handValue(pc), bs = handValue(bc);
		const result: BaccaratResult = ps > bs ? 'Player wins' : bs > ps ? 'Banker wins' : 'Tie';
		return { playerCards: pc, bankerCards: bc, playerScore: ps, bankerScore: bs, naturalHand, playerDrewThird, bankerDrewThird, result };
	}

	// ─── State ────────────────────────────────────────────────────────────────
	let bankroll     = $state(1000);
	let bet          = $state(0);
	let betError     = $state('');
	let selectedBet  = $state<BaccaratSelectedBet>('Player');
	let phase        = $state<Phase>('setup');
	let saved        = $state(false);
	let round        = $state<DealtRound | null>(null);
	let revealed     = $state<Set<string>>(new Set());
	let payout       = $state(0);
	let bankrollBefore = 0;

	// Verfolgt welche Karten animiert erscheinen sollen (erst nach reveal)
	let animatedCards = $state<Set<string>>(new Set());

	let displayNetResult = $derived(Math.round((bankroll - bankrollBefore) * 100) / 100);

	onMount(() => { bankroll = getBankroll(); });

	// ─── Chip helpers ─────────────────────────────────────────────────────────
	function addChip(value: number) {
		if (bet + value > bankroll) return;
		betError = '';
		bet += value;
	}
	function clearBet() { bet = 0; betError = ''; }

	// ─── Reveal logic ─────────────────────────────────────────────────────────
	function isRevealed(key: string): boolean { return revealed.has(key); }

	function revealCard(key: string) {
		if (!isRevealable(key)) return;
		// Zuerst zur animated-Set hinzufügen (trigger für Animation)
		animatedCards = new Set([...animatedCards, key]);
		revealed = new Set([...revealed, key]);
		afterReveal();
	}

	function isRevealable(key: string): boolean {
		if (isRevealed(key)) return false;
		if (phase === 'reveal-initial') return ['p0','b0','p1','b1'].includes(key);
		if (phase === 'reveal-p3')      return key === 'p2';
		if (phase === 'reveal-b3')      return key === 'b2';
		return false;
	}

	function afterReveal() {
		if (!round) return;
		if (phase === 'reveal-initial') {
			if (!['p0','b0','p1','b1'].every(k => revealed.has(k))) return;
			if (round.naturalHand)         { finishRound(); return; }
			if (round.playerDrewThird)     { phase = 'reveal-p3'; return; }
			if (round.bankerDrewThird)     { phase = 'reveal-b3'; return; }
			finishRound();
		} else if (phase === 'reveal-p3') {
			if (round.bankerDrewThird)     { phase = 'reveal-b3'; }
			else                           { finishRound(); }
		} else if (phase === 'reveal-b3') {
			finishRound();
		}
	}

	// Reihenfolge: p0, b0, p1, b1 → Animationsdelay pro Slot
	const DEAL_ORDER: Record<string, number> = { p0: 0, b0: 1, p1: 2, b1: 3 };
	// Drittkarten kommen mit kleiner Pause nach dem Initial-Deal
	function thirdCardDelay(): number { return 200; }

	async function dealCards() {
		betError = '';
		if (bet <= 0)         { betError = 'Bitte zuerst Einsatz wählen.'; return; }
		if (bet > bankroll)   { betError = 'Nicht genügend Guthaben.'; return; }

		bankrollBefore = bankroll;
		bankroll -= bet;
		setBankroll(bankroll);

		phase         = 'dealing';
		saved         = false;
		revealed      = new Set();
		animatedCards = new Set();
		payout        = 0;

		await new Promise(r => setTimeout(r, 350));
		round = computeRound();
		phase = 'reveal-initial';
	}

	async function finishRound() {
		if (!round || saved) return;
		phase = 'result';

		payout = baccaratPayout(bet, selectedBet, round.result);
		bankroll += payout;
		setBankroll(bankroll);

		// ── Stats erfassen ──────────────────────────────────────────────
		// Push: Tie-Ergebnis bei P/B-Wette (payout === bet) oder kein Gewinn/Verlust
		const netBac = Math.round((payout - bet) * 100) / 100;
		const outcomeBac: RoundOutcome =
			netBac > 0 ? 'win' :
			netBac < 0 ? 'loss' :
			'push';
		recordRound(outcomeBac, netBac, 1);

		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'baccarat', bet, selectedBet,
					playerCards:    round.playerCards.map(cardLabel),
					bankerCards:    round.bankerCards.map(cardLabel),
					playerScore:    round.playerScore,
					bankerScore:    round.bankerScore,
					result:         round.result,
					playerWon:      payout > 0,
					naturalHand:    round.naturalHand,
					payout:         Math.round(payout * 100) / 100,
					bankrollBefore: Math.round(bankrollBefore * 100) / 100,
					bankrollAfter:  Math.round(bankroll * 100) / 100,
					netResult:      Math.round((bankroll - bankrollBefore) * 100) / 100,
				})
			});
			saved = true;
		} catch (e) { console.error('Failed to save:', e); }
	}

	function newRound() {
		round = null; payout = 0; saved = false;
		revealed = new Set(); animatedCards = new Set();
		phase = 'setup'; betError = ''; bet = 0;
	}

	function phaseHint(): string {
		if (phase === 'reveal-initial') {
			// Nächste Karte in der Casino-Reihenfolge anzeigen
			const order = ['p0','b0','p1','b1'];
			const next = order.find(k => !revealed.has(k));
			const labels: Record<string, string> = { p0: 'Player 1', b0: 'Banker 1', p1: 'Player 2', b1: 'Banker 2' };
			return next ? `${labels[next]} aufdecken…` : '';
		}
		if (phase === 'reveal-p3') return 'Player — 3. Karte aufdecken…';
		if (phase === 'reveal-b3') return 'Banker — 3. Karte aufdecken…';
		return '';
	}

	function visibleScore(cards: Card[], prefix: string): number | null {
		const vis = cards.filter((_, i) => revealed.has(`${prefix}${i}`));
		return vis.length === 0 ? null : handValue(vis);
	}

	// Gibt CSS-Animationsdelay für eine Karte zurück
	function cardRevealDelay(key: string, isThird = false): string {
		if (isThird) return `${thirdCardDelay()}ms`;
		return `${(DEAL_ORDER[key] ?? 0) * 130}ms`;
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-xl">

		<!-- Header -->
		<div class="flex items-center justify-between">
			<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>
			<div class="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2">
				<span class="text-xs text-slate-400">Guthaben</span>
				<span class="text-lg font-bold {bankroll <= 0 ? 'text-red-400' : bankroll < 100 ? 'text-amber-400' : 'text-emerald-400'}">
					{bankroll.toFixed(2)} CHF
				</span>
			</div>
		</div>

		<h1 class="mt-6 text-5xl font-bold">🎴 Baccarat</h1>
		<p class="mt-3 text-slate-400">Punto Banco — setze auf Player, Banker oder Tie.</p>

		<!-- ══ SETUP ══════════════════════════════════════════════════════════ -->
		{#if phase === 'setup'}
			{#if bankroll <= 0}
				<div class="mt-10 rounded-2xl border border-red-800 bg-red-950/40 px-6 py-4 text-center">
					<p class="text-red-400 font-semibold">Kein Guthaben mehr.</p>
					<a href="/" class="mt-2 inline-block text-sm text-slate-400 hover:text-white">← Zur Startseite</a>
				</div>
			{:else}
				<!-- Einsatz-Anzeige -->
				<div class="mt-10 flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5">
					<div>
						<p class="text-xs tracking-widest text-slate-500 uppercase">Einsatz</p>
						<p class="mt-1 text-4xl font-bold {bet > 0 ? 'text-white' : 'text-slate-600'}">
							{bet > 0 ? bet.toFixed(2) : '0.00'} <span class="text-xl font-normal text-slate-400">CHF</span>
						</p>
					</div>
					{#if bet > 0}
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
							{@const disabled = bet + chip.value > bankroll}
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

				<!-- Wette wählen -->
				<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<p class="mb-4 text-xs tracking-widest text-slate-500 uppercase">Ich setze auf</p>
					<div class="grid grid-cols-3 gap-3">
						{#each (['Player', 'Banker', 'Tie'] as BaccaratSelectedBet[]) as option}
							<button onclick={() => (selectedBet = option)}
								class="rounded-xl border-2 py-4 text-base font-semibold transition active:scale-95
								{selectedBet === option ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'}">
								{option}
							</button>
						{/each}
					</div>
					<div class="mt-3 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
						<span>1:1</span><span>0.95:1</span><span>8:1</span>
					</div>
				</div>

				<button onclick={dealCards} disabled={bet <= 0}
					class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-4 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
					🃏 Karten ziehen
				</button>
			{/if}

		<!-- ══ DEALING ════════════════════════════════════════════════════════ -->
		{:else if phase === 'dealing'}
			<div class="mt-16 flex items-center justify-center gap-3 text-slate-400">
				<span class="animate-spin text-2xl">🃏</span>
				<span class="text-lg">Karten werden gemischt…</span>
			</div>

		<!-- ══ REVEAL + RESULT ════════════════════════════════════════════════ -->
		{:else if round !== null}

			<!-- Phase Hint -->
			{#if phase !== 'result'}
				<div class="mt-8 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-center"
					transition:fade={{ duration: 200 }}>
					<p class="text-sm text-slate-300">👆 {phaseHint()}</p>
				</div>
			{/if}

			<!-- Natural Badge -->
			{#if round.naturalHand && ['p0','b0','p1','b1'].every(k => revealed.has(k))}
				<div class="mt-4 rounded-2xl border border-amber-500 bg-amber-900/20 px-6 py-3 text-center natural-glow"
					transition:fly={{ y: -10, duration: 350 }}>
					<p class="text-sm font-semibold tracking-wide text-amber-300 uppercase">✨ Natural Hand</p>
					<p class="mt-1 text-xs text-amber-400">8 oder 9 mit den ersten zwei Karten.</p>
				</div>
			{:else}
				<div class="mt-4"></div>
			{/if}

			<!-- ── Kartentisch ─────────────────────────────────────────────── -->
			<div class="mt-4 grid grid-cols-2 gap-4">

				<!-- Player -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<div class="flex items-center justify-between">
						<p class="text-xs tracking-wide text-slate-400 uppercase font-semibold">Player</p>
						{#if visibleScore(round.playerCards, 'p') !== null}
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold"
								transition:fade={{ duration: 200 }}>
								{visibleScore(round.playerCards, 'p')}
							</span>
						{/if}
					</div>

					<div class="mt-3 flex flex-wrap gap-2">
						<!-- Startkarten p0, p1 -->
						{#each [0, 1] as i}
							{@const key = `p${i}`}
							<!-- Verdeckte Karte erscheint mit gestaffeltem Delay -->
							<div style="animation-delay: {cardRevealDelay(key)}ms" class="card-appear">
								<button
									onclick={() => revealCard(key)}
									disabled={!isRevealable(key)}
									class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition
									{isRevealed(key)
										? (isRed(round.playerCards[i]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
										: isRevealable(key)
											? 'border-emerald-400 bg-slate-800 hover:bg-slate-700 cursor-pointer hover:scale-105'
											: 'border-slate-700 bg-slate-800 cursor-default'}"
								>
									{#if isRevealed(key)}
										<!-- Karte aufgedeckt — Flip-Animation wenn frisch aufgedeckt -->
										<div class="{animatedCards.has(key) ? 'card-flip-reveal' : ''}
											absolute inset-0 flex flex-col items-center justify-center rounded-xl">
											<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.playerCards[i].rank}</span>
											<span class="text-2xl font-bold">{round.playerCards[i].suit}</span>
											<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.playerCards[i].rank}</span>
										</div>
									{:else}
										<!-- Verdeckt — Rückseitenmuster + Pulsieren wenn klickbar -->
										<div class="absolute inset-1 rounded-lg card-back-pattern"></div>
										<span class="relative z-10 text-3xl text-slate-500">🂠</span>
										{#if isRevealable(key)}
											<span class="absolute inset-0 rounded-xl ring-2 ring-emerald-400/60 animate-pulse"></span>
										{/if}
									{/if}
								</button>
							</div>
						{/each}

						<!-- Drittkarte p2 -->
						{#if round.playerDrewThird && (phase === 'reveal-p3' || phase === 'reveal-b3' || phase === 'result')}
							<div class="card-appear-third">
								<button
									onclick={() => revealCard('p2')}
									disabled={!isRevealable('p2')}
									class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition ring-2 ring-emerald-500/50
									{isRevealed('p2')
										? (isRed(round.playerCards[2]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
										: isRevealable('p2')
											? 'border-emerald-400 bg-slate-800 hover:bg-slate-700 cursor-pointer hover:scale-105'
											: 'border-slate-700 bg-slate-800 cursor-default'}"
								>
									{#if isRevealed('p2')}
										<div class="{animatedCards.has('p2') ? 'card-flip-reveal' : ''}
											absolute inset-0 flex flex-col items-center justify-center rounded-xl">
											<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.playerCards[2].rank}</span>
											<span class="text-2xl font-bold">{round.playerCards[2].suit}</span>
											<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.playerCards[2].rank}</span>
										</div>
									{:else}
										<div class="absolute inset-1 rounded-lg card-back-pattern"></div>
										<span class="relative z-10 text-3xl text-slate-500">🂠</span>
										{#if isRevealable('p2')}
											<span class="absolute inset-0 rounded-xl ring-2 ring-emerald-400/60 animate-pulse"></span>
										{/if}
									{/if}
								</button>
							</div>
						{/if}
					</div>

					{#if phase === 'result'}
						{#if round.playerDrewThird}
							<p class="mt-2 text-xs text-emerald-400" transition:fade>+3. Karte gezogen</p>
						{:else}
							<p class="mt-2 text-xs text-slate-500" transition:fade>Stand</p>
						{/if}
					{/if}
				</div>

				<!-- Banker -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<div class="flex items-center justify-between">
						<p class="text-xs tracking-wide text-slate-400 uppercase font-semibold">Banker</p>
						{#if visibleScore(round.bankerCards, 'b') !== null}
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold"
								transition:fade={{ duration: 200 }}>
								{visibleScore(round.bankerCards, 'b')}
							</span>
						{/if}
					</div>

					<div class="mt-3 flex flex-wrap gap-2">
						<!-- Startkarten b0, b1 -->
						{#each [0, 1] as i}
							{@const key = `b${i}`}
							<div style="animation-delay: {cardRevealDelay(key)}ms" class="card-appear">
								<button
									onclick={() => revealCard(key)}
									disabled={!isRevealable(key)}
									class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition
									{isRevealed(key)
										? (isRed(round.bankerCards[i]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
										: isRevealable(key)
											? 'border-violet-400 bg-slate-800 hover:bg-slate-700 cursor-pointer hover:scale-105'
											: 'border-slate-700 bg-slate-800 cursor-default'}"
								>
									{#if isRevealed(key)}
										<div class="{animatedCards.has(key) ? 'card-flip-reveal' : ''}
											absolute inset-0 flex flex-col items-center justify-center rounded-xl">
											<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.bankerCards[i].rank}</span>
											<span class="text-2xl font-bold">{round.bankerCards[i].suit}</span>
											<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.bankerCards[i].rank}</span>
										</div>
									{:else}
										<div class="absolute inset-1 rounded-lg card-back-pattern"></div>
										<span class="relative z-10 text-3xl text-slate-500">🂠</span>
										{#if isRevealable(key)}
											<span class="absolute inset-0 rounded-xl ring-2 ring-violet-400/60 animate-pulse"></span>
										{/if}
									{/if}
								</button>
							</div>
						{/each}

						<!-- Drittkarte b2 -->
						{#if round.bankerDrewThird && (phase === 'reveal-b3' || phase === 'result')}
							<div class="card-appear-third">
								<button
									onclick={() => revealCard('b2')}
									disabled={!isRevealable('b2')}
									class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition ring-2 ring-violet-500/50
									{isRevealed('b2')
										? (isRed(round.bankerCards[2]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
										: isRevealable('b2')
											? 'border-violet-400 bg-slate-800 hover:bg-slate-700 cursor-pointer hover:scale-105'
											: 'border-slate-700 bg-slate-800 cursor-default'}"
								>
									{#if isRevealed('b2')}
										<div class="{animatedCards.has('b2') ? 'card-flip-reveal' : ''}
											absolute inset-0 flex flex-col items-center justify-center rounded-xl">
											<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.bankerCards[2].rank}</span>
											<span class="text-2xl font-bold">{round.bankerCards[2].suit}</span>
											<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.bankerCards[2].rank}</span>
										</div>
									{:else}
										<div class="absolute inset-1 rounded-lg card-back-pattern"></div>
										<span class="relative z-10 text-3xl text-slate-500">🂠</span>
										{#if isRevealable('b2')}
											<span class="absolute inset-0 rounded-xl ring-2 ring-violet-400/60 animate-pulse"></span>
										{/if}
									{/if}
								</button>
							</div>
						{/if}
					</div>

					{#if phase === 'result'}
						{#if round.bankerDrewThird}
							<p class="mt-2 text-xs text-violet-400" transition:fade>+3. Karte gezogen</p>
						{:else}
							<p class="mt-2 text-xs text-slate-500" transition:fade>Stand</p>
						{/if}
					{/if}
				</div>
			</div>

			<!-- ── Ergebnis ───────────────────────────────────────────────── -->
			{#if phase === 'result'}
				<div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"
					transition:fly={{ y: 20, duration: 350 }}>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm tracking-wide text-slate-400 uppercase">Ergebnis</p>
							<p class="mt-1 text-2xl font-bold">{round.result}</p>
						</div>
						<div class="text-right">
							<p class="text-sm text-slate-400">Einsatz · {selectedBet}</p>
							<p class="mt-1 font-semibold text-white">{bet} CHF</p>
						</div>
					</div>
					<div class="mt-4 border-t border-slate-700 pt-4 flex flex-col gap-2">
						<div class="flex justify-between text-sm">
							<span class="text-slate-400">Auszahlung</span>
							<span class="font-semibold {payout > 0 ? 'text-emerald-400' : 'text-slate-500'}">
								{payout > 0 ? `+${payout.toFixed(2)} CHF` : '—'}
							</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-slate-400">Netto</span>
							<span class="font-bold {displayNetResult > 0 ? 'text-emerald-400' : displayNetResult < 0 ? 'text-red-400' : 'text-amber-400'}">
								{displayNetResult > 0 ? '+' : ''}{displayNetResult.toFixed(2)} CHF
							</span>
						</div>
						<div class="flex justify-between text-sm">
							<span class="text-slate-400">Neues Guthaben</span>
							<span class="font-bold text-white">{bankroll.toFixed(2)} CHF</span>
						</div>
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

<style>
	/* ── Verdeckte Karte erscheint beim Deal: sanftes Slide ─────────────────── */
	.card-appear {
		animation: cardAppear 300ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes cardAppear {
		from { opacity: 0; transform: translateY(-22px) scale(0.9); }
		to   { opacity: 1; transform: translateY(0) scale(1); }
	}

	/* ── Drittkarte: kommt von etwas weiter oben, mit leichtem Delay ────────── */
	.card-appear-third {
		animation: cardAppearThird 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: 180ms;
	}
	@keyframes cardAppearThird {
		from { opacity: 0; transform: translateY(-36px) scale(0.88); }
		to   { opacity: 1; transform: translateY(0) scale(1); }
	}

	/* ── Karte aufdecken: horizontaler Flip ─────────────────────────────────── */
	.card-flip-reveal {
		animation: cardFlipReveal 380ms cubic-bezier(0.4, 0, 0.2, 1) both;
	}
	@keyframes cardFlipReveal {
		0%   { transform: rotateY(90deg) scale(0.88); opacity: 0.2; }
		55%  { transform: rotateY(-6deg) scale(1.05); opacity: 1; }
		100% { transform: rotateY(0deg) scale(1); opacity: 1; }
	}

	/* ── Natural Glow: gold ─────────────────────────────────────────────────── */
	.natural-glow {
		animation: naturalGlow 1s ease-out both;
	}
	@keyframes naturalGlow {
		0%   { box-shadow: 0 0 0px 0px rgba(251, 191, 36, 0); }
		35%  { box-shadow: 0 0 28px 10px rgba(251, 191, 36, 0.5); }
		100% { box-shadow: 0 0 10px 2px rgba(251, 191, 36, 0.15); }
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