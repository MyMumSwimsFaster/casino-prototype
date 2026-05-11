<script lang="ts">
	let { data } = $props();
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-5xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline"> ← Zurück zur Startseite </a>

		<h1 class="mt-6 text-5xl font-bold">Game History</h1>

		<p class="mt-4 text-lg text-slate-300">Alle gespeicherten Blackjack-Runden.</p>

		<div class="mt-12 grid gap-6">
			{#each data.games as game}
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
					<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
						<div>
							<p class="text-sm tracking-wide text-slate-400 uppercase">Result</p>

							<h2 class="mt-2 text-3xl font-bold">
								{game.result}
							</h2>
						</div>

						<div class="grid grid-cols-3 gap-6 text-center">
							<div>
								<p class="text-sm text-slate-400">Player</p>
								<p class="mt-2 text-2xl font-bold">
									{game.playerScore}
								</p>
							</div>

							<div>
								<p class="text-sm text-slate-400">Dealer</p>
								<p class="mt-2 text-2xl font-bold">
									{game.dealerScore}
								</p>
							</div>

							<div>
								<p class="text-sm text-slate-400">Bet</p>
								<p class="mt-2 text-2xl font-bold text-emerald-400">
									{game.bet} CHF
								</p>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</main>
