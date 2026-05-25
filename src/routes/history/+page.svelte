<script lang="ts">
	// ─── Types ────────────────────────────────────────────────────────────────
	// Alle Felder optional/nullable — defensiv gegen ältere DB-Einträge

	interface PlayerHandRecord {
		cards?:   string[];
		score?:   number;
		bet?:     number;
		doubled?: boolean;
		result?:  string | null;
		payout?:  number;
	}

	interface GameRecord {
		game:         'blackjack' | 'baccarat' | string;
		bet?:         number;
		result?:      string;
		netResult?:   number;   // gespeichert seit Bankroll-System
		payout?:      number;
		bankrollBefore?: number;
		bankrollAfter?:  number;
		// Blackjack
		playerHands?: PlayerHandRecord[];
		dealerCards?: string[];
		dealerScore?: number;
		// Baccarat
		selectedBet?: string;
		playerCards?: string[];
		bankerCards?: string[];
		playerScore?: number;
		bankerScore?: number;
		playerWon?:   boolean;
		naturalHand?: boolean;
		// Insurance (Blackjack)
		insuranceOffered?:  boolean;
		insuranceTaken?:    boolean;
		insuranceBet?:      number;
		insuranceResult?:   'won' | 'lost' | 'declined' | null;
		insurancePayout?:   number;
		// Sidebets (Blackjack)
		perfectPairsBet?:    number;
		perfectPairsResult?: 'perfect' | 'colored' | 'mixed' | 'lost' | null;
		perfectPairsPayout?: number;
		dealerBustBet?:      number;
		dealerBustResult?:   'won' | 'lost' | null;
		dealerBustPayout?:   number;
		// 21+3 Sidebet
		twentyOneThreeBet?:    number;
		twentyOneThreeResult?: string | null;
		twentyOneThreePayout?: number;
		twentyOneThreeCards?:  string[];
		// Legacy
		playerScore_legacy?: number;
		dealerScore_legacy?: number;
	}

	// ─── Props & State ────────────────────────────────────────────────────────
	let { data } = $props();
	let games    = $state<GameRecord[]>(
		Array.isArray((data as any)?.games) ? (data as any).games : []
	);
	let errorMsg = $state('');

	// ─── Stats aus games berechnen ────────────────────────────────────────────
	// Wird reaktiv neu berechnet wenn games sich ändert (z.B. nach Clear)

	interface HistoryStats {
		hands:    number;
		wins:     number;
		losses:   number;
		pushes:   number;
		winRate:  number;
		bestWin:  number;
		totalPnL: number;
	}

	// Leitet Win/Loss/Push für ein einzelnes Game ab.
	// Priorität: netResult > playerWon > result-String
	function classifyGame(g: GameRecord): 'win' | 'loss' | 'push' {
		// netResult ist am zuverlässigsten (seit Bankroll-System)
		if (typeof g.netResult === 'number') {
			if (g.netResult > 0)  return 'win';
			if (g.netResult < 0)  return 'loss';
			return 'push';
		}
		// Baccarat mit playerWon-Flag
		if (g.game === 'baccarat' && typeof g.playerWon === 'boolean') {
			if (g.playerWon) return 'win';
			// Tie-Ergebnis bei P/B-Wette = Push
			if (g.result === 'Tie') return 'push';
			return 'loss';
		}
		// Blackjack: Ergebnis der ersten Hand
		const r = g.result ?? '';
		if (['win','blackjack','dealer-bust'].includes(r)) return 'win';
		if (['push'].includes(r))                          return 'push';
		return 'loss';
	}

	// Netto-Betrag pro Game (positiv = Gewinn, negativ = Verlust, 0 = Push)
	function gameNet(g: GameRecord): number {
		if (typeof g.netResult === 'number') return g.netResult;
		// Aus bankrollBefore/After ableiten
		if (typeof g.bankrollBefore === 'number' && typeof g.bankrollAfter === 'number') {
			return Math.round((g.bankrollAfter - g.bankrollBefore) * 100) / 100;
		}
		return 0;
	}

	let historyStats = $derived.by(() => {
		const s: HistoryStats = { hands: 0, wins: 0, losses: 0, pushes: 0, winRate: 0, bestWin: 0, totalPnL: 0 };
		if (games.length === 0) return s;

		for (const g of games) {
			s.hands++;
			const cls = classifyGame(g);
			const net = gameNet(g);

			if (cls === 'win') {
				s.wins++;
				if (net > s.bestWin) s.bestWin = net;
			} else if (cls === 'loss') {
				s.losses++;
			} else {
				s.pushes++;
			}
			s.totalPnL += net;
		}

		const finished = s.wins + s.losses + s.pushes;
		s.winRate  = finished > 0 ? Math.round((s.wins / finished) * 1000) / 10 : 0;
		s.totalPnL = Math.round(s.totalPnL * 100) / 100;
		s.bestWin  = Math.round(s.bestWin * 100) / 100;
		return s;
	});

	// ─── Hilfsfunktionen ─────────────────────────────────────────────────────

	function isRed(suit: string): boolean { return suit === '♥' || suit === '♦'; }

	function parseCard(label: string): { rank: string; suit: string } {
		return { suit: label.slice(-1), rank: label.slice(0, -1) };
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

	function netColor(net: number): string {
		if (net > 0) return 'text-emerald-400';
		if (net < 0) return 'text-red-400';
		return 'text-amber-400';
	}

	async function clearHistory() {
		if (!confirm('Are you sure you want to delete all history?')) return;
		errorMsg = '';
		try {
			const res = await fetch('/api/clear-history', { method: 'POST' });
			if (!res.ok) throw new Error(`Server error: ${res.status}`);
			games = [];
		} catch (e) {
			errorMsg = 'Failed to clear history. Please try again.';
			console.error(e);
		}
	}
</script>

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white">
	<div class="mx-auto max-w-5xl">
		<a href="/" class="text-sm text-emerald-400 hover:underline">← Zurück zur Startseite</a>

		<div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 class="text-5xl font-bold">Game History</h1>
				<p class="mt-4 text-lg text-slate-300">Alle gespeicherten Runden.</p>
			</div>
			{#if games.length > 0}
				<button
					onclick={clearHistory}
					class="shrink-0 self-start rounded-xl border border-red-800 bg-red-950 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-900 hover:text-red-300 active:scale-95"
				>
					🗑 Clear History
				</button>
			{/if}
		</div>

		{#if errorMsg}
			<div class="mt-4 rounded-xl border border-red-800 bg-red-950/50 px-5 py-3 text-sm text-red-400">{errorMsg}</div>
		{/if}

		<!-- ── Stats aus History-Daten ────────────────────────────────────── -->
		{#if games.length > 0}
			<div class="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
				<p class="mb-4 text-xs font-semibold tracking-widest text-slate-500 uppercase">History Stats</p>

				<!-- P&L + Win Rate gross -->
				<div class="mb-4 grid grid-cols-2 gap-3">
					<div class="rounded-xl bg-slate-800/60 px-4 py-3">
						<p class="text-xs text-slate-500 uppercase tracking-wide">Total P&L</p>
						<p class="mt-1 text-2xl font-bold {netColor(historyStats.totalPnL)}">
							{historyStats.totalPnL > 0 ? '+' : ''}{historyStats.totalPnL.toFixed(2)}
							<span class="text-sm font-normal text-slate-400">CHF</span>
						</p>
					</div>
					<div class="rounded-xl bg-slate-800/60 px-4 py-3">
						<p class="text-xs text-slate-500 uppercase tracking-wide">Win Rate</p>
						<p class="mt-1 text-2xl font-bold {historyStats.winRate >= 50 ? 'text-emerald-400' : historyStats.winRate > 0 ? 'text-amber-400' : 'text-slate-400'}">
							{historyStats.winRate.toFixed(1)}%
						</p>
					</div>
				</div>

				<!-- 5 kleinere Stats -->
				<div class="grid grid-cols-5 gap-2">
					<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
						<p class="text-[10px] text-slate-500 uppercase tracking-wide">Hands</p>
						<p class="mt-0.5 text-xl font-bold text-white">{historyStats.hands}</p>
					</div>
					<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
						<p class="text-[10px] text-slate-500 uppercase tracking-wide">Wins</p>
						<p class="mt-0.5 text-xl font-bold {historyStats.wins > 0 ? 'text-emerald-400' : 'text-slate-400'}">{historyStats.wins}</p>
					</div>
					<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
						<p class="text-[10px] text-slate-500 uppercase tracking-wide">Losses</p>
						<p class="mt-0.5 text-xl font-bold {historyStats.losses > 0 ? 'text-red-400' : 'text-slate-400'}">{historyStats.losses}</p>
					</div>
					<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
						<p class="text-[10px] text-slate-500 uppercase tracking-wide">Pushes</p>
						<p class="mt-0.5 text-xl font-bold text-amber-400">{historyStats.pushes}</p>
					</div>
					<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
						<p class="text-[10px] text-slate-500 uppercase tracking-wide">Best Win</p>
						<p class="mt-0.5 text-xl font-bold {historyStats.bestWin > 0 ? 'text-emerald-400' : 'text-slate-400'}">
							{historyStats.bestWin > 0 ? '+' + historyStats.bestWin.toFixed(0) : '—'}
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- ── Game List ──────────────────────────────────────────────────── -->
		<div class="mt-8 grid gap-6">
			{#if games.length === 0}
				<p class="text-slate-500">Keine Runden gespeichert.</p>
			{/if}

			{#each games as game}
				{@const net = gameNet(game)}
				<div class="rounded-2xl border border-slate-800 bg-slate-900 p-6">

					<!-- Badge-Zeile + Netto -->
					<div class="mb-4 flex items-center justify-between gap-3">
						<div class="flex items-center gap-3">
							<span class="rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase
								{game.game === 'baccarat' ? 'bg-violet-900 text-violet-300' : 'bg-emerald-900 text-emerald-300'}">
								{game.game === 'baccarat' ? '🎴 Baccarat' : '🃏 Blackjack'}
							</span>
							{#if game.game === 'baccarat' && game.naturalHand}
								<span class="rounded-full bg-amber-900/50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-300 uppercase">✨ Natural</span>
							{/if}
						</div>
						{#if net !== 0 || game.netResult !== undefined}
							<span class="text-sm font-bold {netColor(net)}">
								{net > 0 ? '+' : ''}{net.toFixed(2)} CHF
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
									<p class="mt-2 text-2xl font-bold">{game.playerScore ?? '—'}</p>
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
									<p class="mt-2 text-2xl font-bold">{game.bankerScore ?? '—'}</p>
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
								{#if typeof game.payout === 'number'}
									<p class="text-sm text-slate-400">Auszahlung: {game.payout.toFixed(2)} CHF</p>
								{/if}
							</div>
						</div>

					<!-- ── Blackjack (neues Schema mit playerHands) ─────────── -->
					{:else if game.playerHands && game.playerHands.length > 0}
						<div class="flex flex-col gap-4">
							<div>
								<p class="mb-2 text-xs tracking-wide text-slate-400 uppercase">
									Dealer · {game.dealerScore ?? '—'}
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
							{#each game.playerHands as hand, hi}
								<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
									<div class="flex items-center justify-between mb-3">
										<p class="text-xs tracking-wide text-slate-400 uppercase">
											{(game.playerHands?.length ?? 0) > 1 ? `Hand ${hi + 1}` : 'Player'}
											{#if hand.doubled}<span class="ml-2 text-amber-400">(Doubled)</span>{/if}
										</p>
										<div class="flex items-center gap-3">
											<span class="text-sm text-slate-400">{hand.bet ?? '—'} CHF</span>
											{#if typeof hand.payout === 'number' && hand.payout > 0}
												<span class="text-sm text-emerald-400">→ {hand.payout.toFixed(2)}</span>
											{/if}
											<span class="font-bold {resultColor(hand.result ?? '')}">
												{resultLabel(hand.result ?? '')}
											</span>
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
									<p class="mt-2 text-lg font-bold text-slate-300">{hand.score ?? '—'}</p>
								</div>
							{/each}
						</div>

					<!-- Sidebets -->
					{#if (game.perfectPairsBet ?? 0) > 0 || (game.dealerBustBet ?? 0) > 0 || (game.twentyOneThreeBet ?? 0) > 0}
						<div class="mt-3 flex flex-wrap gap-2">
							{#if (game.perfectPairsBet ?? 0) > 0}
								<div class="rounded-lg px-3 py-1.5 text-xs font-semibold
									{(game.perfectPairsPayout ?? 0) > 0 ? 'bg-violet-950/50 border border-violet-700/50 text-violet-300' : 'bg-slate-800 border border-slate-700 text-slate-500'}">
									{(game.perfectPairsPayout ?? 0) > 0 ? `✅ PP +${(game.perfectPairsPayout ?? 0).toFixed(2)} CHF` : `❌ PP –${(game.perfectPairsBet ?? 0).toFixed(2)} CHF`}
								</div>
							{/if}
							{#if (game.dealerBustBet ?? 0) > 0}
								<div class="rounded-lg px-3 py-1.5 text-xs font-semibold
									{game.dealerBustResult === 'won' ? 'bg-red-950/40 border border-red-700/50 text-red-300' : 'bg-slate-800 border border-slate-700 text-slate-500'}">
									{game.dealerBustResult === 'won' ? `💥 DB +${(game.dealerBustPayout ?? 0).toFixed(2)} CHF` : `💥 DB –${(game.dealerBustBet ?? 0).toFixed(2)} CHF`}
								</div>
							{/if}
							{#if (game.twentyOneThreeBet ?? 0) > 0}
								<div class="rounded-lg px-3 py-1.5 text-xs font-semibold
									{(game.twentyOneThreePayout ?? 0) > 0 ? 'bg-cyan-950/40 border border-cyan-700/50 text-cyan-300' : 'bg-slate-800 border border-slate-700 text-slate-500'}">
									{#if (game.twentyOneThreePayout ?? 0) > 0}
										✨ 21+3 {game.twentyOneThreeResult} · +{(game.twentyOneThreePayout ?? 0).toFixed(2)} CHF
									{:else}
										❌ 21+3 lost · –{(game.twentyOneThreeBet ?? 0).toFixed(2)} CHF
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<!-- ── Blackjack (altes Schema, rückwärtskompatibel) ──────── -->
					{:else}
						<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
							<div>
								<p class="text-sm tracking-wide text-slate-400 uppercase">Result</p>
								<h2 class="mt-2 text-3xl font-bold">{game.result}</h2>
							</div>
							<div class="grid grid-cols-3 gap-6 text-center">
								<div><p class="text-sm text-slate-400">Player</p><p class="mt-2 text-2xl font-bold">{(game as any).playerScore ?? '—'}</p></div>
								<div><p class="text-sm text-slate-400">Dealer</p><p class="mt-2 text-2xl font-bold">{(game as any).dealerScore ?? '—'}</p></div>
								<div><p class="text-sm text-slate-400">Bet</p><p class="mt-2 text-2xl font-bold text-emerald-400">{game.bet} CHF</p></div>
							</div>
						</div>
					{/if}

				</div>
			{/each}
		</div>
	</div>
</main>