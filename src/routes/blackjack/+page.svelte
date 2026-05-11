<script lang="ts">
	let bet = $state(100);
	let result = $state('');
	let dealerScore = $state(0);
	let playerScore = $state(0);
	let saveMessage = $state('');

	async function playGame() {
		playerScore = Math.floor(Math.random() * 11) + 12;
		dealerScore = Math.floor(Math.random() * 11) + 12;

		if (playerScore > 21) {
			result = 'Dealer wins!';
		} else if (dealerScore > 21) {
			result = 'You won!';
		} else if (playerScore > dealerScore) {
			result = 'You won!';
		} else if (playerScore === dealerScore) {
			result = 'Draw!';
		} else {
			result = 'Dealer wins!';
		}

		try {
			const response = await fetch('/api/save-game', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					bet,
					playerScore,
					dealerScore,
					result
				})
			});

			if (response.ok) {
				saveMessage = 'Runde wurde gespeichert.';
			} else {
				saveMessage = 'Fehler beim Speichern.';
			}
		} catch (error) {
			saveMessage = 'Serverfehler.';
			console.error(error);
		}
	}
</script>

```svelte
<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-4xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline"> ← Zurück zur Startseite </a>

		<h1 class="mt-6 text-5xl font-bold">Blackjack</h1>

		<p class="mt-4 text-lg text-slate-300">Simuliere eine Blackjack-Runde mit Einsatz.</p>

		<section class="mt-12 rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
			<label for="bet" class="mb-2 block text-sm text-slate-400"> Einsatzbetrag </label>

			<div class="flex flex-col gap-4 md:flex-row">
				<input
					id="bet"
					type="number"
					min="1"
					bind:value={bet}
					class="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-lg text-white outline-none focus:border-emerald-500"
				/>

				<button
					type="button"
					onclick={playGame}
					class="cursor-pointer rounded-2xl bg-emerald-500 px-8 py-4 font-bold text-slate-950 transition hover:bg-emerald-400"
				>
					Runde starten
				</button>
			</div>

			{#if result}
				<div class="mt-10 rounded-2xl bg-slate-950 p-8">
					<h2 class="text-3xl font-bold">
						{result}
					</h2>

					<div class="mt-8 grid gap-6 md:grid-cols-2">
						<div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
							<p class="text-sm tracking-wide text-slate-400 uppercase">Player</p>

							<p class="mt-4 text-5xl font-bold">
								{playerScore}
							</p>
						</div>

						<div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">
							<p class="text-sm tracking-wide text-slate-400 uppercase">Dealer</p>

							<p class="mt-4 text-5xl font-bold">
								{dealerScore}
							</p>
						</div>
					</div>

					<p class="mt-8 text-emerald-300">
						Einsatz:
						<span class="font-bold">{bet} CHF</span>
					</p>

					{#if saveMessage}
						<p class="mt-4 text-sm text-slate-400">
							{saveMessage}
						</p>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</main>
```
