<script lang="ts">
	// ─── Types ────────────────────────────────────────────────────────────────

	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
	type Bet = 'Player' | 'Banker' | 'Tie';
	type GameResult = 'Player wins' | 'Banker wins' | 'Tie';
	type Phase = 'setup' | 'result';

	interface Card {
		rank: Rank;
		suit: Suit;
		value: number;
	}

	// ─── Card helpers ─────────────────────────────────────────────────────────

	const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
	const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

	function cardValue(rank: Rank): number {
		if (rank === 'A') return 1;
		if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
		return parseInt(rank);
	}

	function buildDeck(): Card[] {
		const deck: Card[] = [];
		for (const suit of SUITS) {
			for (const rank of RANKS) {
				deck.push({ rank, suit, value: cardValue(rank) });
			}
		}
		return deck;
	}

	function shuffle(deck: Card[]): Card[] {
		const d = [...deck];
		for (let i = d.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[d[i], d[j]] = [d[j], d[i]];
		}
		return d;
	}

	function handValue(cards: Card[]): number {
		return cards.reduce((sum, c) => sum + c.value, 0) % 10;
	}

	function cardLabel(card: Card): string {
		return `${card.rank}${card.suit}`;
	}

	// ─── Punto Banco game logic ───────────────────────────────────────────────

	interface RoundResult {
		playerCards: Card[];
		bankerCards: Card[];
		playerScore: number;
		bankerScore: number;
		naturalHand: boolean;
		playerDrewThird: boolean;
		bankerDrewThird: boolean;
		result: GameResult;
	}

	function playRound(): RoundResult {
		const deck = shuffle(buildDeck());
		let idx = 0;
		const draw = () => deck[idx++];

		const playerCards: Card[] = [draw(), draw()];
		const bankerCards: Card[] = [draw(), draw()];

		let pVal = handValue(playerCards);
		let bVal = handValue(bankerCards);

		const naturalHand = pVal >= 8 || bVal >= 8;

		let playerDrewThird = false;
		let bankerDrewThird = false;
		let playerThirdValue: number | null = null;

		if (!naturalHand) {
			if (pVal <= 5) {
				const third = draw();
				playerCards.push(third);
				playerThirdValue = third.value;
				playerDrewThird = true;
				pVal = handValue(playerCards);
			}

			if (playerDrewThird) {
				const t = playerThirdValue!;
				let bankerDraws = false;

				if (bVal <= 2) {
					bankerDraws = true;
				} else if (bVal === 3) {
					bankerDraws = t !== 8;
				} else if (bVal === 4) {
					bankerDraws = t >= 2 && t <= 7;
				} else if (bVal === 5) {
					bankerDraws = t >= 4 && t <= 7;
				} else if (bVal === 6) {
					bankerDraws = t === 6 || t === 7;
				}
				// bVal === 7: stays; 8/9: caught by naturalHand

				if (bankerDraws) {
					bankerCards.push(draw());
					bankerDrewThird = true;
					bVal = handValue(bankerCards);
				}
			} else {
				if (bVal <= 5) {
					bankerCards.push(draw());
					bankerDrewThird = true;
					bVal = handValue(bankerCards);
				}
			}
		}

		let result: GameResult;
		if (pVal > bVal) result = 'Player wins';
		else if (bVal > pVal) result = 'Banker wins';
		else result = 'Tie';

		return {
			playerCards,
			bankerCards,
			playerScore: pVal,
			bankerScore: bVal,
			naturalHand,
			playerDrewThird,
			bankerDrewThird,
			result
		};
	}

	// ─── Component state ─────────────────────────────────────────────────────

	let bet = $state<number>(10);
	let selectedBet = $state<Bet>('Player');
	let phase = $state<Phase>('setup');
	let isLoading = $state(false);
	let saved = $state(false);

	let round = $state<RoundResult | null>(null);
	let playerWon = $state<boolean | null>(null);

	// ─── Actions ─────────────────────────────────────────────────────────────

	async function dealCards() {
		if (!bet || bet <= 0) return;
		isLoading = true;
		saved = false;

		await new Promise((r) => setTimeout(r, 350));

		const r = playRound();
		round = r;

		const won =
			(selectedBet === 'Player' && r.result === 'Player wins') ||
			(selectedBet === 'Banker' && r.result === 'Banker wins') ||
			(selectedBet === 'Tie' && r.result === 'Tie');

		playerWon = won;
		phase = 'result';
		isLoading = false;

		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'baccarat',
					bet,
					selectedBet,
					playerCards: r.playerCards.map(cardLabel),
					bankerCards: r.bankerCards.map(cardLabel),
					playerScore: r.playerScore,
					bankerScore: r.bankerScore,
					result: r.result,
					playerWon: won,
					naturalHand: r.naturalHand
				})
			});
			saved = true;
		} catch (e) {
			console.error('Failed to save game:', e);
		}
	}

	function newRound() {
		round = null;
		playerWon = null;
		saved = false;
		phase = 'setup';
	}

	function isRed(card: Card): boolean {
		return card.suit === '♥' || card.suit === '♦';
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<h1 class="mt-6 text-5xl font-bold">🎴 Baccarat</h1>
		<p class="mt-3 text-slate-400">Punto Banco — setze auf Player, Banker oder Tie.</p>

		<!-- ── Setup phase ─────────────────────────────────────────────────── -->
		{#if phase === 'setup'}
			<div class="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<label class="block text-sm tracking-wide text-slate-400 uppercase">Einsatz (CHF)</label>
				<input
					type="number"
					min="1"
					bind:value={bet}
					class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xl font-semibold text-white focus:border-emerald-500 focus:outline-none"
				/>
			</div>

			<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<p class="mb-4 text-sm tracking-wide text-slate-400 uppercase">Ich setze auf</p>
				<div class="grid grid-cols-3 gap-3">
					{#each (['Player', 'Banker', 'Tie'] as Bet[]) as option}
						<button
							onclick={() => (selectedBet = option)}
							class="rounded-xl border-2 py-3 text-base font-semibold transition active:scale-95
							{selectedBet === option
								? 'border-emerald-500 bg-emerald-600 text-white'
								: 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'}"
						>
							{option}
						</button>
					{/each}
				</div>
			</div>

			<button
				onclick={dealCards}
				disabled={isLoading || !bet || bet <= 0}
				class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-4 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isLoading ? 'Karten werden gezogen…' : '🃏 Karten ziehen'}
			</button>

		<!-- ── Result phase ────────────────────────────────────────────────── -->
		{:else if phase === 'result' && round !== null}

			{#if round.naturalHand}
				<div class="mt-10 rounded-2xl border border-amber-600 bg-amber-900/30 px-6 py-3 text-center">
					<p class="text-sm font-semibold tracking-wide text-amber-300 uppercase">✨ Natural Hand</p>
					<p class="mt-1 text-xs text-amber-400">
						8 oder 9 mit den ersten zwei Karten — keine weiteren Karten gezogen.
					</p>
				</div>
			{:else}
				<div class="mt-10"></div>
			{/if}

			<!-- Cards -->
			<div class="mt-4 grid grid-cols-2 gap-4">
				<!-- Player -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<p class="text-xs tracking-wide text-slate-400 uppercase">Player</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each round.playerCards as card, i}
							<div
								class="flex h-14 w-10 flex-col items-center justify-center rounded-lg border text-sm font-bold shadow leading-tight
								{isRed(card) ? 'border-red-700 bg-slate-800 text-red-400' : 'border-slate-600 bg-slate-800 text-white'}
								{i === 2 ? 'ring-2 ring-emerald-500' : ''}"
							>
								<span>{card.rank}</span>
								<span>{card.suit}</span>
							</div>
						{/each}
					</div>
					{#if round.playerDrewThird}
						<p class="mt-2 text-xs text-emerald-400">+3. Karte gezogen</p>
					{:else if !round.naturalHand}
						<p class="mt-2 text-xs text-slate-500">Stand bei {round.playerCards.length === 2 ? handValue(round.playerCards.slice(0,2)) : '—'}</p>
					{/if}
					<p class="mt-3 text-3xl font-bold">{round.playerScore}</p>
				</div>

				<!-- Banker -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<p class="text-xs tracking-wide text-slate-400 uppercase">Banker</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each round.bankerCards as card, i}
							<div
								class="flex h-14 w-10 flex-col items-center justify-center rounded-lg border text-sm font-bold shadow leading-tight
								{isRed(card) ? 'border-red-700 bg-slate-800 text-red-400' : 'border-slate-600 bg-slate-800 text-white'}
								{i === 2 ? 'ring-2 ring-violet-500' : ''}"
							>
								<span>{card.rank}</span>
								<span>{card.suit}</span>
							</div>
						{/each}
					</div>
					{#if round.bankerDrewThird}
						<p class="mt-2 text-xs text-violet-400">+3. Karte gezogen</p>
					{:else if !round.naturalHand}
						<p class="mt-2 text-xs text-slate-500">Stand</p>
					{/if}
					<p class="mt-3 text-3xl font-bold">{round.bankerScore}</p>
				</div>
			</div>

			<!-- Result summary -->
			<div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm tracking-wide text-slate-400 uppercase">Ergebnis</p>
						<p class="mt-1 text-2xl font-bold">{round.result}</p>
					</div>
					<div class="text-right">
						<p class="text-sm text-slate-400">Dein Einsatz</p>
						<p class="mt-1 font-semibold text-white">{selectedBet} · {bet} CHF</p>
					</div>
				</div>

				<div class="mt-5 border-t border-slate-800 pt-5 text-center">
					<p class="text-4xl font-bold {playerWon ? 'text-emerald-400' : 'text-red-400'}">
						{playerWon ? '🏆 Gewonnen!' : '💸 Verloren'}
					</p>
					{#if saved}
						<p class="mt-3 text-sm text-slate-500">✓ Runde gespeichert</p>
					{/if}
				</div>
			</div>

			<button
				onclick={newRound}
				class="mt-6 w-full rounded-2xl border border-slate-700 bg-slate-900 px-8 py-4 text-xl font-semibold transition hover:bg-slate-800 active:scale-95"
			>
				↩ Neue Runde
			</button>
		{/if}
	</div>
</main>