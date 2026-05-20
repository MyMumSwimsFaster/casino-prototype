<script lang="ts">
	// ─── Types ────────────────────────────────────────────────────────────────

	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
	type Bet = 'Player' | 'Banker' | 'Tie';
	type GameResult = 'Player wins' | 'Banker wins' | 'Tie';

	// Phasen der Runde:
	// setup           → Einsatz + Wettwahl
	// dealing         → kurze Verzögerung, dann 4 verdeckte Karten erscheinen
	// reveal-initial  → Nutzer deckt p0, b0, p1, b1 auf (beliebige Reihenfolge)
	// reveal-p3       → Player-Drittkarte erscheint verdeckt, Nutzer deckt auf
	// reveal-b3       → Banker-Drittkarte erscheint verdeckt, Nutzer deckt auf
	// result          → Ergebnis anzeigen, Runde speichern
	type Phase =
		| 'setup'
		| 'dealing'
		| 'reveal-initial'
		| 'reveal-p3'
		| 'reveal-b3'
		| 'result';

	interface Card {
		rank: Rank;
		suit: Suit;
		value: number;
	}

	interface DealtRound {
		playerCards: Card[];   // 2 oder 3 Karten
		bankerCards: Card[];   // 2 oder 3 Karten
		playerScore: number;
		bankerScore: number;
		naturalHand: boolean;
		playerDrewThird: boolean;
		bankerDrewThird: boolean;
		result: GameResult;
	}

	// ─── Deck helpers ─────────────────────────────────────────────────────────

	const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
	const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

	function cardValue(rank: Rank): number {
		if (rank === 'A') return 1;
		if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
		return parseInt(rank);
	}

	function buildDeck(): Card[] {
		const deck: Card[] = [];
		for (const suit of SUITS)
			for (const rank of RANKS)
				deck.push({ rank, suit, value: cardValue(rank) });
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

	function isRed(card: Card): boolean {
		return card.suit === '♥' || card.suit === '♦';
	}

	// ─── Punto Banco — vollständige Rundenberechnung ──────────────────────────
	// Alle Karten werden beim Deal sofort komplett berechnet und intern
	// gespeichert. Die UI kontrolliert nur, welche Karten sichtbar sind.

	function computeRound(): DealtRound {
		const deck = shuffle(buildDeck());
		let idx = 0;
		const draw = () => deck[idx++];

		const playerCards: Card[] = [draw(), draw()];
		const bankerCards: Card[] = [draw(), draw()];

		const pInit = handValue(playerCards);
		const bInit = handValue(bankerCards);

		const naturalHand = pInit >= 8 || bInit >= 8;

		let playerDrewThird = false;
		let bankerDrewThird = false;

		if (!naturalHand) {
			// Player drawing rule
			if (pInit <= 5) {
				playerCards.push(draw());
				playerDrewThird = true;
			}

			// Banker drawing rule
			if (playerDrewThird) {
				const t = playerCards[2].value;
				const bv = handValue(bankerCards); // still 2-card value
				let bankerDraws = false;
				if (bv <= 2)        bankerDraws = true;
				else if (bv === 3)  bankerDraws = t !== 8;
				else if (bv === 4)  bankerDraws = t >= 2 && t <= 7;
				else if (bv === 5)  bankerDraws = t >= 4 && t <= 7;
				else if (bv === 6)  bankerDraws = t === 6 || t === 7;
				// bv === 7: stays; 8/9 caught by naturalHand
				if (bankerDraws) {
					bankerCards.push(draw());
					bankerDrewThird = true;
				}
			} else {
				if (handValue(bankerCards) <= 5) {
					bankerCards.push(draw());
					bankerDrewThird = true;
				}
			}
		}

		const playerScore = handValue(playerCards);
		const bankerScore = handValue(bankerCards);

		let result: GameResult;
		if (playerScore > bankerScore)      result = 'Player wins';
		else if (bankerScore > playerScore)  result = 'Banker wins';
		else                                result = 'Tie';

		return { playerCards, bankerCards, playerScore, bankerScore, naturalHand, playerDrewThird, bankerDrewThird, result };
	}

	// ─── Component state ─────────────────────────────────────────────────────

	let bet          = $state<number>(10);
	let selectedBet  = $state<Bet>('Player');
	let phase        = $state<Phase>('setup');
	let saved        = $state(false);

	// Das intern berechnete Rundenergebnis
	let round = $state<DealtRound | null>(null);

	// Welche Karten sind aufgedeckt? Keys: 'p0','p1','p2','b0','b1','b2'
	let revealed = $state<Set<string>>(new Set());

	// Ob der Nutzer gewonnen hat (erst am Ende gesetzt)
	let playerWon = $state<boolean | null>(null);

	// ─── Reveal helpers ───────────────────────────────────────────────────────

	function isRevealed(key: string): boolean {
		return revealed.has(key);
	}

	function revealCard(key: string) {
		// Nur aufdecken wenn die Karte in der aktuellen Phase aufdeckbar ist
		if (!isRevealable(key)) return;
		revealed = new Set([...revealed, key]);
		afterReveal();
	}

	// Bestimmt, ob eine Karte gerade anklickbar ist
	function isRevealable(key: string): boolean {
		if (isRevealed(key)) return false;
		if (phase === 'reveal-initial') return ['p0', 'b0', 'p1', 'b1'].includes(key);
		if (phase === 'reveal-p3')      return key === 'p2';
		if (phase === 'reveal-b3')      return key === 'b2';
		return false;
	}

	// Wird nach jedem Aufdecken aufgerufen — treibt die Phase vorwärts
	function afterReveal() {
		if (!round) return;

		if (phase === 'reveal-initial') {
			const allInitialRevealed = ['p0', 'b0', 'p1', 'b1'].every(k => revealed.has(k));
			if (!allInitialRevealed) return;

			// Alle 4 Startkarten offen → nächste Phase bestimmen
			if (round.naturalHand) {
				// Natural: direkt Ergebnis
				finishRound();
			} else if (round.playerDrewThird) {
				phase = 'reveal-p3';
			} else if (round.bankerDrewThird) {
				// Player stand, Banker zieht → Banker-Karte direkt
				phase = 'reveal-b3';
			} else {
				// Beide stehen → Ergebnis
				finishRound();
			}
			return;
		}

		if (phase === 'reveal-p3') {
			// Player-Drittkarte aufgedeckt → Banker-Phase prüfen
			if (round.bankerDrewThird) {
				phase = 'reveal-b3';
			} else {
				finishRound();
			}
			return;
		}

		if (phase === 'reveal-b3') {
			finishRound();
		}
	}

	// ─── Actions ─────────────────────────────────────────────────────────────

	async function deal() {
		if (!bet || bet <= 0) return;
		phase = 'dealing';
		saved = false;
		revealed = new Set();
		playerWon = null;

		await new Promise(r => setTimeout(r, 400));

		round = computeRound();
		phase = 'reveal-initial';
	}

	async function finishRound() {
		if (!round || saved) return;
		phase = 'result';

		const won =
			(selectedBet === 'Player' && round.result === 'Player wins') ||
			(selectedBet === 'Banker' && round.result === 'Banker wins') ||
			(selectedBet === 'Tie'    && round.result === 'Tie');
		playerWon = won;

		// Einmalig speichern
		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'baccarat',
					bet,
					selectedBet,
					playerCards: round.playerCards.map(cardLabel),
					bankerCards: round.bankerCards.map(cardLabel),
					playerScore: round.playerScore,
					bankerScore: round.bankerScore,
					result: round.result,
					playerWon: won,
					naturalHand: round.naturalHand
				})
			});
			saved = true;
		} catch (e) {
			console.error('Failed to save game:', e);
		}
	}

	function newRound() {
		round    = null;
		playerWon = null;
		saved    = false;
		revealed = new Set();
		phase    = 'setup';
	}

	// ─── Hilfswerte für Template ──────────────────────────────────────────────

	// Sichtbarer Score — nur aus aufgedeckten Karten berechnen
	function visibleScore(cards: Card[], keyPrefix: string): number | null {
		const visible = cards.filter((_, i) => revealed.has(`${keyPrefix}${i}`));
		if (visible.length === 0) return null;
		return handValue(visible);
	}

	// Hint-Text unter den Karten während der Reveal-Phase
	function phaseHint(): string {
		if (phase === 'reveal-initial') {
			const remaining = ['p0','b0','p1','b1'].filter(k => !revealed.has(k)).length;
			return remaining > 0 ? `${remaining} Karte${remaining > 1 ? 'n' : ''} aufdecken…` : '';
		}
		if (phase === 'reveal-p3') return 'Player-Drittkarte aufdecken…';
		if (phase === 'reveal-b3') return 'Banker-Drittkarte aufdecken…';
		return '';
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-2xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<h1 class="mt-6 text-5xl font-bold">🎴 Baccarat</h1>
		<p class="mt-3 text-slate-400">Punto Banco — setze auf Player, Banker oder Tie.</p>

		<!-- ══ SETUP ══════════════════════════════════════════════════════════ -->
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
							class="rounded-xl border-2 py-4 text-base font-semibold transition active:scale-95
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
				onclick={deal}
				disabled={!bet || bet <= 0}
				class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-5 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				🃏 Deal
			</button>

		<!-- ══ DEALING ════════════════════════════════════════════════════════ -->
		{:else if phase === 'dealing'}
			<div class="mt-16 flex items-center justify-center gap-3 text-slate-400">
				<span class="animate-spin text-2xl">🃏</span>
				<span class="text-lg">Karten werden gemischt…</span>
			</div>

		<!-- ══ REVEAL + RESULT ════════════════════════════════════════════════ -->
		{:else if round !== null}

			<!-- Hint-Banner -->
			{#if phase !== 'result'}
				<div class="mt-8 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-center">
					<p class="text-sm text-slate-300">
						👆 {phaseHint()}
					</p>
				</div>
			{/if}

			<!-- Natural-Badge (nur wenn alle Startkarten offen und Natural) -->
			{#if round.naturalHand && ['p0','b0','p1','b1'].every(k => revealed.has(k))}
				<div class="mt-4 rounded-2xl border border-amber-600 bg-amber-900/30 px-6 py-3 text-center">
					<p class="text-sm font-semibold tracking-wide text-amber-300 uppercase">✨ Natural Hand</p>
					<p class="mt-1 text-xs text-amber-400">8 oder 9 mit den ersten zwei Karten — keine weiteren Karten.</p>
				</div>
			{/if}

			<!-- ── Kartentisch ────────────────────────────────────────────── -->
			<div class="mt-6 grid grid-cols-2 gap-6">

				<!-- Player -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<div class="flex items-center justify-between">
						<p class="text-sm tracking-wide text-slate-400 uppercase font-semibold">Player</p>
						{#if visibleScore(round.playerCards, 'p') !== null}
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">
								{visibleScore(round.playerCards, 'p')}
							</span>
						{/if}
					</div>

					<div class="mt-4 flex flex-wrap gap-3">
						<!-- Karte p0 -->
						{#if phase !== 'setup' && phase !== 'dealing'}
							<button
								onclick={() => revealCard('p0')}
								disabled={!isRevealable('p0')}
								class="relative h-24 w-16 rounded-xl border-2 shadow-lg transition
								{isRevealed('p0')
									? (isRed(round.playerCards[0]) ? 'border-red-600 bg-white text-red-600' : 'border-slate-500 bg-white text-slate-900')
									: isRevealable('p0')
										? 'border-emerald-500 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105'
										: 'border-slate-700 bg-slate-800 cursor-default'}"
							>
								{#if isRevealed('p0')}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.playerCards[0].rank}</span>
									<span class="text-2xl font-bold">{round.playerCards[0].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.playerCards[0].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/if}

						<!-- Karte p1 -->
						{#if phase !== 'setup' && phase !== 'dealing'}
							<button
								onclick={() => revealCard('p1')}
								disabled={!isRevealable('p1')}
								class="relative h-24 w-16 rounded-xl border-2 shadow-lg transition
								{isRevealed('p1')
									? (isRed(round.playerCards[1]) ? 'border-red-600 bg-white text-red-600' : 'border-slate-500 bg-white text-slate-900')
									: isRevealable('p1')
										? 'border-emerald-500 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105'
										: 'border-slate-700 bg-slate-800 cursor-default'}"
							>
								{#if isRevealed('p1')}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.playerCards[1].rank}</span>
									<span class="text-2xl font-bold">{round.playerCards[1].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.playerCards[1].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/if}

						<!-- Karte p2 (Drittkarte) — erscheint erst ab reveal-p3 -->
						{#if round.playerDrewThird && (phase === 'reveal-p3' || phase === 'reveal-b3' || phase === 'result')}
							<button
								onclick={() => revealCard('p2')}
								disabled={!isRevealable('p2')}
								class="relative h-24 w-16 rounded-xl border-2 shadow-lg transition ring-2 ring-emerald-500/60
								{isRevealed('p2')
									? (isRed(round.playerCards[2]) ? 'border-red-600 bg-white text-red-600' : 'border-slate-500 bg-white text-slate-900')
									: isRevealable('p2')
										? 'border-emerald-400 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 animate-pulse'
										: 'border-slate-700 bg-slate-800 cursor-default'}"
							>
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
						{#if round.playerDrewThird}
							<p class="mt-3 text-xs text-emerald-400">+3. Karte gezogen</p>
						{:else}
							<p class="mt-3 text-xs text-slate-500">Stand (kein Zug)</p>
						{/if}
					{/if}
				</div>

				<!-- Banker -->
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
					<div class="flex items-center justify-between">
						<p class="text-sm tracking-wide text-slate-400 uppercase font-semibold">Banker</p>
						{#if visibleScore(round.bankerCards, 'b') !== null}
							<span class="rounded-lg bg-slate-800 px-3 py-1 text-xl font-bold">
								{visibleScore(round.bankerCards, 'b')}
							</span>
						{/if}
					</div>

					<div class="mt-4 flex flex-wrap gap-3">
						<!-- Karte b0 -->
						{#if phase !== 'setup' && phase !== 'dealing'}
							<button
								onclick={() => revealCard('b0')}
								disabled={!isRevealable('b0')}
								class="relative h-24 w-16 rounded-xl border-2 shadow-lg transition
								{isRevealed('b0')
									? (isRed(round.bankerCards[0]) ? 'border-red-600 bg-white text-red-600' : 'border-slate-500 bg-white text-slate-900')
									: isRevealable('b0')
										? 'border-emerald-500 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105'
										: 'border-slate-700 bg-slate-800 cursor-default'}"
							>
								{#if isRevealed('b0')}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.bankerCards[0].rank}</span>
									<span class="text-2xl font-bold">{round.bankerCards[0].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.bankerCards[0].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/if}

						<!-- Karte b1 -->
						{#if phase !== 'setup' && phase !== 'dealing'}
							<button
								onclick={() => revealCard('b1')}
								disabled={!isRevealable('b1')}
								class="relative h-24 w-16 rounded-xl border-2 shadow-lg transition
								{isRevealed('b1')
									? (isRed(round.bankerCards[1]) ? 'border-red-600 bg-white text-red-600' : 'border-slate-500 bg-white text-slate-900')
									: isRevealable('b1')
										? 'border-emerald-500 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105'
										: 'border-slate-700 bg-slate-800 cursor-default'}"
							>
								{#if isRevealed('b1')}
									<span class="absolute top-1 left-1.5 text-xs font-bold leading-none">{round.bankerCards[1].rank}</span>
									<span class="text-2xl font-bold">{round.bankerCards[1].suit}</span>
									<span class="absolute bottom-1 right-1.5 text-xs font-bold leading-none rotate-180">{round.bankerCards[1].rank}</span>
								{:else}
									<span class="text-2xl text-slate-500">🂠</span>
								{/if}
							</button>
						{/if}

						<!-- Karte b2 (Drittkarte) — erscheint erst ab reveal-b3 -->
						{#if round.bankerDrewThird && (phase === 'reveal-b3' || phase === 'result')}
							<button
								onclick={() => revealCard('b2')}
								disabled={!isRevealable('b2')}
								class="relative h-24 w-16 rounded-xl border-2 shadow-lg transition ring-2 ring-violet-500/60
								{isRevealed('b2')
									? (isRed(round.bankerCards[2]) ? 'border-red-600 bg-white text-red-600' : 'border-slate-500 bg-white text-slate-900')
									: isRevealable('b2')
										? 'border-violet-400 bg-slate-700 hover:bg-slate-600 cursor-pointer hover:scale-105 animate-pulse'
										: 'border-slate-700 bg-slate-800 cursor-default'}"
							>
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
						{#if round.bankerDrewThird}
							<p class="mt-3 text-xs text-violet-400">+3. Karte gezogen</p>
						{:else}
							<p class="mt-3 text-xs text-slate-500">Stand (kein Zug)</p>
						{/if}
					{/if}
				</div>
			</div>

			<!-- ── Ergebnis ───────────────────────────────────────────────── -->
			{#if phase === 'result'}
				<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm tracking-wide text-slate-400 uppercase">Ergebnis</p>
							<p class="mt-1 text-2xl font-bold">{round.result}</p>
							{#if round.naturalHand}
								<p class="mt-1 text-xs text-amber-400">✨ Natural Hand</p>
							{/if}
						</div>
						<div class="text-right">
							<p class="text-sm text-slate-400">Dein Einsatz</p>
							<p class="mt-1 font-semibold text-white">{selectedBet} · {bet} CHF</p>
							<div class="mt-2 flex gap-3 justify-end text-sm text-slate-400">
								<span>P: <strong class="text-white">{round.playerScore}</strong></span>
								<span>B: <strong class="text-white">{round.bankerScore}</strong></span>
							</div>
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

		{/if}
	</div>
</main>