<script lang="ts">
	let { data } = $props();
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-5xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<h1 class="mt-6 text-5xl font-bold">Game History</h1>
		<p class="mt-4 text-lg text-slate-300">Alle gespeicherten Runden.</p>

		<div class="mt-12 grid gap-6">
			{#each data.games as game}
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
					<!-- Game Type Badge -->
					<div class="mb-4 flex items-center gap-3">
						<span
							class="rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase
							{game.game === 'baccarat'
								? 'bg-violet-900 text-violet-300'
								: 'bg-emerald-900 text-emerald-300'}"
						>
							{game.game === 'baccarat' ? '🎴 Baccarat' : '🃏 Blackjack'}
						</span>
					</div>

					<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<p class="text-sm tracking-wide text-slate-400 uppercase">Result</p>
							<h2 class="mt-2 text-3xl font-bold">{game.result}</h2>

							{#if game.game === 'baccarat'}
								<p class="mt-1 text-sm text-slate-400">
									Gesetzt auf: <span class="font-semibold text-white">{game.selectedBet}</span>
									—
									{#if game.playerWon}
										<span class="text-emerald-400 font-semibold">Gewonnen</span>
									{:else}
										<span class="text-red-400 font-semibold">Verloren</span>
									{/if}
								</p>
							{/if}
						</div>

						<div class="grid gap-6 text-center
							{game.game === 'baccarat' ? 'grid-cols-3' : 'grid-cols-3'}">
							<div>
								<p class="text-sm text-slate-400">Player</p>
								<p class="mt-2 text-2xl font-bold">{game.playerScore}</p>
							</div>

							<div>
								<p class="text-sm text-slate-400">
									{game.game === 'baccarat' ? 'Banker' : 'Dealer'}
								</p>
								<p class="mt-2 text-2xl font-bold">
									{game.game === 'baccarat' ? game.bankerScore : game.dealerScore}
								</p>
							</div>

							<div>
								<p class="text-sm text-slate-400">Bet</p>
								<p class="mt-2 text-2xl font-bold text-emerald-400">{game.bet} CHF</p>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</main>