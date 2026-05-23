<script lang="ts">
	import { onMount } from 'svelte';
	import { getBankroll, setBankroll, baccaratPayout, type BaccaratSelectedBet, type BaccaratResult } from '$lib/bankroll';

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
	let bet          = $state<number>(10);
	let betError     = $state('');
	let selectedBet  = $state<BaccaratSelectedBet>('Player');
	let phase        = $state<Phase>('setup');
	let saved        = $state(false);
	let round        = $state<DealtRound | null>(null);
	let revealed     = $state<Set<string>>(new Set());
	let payout       = $state(0);
	let bankrollBefore = 0;

	// Abgeleiteter Netto-Wert — vermeidet @const im Template
	let displayNetResult = $derived(Math.round((bankroll - bankrollBefore) * 100) / 100);

	onMount(() => { bankroll = getBankroll(); });

	function isRevealed(key: string): boolean { return revealed.has(key); }
	function revealCard(key: string) {
		if (!isRevealable(key)) return;
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

	async function dealCards() {
		betError = '';
		if (!bet || bet <= 0) { betError = 'Bitte gültigen Einsatz eingeben.'; return; }
		if (bet > bankroll)   { betError = 'Nicht genügend Guthaben.'; return; }

		// Einsatz abziehen
		bankrollBefore = bankroll;
		bankroll -= bet;
		setBankroll(bankroll);

		phase    = 'dealing';
		saved    = false;
		revealed = new Set();
		payout   = 0;

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

		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game:           'baccarat',
					bet,
					selectedBet,
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
		} catch (e) {
			console.error('Failed to save:', e);
		}
	}

	function newRound() {
		round = null; payout = 0; saved = false;
		revealed = new Set(); phase = 'setup'; betError = '';
	}

	function phaseHint(): string {
		if (phase === 'reveal-initial') {
			const rem = ['p0','b0','p1','b1'].filter(k => !revealed.has(k)).length;
			return rem > 0 ? `${rem} Karte${rem > 1 ? 'n' : ''} aufdecken…` : '';
		}
		if (phase === 'reveal-p3') return 'Player-Drittkarte aufdecken…';
		if (phase === 'reveal-b3') return 'Banker-Drittkarte aufdecken…';
		return '';
	}

	function visibleScore(cards: Card[], prefix: string): number | null {
		const vis = cards.filter((_, i) => revealed.has(`${prefix}${i}`));
		return vis.length === 0 ? null : handValue(vis);
	}

	// (netResultValue ersetzt durch $derived displayNetResult oben)
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-xl">
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

		{#if phase === 'setup'}
			<div class="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<label class="block text-sm tracking-wide text-slate-400 uppercase">Einsatz (CHF)</label>
				<input type="number" min="1" max={bankroll} bind:value={bet}
					class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xl font-semibold text-white focus:border-emerald-500 focus:outline-none" />
				{#if betError}
					<p class="mt-2 text-sm text-red-400">{betError}</p>
				{/if}
			</div>

			<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<p class="mb-4 text-sm tracking-wide text-slate-400 uppercase">Ich setze auf</p>
				<div class="grid grid-cols-3 gap-3">
					{#each (['Player', 'Banker', 'Tie'] as BaccaratSelectedBet[]) as option}
						<button onclick={() => (selectedBet = option)}
							class="rounded-xl border-2 py-4 text-base font-semibold transition active:scale-95
							{selectedBet === option ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'}">
							{option}
						</button>
					{/each}
				</div>
				<!-- Payout-Hinweis -->
				<div class="mt-3 grid grid-cols-3 gap-3 text-center text-xs text-slate-500">
					<span>1:1</span><span>0.95:1</span><span>8:1</span>
				</div>
			</div>

			{#if bankroll <= 0}
				<div class="mt-6 rounded-2xl border border-red-800 bg-red-950/40 px-6 py-4 text-center">
					<p class="text-red-400 font-semibold">Kein Guthaben mehr.</p>
					<a href="/" class="mt-2 inline-block text-sm text-slate-400 hover:text-white">← Zur Startseite</a>
				</div>
			{:else}
				<button onclick={dealCards} disabled={!bet || bet <= 0}
					class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-4 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
					🃏 Karten ziehen
				</button>
			{/if}

		{:else if phase === 'dealing'}
			<div class="mt-16 flex items-center justify-center gap-3 text-slate-400">
				<span class="animate-spin text-2xl">🃏</span>
				<span class="text-lg">Karten werden gemischt…</span>
			</div>

		{:else if round !== null}
			{#if phase !== 'result'}
				<div class="mt-8 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-center">
					<p class="text-sm text-slate-300">👆 {phaseHint()}</p>
				</div>
			{/if}

			{#if round.naturalHand && ['p0','b0','p1','b1'].every(k => revealed.has(k))}
				<div class="mt-4 rounded-2xl border border-amber-600 bg-amber-900/30 px-6 py-3 text-center">
					<p class="text-sm font-semibold tracking-wide text-amber-300 uppercase">✨ Natural Hand</p>
					<p class="mt-1 text-xs text-amber-400">8 oder 9 mit den ersten zwei Karten.</p>
				</div>
			{:else}
				<div class="mt-4"></div>
			{/if}

			<div class="mt-4 grid grid-cols-2 gap-4">
				<!-- Player -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<div class="flex items-center justify-between">
						<p class="text-xs tracking-wide text-slate-400 uppercase">Player</p>
						{#if visibleScore(round.playerCards, 'p') !== null}
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">{visibleScore(round.playerCards, 'p')}</span>
						{/if}
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each [0, 1] as i}
							<button onclick={() => revealCard(`p${i}`)} disabled={!isRevealable(`p${i}`)}
								class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition
								{isRevealed(`p${i}`)
									? (isRed(round.playerCards[i]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
									: isRevealable(`p${i}`)
										? 'border-emerald-400 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 animate-pulse'
										: 'border-slate-700 bg-slate-800 cursor-default'}">
								{#if isRevealed(`p${i}`)}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.playerCards[i].rank}</span>
									<span class="text-2xl font-bold">{round.playerCards[i].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.playerCards[i].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/each}
						{#if round.playerDrewThird && (phase === 'reveal-p3' || phase === 'reveal-b3' || phase === 'result')}
							<button onclick={() => revealCard('p2')} disabled={!isRevealable('p2')}
								class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition ring-2 ring-emerald-500/60
								{isRevealed('p2')
									? (isRed(round.playerCards[2]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
									: isRevealable('p2')
										? 'border-emerald-400 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 animate-pulse'
										: 'border-slate-700 bg-slate-800 cursor-default'}">
								{#if isRevealed('p2')}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.playerCards[2].rank}</span>
									<span class="text-2xl font-bold">{round.playerCards[2].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.playerCards[2].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/if}
					</div>
					{#if phase === 'result'}
						{#if round.playerDrewThird}<p class="mt-2 text-xs text-emerald-400">+3. Karte gezogen</p>
						{:else}<p class="mt-2 text-xs text-slate-500">Stand</p>{/if}
					{/if}
				</div>

				<!-- Banker -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<div class="flex items-center justify-between">
						<p class="text-xs tracking-wide text-slate-400 uppercase">Banker</p>
						{#if visibleScore(round.bankerCards, 'b') !== null}
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">{visibleScore(round.bankerCards, 'b')}</span>
						{/if}
					</div>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each [0, 1] as i}
							<button onclick={() => revealCard(`b${i}`)} disabled={!isRevealable(`b${i}`)}
								class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition
								{isRevealed(`b${i}`)
									? (isRed(round.bankerCards[i]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
									: isRevealable(`b${i}`)
										? 'border-emerald-400 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 animate-pulse'
										: 'border-slate-700 bg-slate-800 cursor-default'}">
								{#if isRevealed(`b${i}`)}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.bankerCards[i].rank}</span>
									<span class="text-2xl font-bold">{round.bankerCards[i].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.bankerCards[i].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/each}
						{#if round.bankerDrewThird && (phase === 'reveal-b3' || phase === 'result')}
							<button onclick={() => revealCard('b2')} disabled={!isRevealable('b2')}
								class="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl border-2 shadow-lg transition ring-2 ring-violet-500/60
								{isRevealed('b2')
									? (isRed(round.bankerCards[2]) ? 'border-red-500 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900')
									: isRevealable('b2')
										? 'border-violet-400 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 animate-pulse'
										: 'border-slate-700 bg-slate-800 cursor-default'}">
								{#if isRevealed('b2')}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.bankerCards[2].rank}</span>
									<span class="text-2xl font-bold">{round.bankerCards[2].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.bankerCards[2].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/if}
					</div>
					{#if phase === 'result'}
						{#if round.bankerDrewThird}<p class="mt-2 text-xs text-violet-400">+3. Karte gezogen</p>
						{:else}<p class="mt-2 text-xs text-slate-500">Stand</p>{/if}
					{/if}
				</div>
			</div>

			{#if phase === 'result'}
				<div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
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

				<button onclick={newRound} class="mt-6 w-full rounded-2xl border border-slate-700 bg-slate-900 px-8 py-4 text-xl font-semibold transition hover:bg-slate-800 active:scale-95">
					↩ Neue Runde
				</button>
			{/if}
		{/if}
	</div>
</main>