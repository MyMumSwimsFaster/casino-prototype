<script lang="ts">
	let { data } = $props();

	function isRed(suit: string): boolean {
		return suit === '♥' || suit === '♦';
	}

	function parseCard(label: string): { rank: string; suit: string } {
		const suit = label.slice(-1);
		const rank = label.slice(0, -1);
		return { rank, suit };
	}

	function resultColor(result: string): string {
		if (['blackjack','win','dealer-bust'].includes(result)) return 'text-emerald-400';
		if (result === 'push') return 'text-amber-400';
		return 'text-red-400';
	}

	function resultLabel(result: string): string {
		switch (result) {
			case 'blackjack':   return '🎉 Blackjack';
			case 'win':         return '✅ Win';
			case 'dealer-bust': return '✅ Dealer Bust';
			case 'push':        return '🤝 Push';
			case 'lose':        return '❌ Lose';
			case 'bust':        return '💥 Bust';
			default:            return result ?? '—';
		}
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-5xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<h1 class="mt-6 text-5xl font-bold">Game History</h1>
		<p class="mt-4 text-lg text-slate-300">Alle gespeicherten Runden.</p>

		<div class="mt-12 grid gap-6">
			{#each data.games as game}
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">

					<!-- Badge -->
					<div class="mb-4 flex items-center gap-3">
						<span
							class="rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase
							{game.game === 'baccarat' ? 'bg-violet-900 text-violet-300' : 'bg-emerald-900 text-emerald-300'}"
						>
							{game.game === 'baccarat' ? '🎴 Baccarat' : '🃏 Blackjack'}
						</span>
						{#if game.game === 'baccarat' && game.naturalHand}
							<span class="rounded-full bg-amber-900/50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-300 uppercase">
								✨ Natural
							</span>
						{/if}
					</div>

					<!-- ── Baccarat ──────────────────────────────────────────── -->
					{#if game.game === 'baccarat'}
						<div class="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
							<div class="flex gap-6">
								<div>
									<p class="mb-2 text-xs tracking-wide text-slate-400 uppercase">Player</p>
									<div class="flex gap-1">
										{#each (game.playerCards ?? []) as label}
											{@const card = parseCard(label)}
											<div class="flex h-12 w-9 flex-col items-center justify-center rounded-md border text-xs font-bold leading-tight shadow
												{isRed(card.suit) ? 'border-red-700 bg-slate-800 text-red-400' : 'border-slate-600 bg-slate-800 text-white'}">
												<span>{card.rank}</span><span>{card.suit}</span>
											</div>
										{/each}
									</div>
									<p class="mt-2 text-2xl font-bold">{game.playerScore}</p>
								</div>
								<div>
									<p class="mb-2 text-xs tracking-wide text-slate-400 uppercase">Banker</p>
									<div class="flex gap-1">
										{#each (game.bankerCards ?? []) as label}
											{@const card = parseCard(label)}
											<div class="flex h-12 w-9 flex-col items-center justify-center rounded-md border text-xs font-bold leading-tight shadow
												{isRed(card.suit) ? 'border-red-700 bg-slate-800 text-red-400' : 'border-slate-600 bg-slate-800 text-white'}">
												<span>{card.rank}</span><span>{card.suit}</span>
											</div>
										{/each}
									</div>
									<p class="mt-2 text-2xl font-bold">{game.bankerScore}</p>
								</div>
							</div>
							<div class="text-right">
								<p class="text-sm tracking-wide text-slate-400 uppercase">Result</p>
								<h2 class="mt-1 text-2xl font-bold">{game.result}</h2>
								<p class="mt-1 text-sm text-slate-400">
									Gesetzt auf <span class="font-semibold text-white">{game.selectedBet}</span>
									—
									{#if game.playerWon}
										<span class="font-semibold text-emerald-400">Gewonnen</span>
									{:else}
										<span class="font-semibold text-red-400">Verloren</span>
									{/if}
								</p>
								<p class="mt-2 text-xl font-bold text-emerald-400">{game.bet} CHF</p>
							</div>
						</div>

					<!-- ── Blackjack (neues Schema mit playerHands) ─────────── -->
					{:else if game.playerHands}
						<div class="flex flex-col gap-4">
							<!-- Dealer -->
							<div>
								<p class="mb-2 text-xs tracking-wide text-slate-400 uppercase">
									Dealer · {game.dealerScore}
								</p>
								<div class="flex flex-wrap gap-1">
									{#each (game.dealerCards ?? []) as label}
										{@const card = parseCard(label)}
										<div class="flex h-12 w-9 flex-col items-center justify-center rounded-md border text-xs font-bold leading-tight shadow
											{isRed(card.suit) ? 'border-red-700 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}">
											<span>{card.rank}</span><span>{card.suit}</span>
										</div>
									{/each}
								</div>
							</div>

							<!-- Player Hands -->
							{#each game.playerHands as hand, hi}
								<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
									<div class="flex items-center justify-between mb-3">
										<p class="text-xs tracking-wide text-slate-400 uppercase">
											{game.playerHands.length > 1 ? `Hand ${hi + 1}` : 'Player'}
											{#if hand.doubled}<span class="ml-2 text-amber-400">(Doubled)</span>{/if}
										</p>
										<div class="flex items-center gap-3">
											<span class="text-sm text-slate-400">{hand.bet} CHF</span>
											<span class="font-bold {resultColor(hand.result ?? '')}">{resultLabel(hand.result ?? '')}</span>
										</div>
									</div>
									<div class="flex flex-wrap gap-1">
										{#each (hand.cards ?? []) as label}
											{@const card = parseCard(label)}
											<div class="flex h-12 w-9 flex-col items-center justify-center rounded-md border text-xs font-bold leading-tight shadow
												{isRed(card.suit) ? 'border-red-700 bg-white text-red-600' : 'border-slate-400 bg-white text-slate-900'}">
												<span>{card.rank}</span><span>{card.suit}</span>
											</div>
										{/each}
									</div>
									<p class="mt-2 text-lg font-bold text-slate-300">{hand.score}</p>
								</div>
							{/each}
						</div>

					<!-- ── Blackjack (altes Schema, rückwärtskompatibel) ─────── -->
					{:else}
						<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
							<div>
								<p class="text-sm tracking-wide text-slate-400 uppercase">Result</p>
								<h2 class="mt-2 text-3xl font-bold">{game.result}</h2>
							</div>
							<div class="grid grid-cols-3 gap-6 text-center">
								<div>
									<p class="text-sm text-slate-400">Player</p>
									<p class="mt-2 text-2xl font-bold">{game.playerScore}</p>
								</div>
								<div>
									<p class="text-sm text-slate-400">Dealer</p>
									<p class="mt-2 text-2xl font-bold">{game.dealerScore}</p>
								</div>
								<div>
									<p class="text-sm text-slate-400">Bet</p>
									<p class="mt-2 text-2xl font-bold text-emerald-400">{game.bet} CHF</p>
								</div>
							</div>
						</div>
					{/if}

				</div>
			{/each}
		</div>
	</div>
</main>