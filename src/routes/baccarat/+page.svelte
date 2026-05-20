<script lang="ts">
	type Bet = 'Player' | 'Banker' | 'Tie';
	type GameResult = 'Player wins' | 'Banker wins' | 'Tie';

	let bet = $state<number>(10);
	let selectedBet = $state<Bet>('Player');

	let playerScore = $state<number | null>(null);
	let bankerScore = $state<number | null>(null);
	let gameResult = $state<GameResult | null>(null);
	let playerWon = $state<boolean | null>(null);
	let isLoading = $state(false);
	let saved = $state(false);

	async function startRound() {
		if (!bet || bet <= 0) return;

		isLoading = true;
		saved = false;
		playerScore = null;
		bankerScore = null;
		gameResult = null;
		playerWon = null;

		await new Promise((r) => setTimeout(r, 400));

		const p = Math.floor(Math.random() * 10);
		const b = Math.floor(Math.random() * 10);

		let result: GameResult;
		if (p > b) result = 'Player wins';
		else if (b > p) result = 'Banker wins';
		else result = 'Tie';

		playerScore = p;
		bankerScore = b;
		gameResult = result;

		const won =
			(selectedBet === 'Player' && result === 'Player wins') ||
			(selectedBet === 'Banker' && result === 'Banker wins') ||
			(selectedBet === 'Tie' && result === 'Tie');

		playerWon = won;
		isLoading = false;

		// Save to MongoDB
		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'baccarat',
					bet,
					selectedBet,
					playerScore: p,
					bankerScore: b,
					result,
					playerWon: won
				})
			});
			saved = true;
		} catch (e) {
			console.error('Failed to save game:', e);
		}
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<h1 class="mt-6 text-5xl font-bold">🎴 Baccarat</h1>
		<p class="mt-3 text-slate-400">Setze auf Player, Banker oder Tie und starte die Runde.</p>

		<!-- Bet Input -->
		<div class="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6">
			<label class="block text-sm tracking-wide text-slate-400 uppercase">Einsatz (CHF)</label>
			<input
				type="number"
				min="1"
				bind:value={bet}
				class="mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-xl font-semibold text-white focus:border-emerald-500 focus:outline-none"
			/>
		</div>

		<!-- Bet Selection -->
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

		<!-- Start Button -->
		<button
			onclick={startRound}
			disabled={isLoading || !bet || bet <= 0}
			class="mt-6 w-full rounded-2xl bg-emerald-600 px-8 py-4 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{isLoading ? 'Wird gespielt…' : 'Runde starten'}
		</button>

		<!-- Result -->
		{#if gameResult !== null && playerScore !== null && bankerScore !== null}
			<div class="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
				<p class="text-sm tracking-wide text-slate-400 uppercase">Ergebnis</p>

				<div class="mt-4 grid grid-cols-3 gap-4 text-center">
					<div>
						<p class="text-sm text-slate-400">Player</p>
						<p class="mt-1 text-4xl font-bold">{playerScore}</p>
					</div>
					<div>
						<p class="text-sm text-slate-400">Banker</p>
						<p class="mt-1 text-4xl font-bold">{bankerScore}</p>
					</div>
					<div>
						<p class="text-sm text-slate-400">Dein Einsatz</p>
						<p class="mt-1 text-2xl font-bold text-emerald-400">{selectedBet}</p>
					</div>
				</div>

				<div class="mt-6 border-t border-slate-800 pt-5 text-center">
					<p class="text-lg text-slate-300">{gameResult}</p>
					<p
						class="mt-2 text-3xl font-bold
						{playerWon ? 'text-emerald-400' : 'text-red-400'}"
					>
						{playerWon ? '🏆 Gewonnen!' : '💸 Verloren'}
					</p>
					{#if saved}
						<p class="mt-3 text-sm text-slate-500">✓ Runde gespeichert</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</main>