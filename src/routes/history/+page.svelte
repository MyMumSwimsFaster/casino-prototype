<script lang="ts">
	import { onMount }          from 'svelte';
	import { guestHistoryLoad, guestHistoryClear } from '$lib/guestHistory';

	// ─── Types (identical to original) ───────────────────────────────────────
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
		netResult?:   number;
		payout?:      number;
		bankrollBefore?: number;
		bankrollAfter?:  number;
		playerHands?: PlayerHandRecord[];
		dealerCards?: string[];
		dealerScore?: number;
		selectedBet?: string;
		playerCards?: string[];
		bankerCards?: string[];
		playerScore?: number;
		bankerScore?: number;
		playerWon?:   boolean;
		naturalHand?: boolean;
		insuranceOffered?:  boolean;
		insuranceTaken?:    boolean;
		insuranceBet?:      number;
		insuranceResult?:   'won' | 'lost' | 'declined' | null;
		insurancePayout?:   number;
		perfectPairsBet?:    number;
		perfectPairsResult?: 'perfect' | 'colored' | 'mixed' | 'lost' | null;
		perfectPairsPayout?: number;
		dealerBustBet?:      number;
		dealerBustResult?:   'won' | 'lost' | null;
		dealerBustPayout?:   number;
		twentyOneThreeBet?:    number;
		twentyOneThreeResult?: string | null;
		twentyOneThreePayout?: number;
		twentyOneThreeCards?:  string[];
		playerScore_legacy?: number;
		dealerScore_legacy?: number;
	}

	// ─── State ───────────────────────────────────────────────────────────────
	let { data } = $props();
	let games    = $state<GameRecord[]>(Array.isArray((data as any)?.games) ? (data as any).games : []);
	let errorMsg = $state('');
	let mounted  = $state(false);

	// Count-up state
	let animPnL      = $state(0);
	let animWR       = $state(0);
	let animHands    = $state(0);
	let animWins     = $state(0);
	let animLosses   = $state(0);
	let animPushes   = $state(0);
	let animBestWin  = $state(0);

	// ─── Helpers (identical logic) ───────────────────────────────────────────
	function isRed(suit: string): boolean { return suit === '♥' || suit === '♦'; }
	function parseCard(label: string): { rank: string; suit: string } {
		return { suit: label.slice(-1), rank: label.slice(0, -1) };
	}
	function classifyGame(g: GameRecord): 'win' | 'loss' | 'push' {
		if (typeof g.netResult === 'number') {
			if (g.netResult > 0) return 'win';
			if (g.netResult < 0) return 'loss';
			return 'push';
		}
		if (g.game === 'baccarat' && typeof g.playerWon === 'boolean') {
			if (g.playerWon) return 'win';
			if (g.result === 'Tie') return 'push';
			return 'loss';
		}
		const r = g.result ?? '';
		if (['win','blackjack','dealer-bust'].includes(r)) return 'win';
		if (['push'].includes(r)) return 'push';
		return 'loss';
	}
	function gameNet(g: GameRecord): number {
		if (typeof g.netResult === 'number') return g.netResult;
		if (typeof g.bankrollBefore === 'number' && typeof g.bankrollAfter === 'number')
			return Math.round((g.bankrollAfter - g.bankrollBefore) * 100) / 100;
		return 0;
	}

	interface HistoryStats {
		hands: number; wins: number; losses: number; pushes: number;
		winRate: number; bestWin: number; totalPnL: number;
		bestGame?: GameRecord;
	}
	let historyStats = $derived.by(() => {
		const s: HistoryStats = { hands:0, wins:0, losses:0, pushes:0, winRate:0, bestWin:0, totalPnL:0 };
		if (games.length === 0) return s;
		let bestGame: GameRecord | undefined;
		for (const g of games) {
			s.hands++;
			const cls = classifyGame(g);
			const net = gameNet(g);
			if (cls === 'win') { s.wins++; if (net > s.bestWin) { s.bestWin = net; bestGame = g; } }
			else if (cls === 'loss') s.losses++;
			else s.pushes++;
			s.totalPnL += net;
		}
		const finished = s.wins + s.losses + s.pushes;
		s.winRate  = finished > 0 ? Math.round((s.wins / finished) * 1000) / 10 : 0;
		s.totalPnL = Math.round(s.totalPnL * 100) / 100;
		s.bestWin  = Math.round(s.bestWin * 100) / 100;
		s.bestGame = bestGame;
		return s;
	});

	// Result tier for visual emphasis
	function resultTier(g: GameRecord): 'blackjack' | 'natural' | 'bust-win' | 'win' | 'push' | 'loss' {
		const net = gameNet(g);
		if (g.game === 'baccarat' && g.naturalHand) return 'natural';
		const r = g.playerHands?.[0]?.result ?? g.result ?? '';
		if (r === 'blackjack') return 'blackjack';
		if (r === 'dealer-bust') return 'bust-win';
		if (classifyGame(g) === 'win') return 'win';
		if (classifyGame(g) === 'push') return 'push';
		return 'loss';
	}

	function tierBadge(tier: ReturnType<typeof resultTier>): string {
		switch(tier) {
			case 'blackjack': return '♠ BLACKJACK';
			case 'natural':   return '✦ NATURAL';
			case 'bust-win':  return '💥 DEALER BUST';
			case 'win':       return '✓ WIN';
			case 'push':      return '◈ PUSH';
			case 'loss':      return '✗ LOSS';
		}
	}

	function resultLabel(result: string): string {
		switch (result) {
			case 'blackjack':   return '♠ Blackjack';
			case 'win':         return '✓ Win';
			case 'dealer-bust': return '💥 Dealer Bust';
			case 'push':        return '◈ Push';
			case 'lose':        return '✗ Lose';
			case 'bust':        return '✗ Bust';
			default:            return result ?? '—';
		}
	}

	// Group games by session proximity (gap > 1h = new group)
	function groupedGames(): { label: string; games: GameRecord[] }[] {
		if (games.length === 0) return [];
		// Without timestamps, just show all as one group
		return [{ label: 'Session Archive', games: [...games].reverse() }];
	}

	// Count-up
	function countUp(target: number, setter: (v: number) => void, duration = 900) {
		const steps = 32; const step = target / steps; const delay = duration / steps;
		let i = 0;
		const tick = () => { i++; if (i >= steps) { setter(target); return; } setter(Math.round(step*i*100)/100); setTimeout(tick, delay); };
		setTimeout(tick, delay);
	}
	function runCountUp() {
		const s = historyStats;
		countUp(s.totalPnL, v => animPnL = v, 1100);
		countUp(s.winRate,  v => animWR = v, 900);
		countUp(s.hands,    v => animHands = Math.round(v), 700);
		countUp(s.wins,     v => animWins = Math.round(v), 750);
		countUp(s.losses,   v => animLosses = Math.round(v), 750);
		countUp(s.pushes,   v => animPushes = Math.round(v), 750);
		countUp(s.bestWin,  v => animBestWin = v, 1000);
	}

	async function clearHistory() {
		if (!confirm('Delete all history?')) return;
		errorMsg = '';
		const isGuest = !(data as any)?.user;
		if (isGuest) {
			// Guest: clear sessionStorage only — no server call needed
			guestHistoryClear();
			games = [];
			return;
		}
		// Logged-in: delete from MongoDB (scoped to this user by the server)
		try {
			const res = await fetch('/api/clear-history', { method: 'POST' });
			if (!res.ok) throw new Error();
			games = [];
		} catch (e) {
			errorMsg = 'Failed to clear history.';
		}
	}

	onMount(() => {
		// If guest (no user in server data), load history from sessionStorage
		const isGuest = !(data as any)?.user;
		if (isGuest) {
			const guestGames = guestHistoryLoad();
			// Cast to GameRecord[] — the shape is compatible
			games = guestGames as unknown as GameRecord[];
		}
		setTimeout(() => { mounted = true; }, 60);
		setTimeout(() => runCountUp(), 400);
	});

	const groups = $derived(groupedGames());
</script>

<div class="hist-root">

	<!-- Background -->
	<div class="hist-bg" aria-hidden="true">
		<div class="hbg-r1"></div>
		<div class="hbg-r2"></div>
		<div class="hbg-noise"></div>
	</div>

	<div class="hist-content {mounted ? 'content-in' : ''}">

		<!-- Back nav -->
		<a href="/" class="hist-back">← Lobby</a>

		<!-- HERO -->
		<header class="hist-hero">
			<div class="hist-hero-badge">CASINO ARCHIVE</div>
			<h1 class="hist-hero-title">
				<span class="hht-suit">♠</span>
				<span class="hht-name">SESSION JOURNAL</span>
				<span class="hht-suit hht-suit-r">♥</span>
			</h1>
			<p class="hist-hero-sub">Every hand. Every bet. Every moment.</p>
			<div class="hist-divider">
				<span class="hdiv-line"></span>
				<span class="hdiv-diamond">◆</span>
				<span class="hdiv-line"></span>
			</div>
		</header>

		{#if errorMsg}
			<div class="hist-error">{errorMsg}</div>
		{/if}

		{#if games.length > 0}

			<!-- BEST WIN TROPHY -->
			{#if historyStats.bestGame}
				{@const bg = historyStats.bestGame}
				{@const isBAC = bg.game === 'baccarat'}
				<section class="trophy-section" style="animation-delay:.1s">
					<div class="trophy-card">
						<div class="trophy-shimmer"></div>
						<div class="trophy-left">
							<span class="trophy-icon">🏆</span>
							<div>
								<p class="trophy-label">BIGGEST WIN</p>
								<p class="trophy-amount">+{historyStats.bestWin.toFixed(2)} CHF</p>
								<p class="trophy-game">{isBAC ? '♦ BACCARAT' : '♠ BLACKJACK'}{bg.naturalHand ? ' · Natural' : ''}</p>
							</div>
						</div>
						<!-- Cards from best game -->
						<div class="trophy-cards">
							{#if isBAC && bg.playerCards}
								{#each (bg.playerCards ?? []).slice(0,3) as lbl}
									{@const c = parseCard(lbl)}
									<div class="hist-card {isRed(c.suit) ? 'hc-red' : 'hc-black'}">
										<span class="hc-rank">{c.rank}</span>
										<span class="hc-suit">{c.suit}</span>
									</div>
								{/each}
							{:else if bg.playerHands?.[0]?.cards}
								{#each (bg.playerHands[0].cards ?? []).slice(0,3) as lbl}
									{@const c = parseCard(lbl)}
									<div class="hist-card {isRed(c.suit) ? 'hc-red' : 'hc-black'}">
										<span class="hc-rank">{c.rank}</span>
										<span class="hc-suit">{c.suit}</span>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</section>
			{/if}

			<!-- STATS GRID -->
			<section class="stats-section" style="animation-delay:.18s">
				<div class="stats-top">
					<div class="stat-primary pnl-card {animPnL > 0 ? 'pnl-pos' : animPnL < 0 ? 'pnl-neg' : ''}">
						<span class="sp-label">TOTAL P&L</span>
						<span class="sp-val {animPnL > 0 ? 'sv-green' : animPnL < 0 ? 'sv-red' : 'sv-neutral'}">
							{animPnL > 0 ? '+' : ''}{animPnL.toFixed(2)}
						</span>
						<span class="sp-cur">CHF</span>
					</div>
					<div class="stat-primary wr-card">
						<span class="sp-label">WIN RATE</span>
						<span class="sp-val {animWR >= 50 ? 'sv-green' : animWR > 0 ? 'sv-amber' : 'sv-neutral'}">
							{historyStats.hands > 0 ? animWR.toFixed(1) + '%' : '—'}
						</span>
					</div>
				</div>
				<div class="stats-grid">
					<div class="stat-cell">
						<span class="sc-val">{animHands}</span>
						<span class="sc-key">Hands</span>
					</div>
					<div class="stat-cell">
						<span class="sc-val sv-green">{animWins}</span>
						<span class="sc-key">Wins</span>
					</div>
					<div class="stat-cell">
						<span class="sc-val sv-red">{animLosses}</span>
						<span class="sc-key">Losses</span>
					</div>
					<div class="stat-cell">
						<span class="sc-val sv-amber">{animPushes}</span>
						<span class="sc-key">Pushes</span>
					</div>
					<div class="stat-cell">
						<span class="sc-val sv-green">{animBestWin > 0 ? '+' + animBestWin.toFixed(0) : '—'}</span>
						<span class="sc-key">Best Win</span>
					</div>
				</div>
			</section>

			<!-- HAND HISTORY -->
			{#each groups as group, gi}
				<section class="group-section" style="animation-delay:{.26 + gi * .06}s">
					<div class="group-header">
						<span class="group-label">{group.label}</span>
						<span class="group-count">{group.games.length} hands</span>
						{#if gi === 0}
							<button onclick={clearHistory} class="clear-btn">🗑 Clear</button>
						{/if}
					</div>

					<div class="hands-list">
						{#each group.games as game, idx}
							{@const net  = gameNet(game)}
							{@const tier = resultTier(game)}
							{@const isBAC = game.game === 'baccarat'}

							<div class="hand-card tier-{tier}" style="animation-delay:{idx * .03}s">
								<!-- Top bar: game type + tier badge + net -->
								<div class="hc-top">
									<div class="hc-top-left">
										<span class="game-tag {isBAC ? 'tag-bac' : 'tag-bj'}">
											{isBAC ? '♦' : '♠'} {isBAC ? 'BACCARAT' : 'BLACKJACK'}
										</span>
										<span class="tier-badge tb-{tier}">{tierBadge(tier)}</span>
									</div>
									<span class="net-val {net > 0 ? 'nv-win' : net < 0 ? 'nv-loss' : 'nv-push'}">
										{net > 0 ? '+' : ''}{net.toFixed(2)} CHF
									</span>
								</div>

								<!-- Card layout -->
								{#if isBAC}
									<!-- BACCARAT: Player vs Banker -->
									<div class="bac-layout">
										<div class="bac-side">
											<span class="side-label player-lbl">PLAYER</span>
											<div class="card-row">
												{#each (game.playerCards ?? []) as lbl}
													{@const c = parseCard(lbl)}
													<div class="hist-card {isRed(c.suit) ? 'hc-red' : 'hc-black'}">
														<span class="hc-rank">{c.rank}</span>
														<span class="hc-suit">{c.suit}</span>
													</div>
												{/each}
											</div>
											<span class="side-score">{game.playerScore ?? '—'}</span>
										</div>
										<div class="bac-vs">
											<span class="vs-circle {tier === 'win' || tier === 'natural' ? 'vs-player' : tier === 'loss' ? 'vs-banker' : 'vs-tie'}">
												{game.result === 'Player wins' ? 'P' : game.result === 'Banker wins' ? 'B' : 'T'}
											</span>
										</div>
										<div class="bac-side">
											<span class="side-label banker-lbl">BANKER</span>
											<div class="card-row">
												{#each (game.bankerCards ?? []) as lbl}
													{@const c = parseCard(lbl)}
													<div class="hist-card {isRed(c.suit) ? 'hc-red' : 'hc-black'}">
														<span class="hc-rank">{c.rank}</span>
														<span class="hc-suit">{c.suit}</span>
													</div>
												{/each}
											</div>
											<span class="side-score">{game.bankerScore ?? '—'}</span>
										</div>
									</div>
									<div class="bac-meta">
										<span class="bm-bet">Bet: {game.selectedBet} · {game.bet} CHF</span>
										{#if game.naturalHand}<span class="bm-natural">✦ Natural</span>{/if}
									</div>

								{:else if game.playerHands && game.playerHands.length > 0}
									<!-- BLACKJACK (new schema) -->
									<div class="bj-layout">
										<!-- Dealer row -->
										<div class="bj-row">
											<span class="row-label">Dealer</span>
											<div class="card-row">
												{#each (game.dealerCards ?? []) as lbl}
													{@const c = parseCard(lbl)}
													<div class="hist-card {isRed(c.suit) ? 'hc-red' : 'hc-black'}">
														<span class="hc-rank">{c.rank}</span>
														<span class="hc-suit">{c.suit}</span>
													</div>
												{/each}
											</div>
											<span class="row-score">{game.dealerScore ?? '—'}</span>
										</div>
										<!-- Player hand(s) -->
										{#each (game.playerHands ?? []) as hand, hi}
											<div class="bj-row">
												<span class="row-label">
													{(game.playerHands?.length ?? 0) > 1 ? `H${hi+1}` : 'Player'}
													{#if hand.doubled}<span class="dbl-tag">2×</span>{/if}
												</span>
												<div class="card-row">
													{#each (hand.cards ?? []) as lbl}
														{@const c = parseCard(lbl)}
														<div class="hist-card {isRed(c.suit) ? 'hc-red' : 'hc-black'}">
															<span class="hc-rank">{c.rank}</span>
															<span class="hc-suit">{c.suit}</span>
														</div>
													{/each}
												</div>
												<span class="row-score">{hand.score ?? '—'}</span>
												<span class="hand-result hr-{hand.result ?? 'loss'}">{resultLabel(hand.result ?? '')}</span>
											</div>
										{/each}
									</div>
									<!-- Sidebets -->
									{#if (game.perfectPairsBet ?? 0) > 0 || (game.dealerBustBet ?? 0) > 0 || (game.twentyOneThreeBet ?? 0) > 0}
										<div class="sidebets-row">
											{#if (game.perfectPairsBet ?? 0) > 0}
												<span class="sb-tag {(game.perfectPairsPayout ?? 0) > 0 ? 'sb-win' : 'sb-loss'}">
													PP {(game.perfectPairsPayout ?? 0) > 0 ? `+${(game.perfectPairsPayout ?? 0).toFixed(0)}` : `–${(game.perfectPairsBet ?? 0).toFixed(0)}`}
												</span>
											{/if}
											{#if (game.dealerBustBet ?? 0) > 0}
												<span class="sb-tag {game.dealerBustResult === 'won' ? 'sb-win' : 'sb-loss'}">
													DB {game.dealerBustResult === 'won' ? `+${(game.dealerBustPayout ?? 0).toFixed(0)}` : `–${(game.dealerBustBet ?? 0).toFixed(0)}`}
												</span>
											{/if}
											{#if (game.twentyOneThreeBet ?? 0) > 0}
												<span class="sb-tag {(game.twentyOneThreePayout ?? 0) > 0 ? 'sb-win' : 'sb-loss'}">
													21+3 {(game.twentyOneThreePayout ?? 0) > 0 ? `+${(game.twentyOneThreePayout ?? 0).toFixed(0)}` : `–${(game.twentyOneThreeBet ?? 0).toFixed(0)}`}
												</span>
											{/if}
										</div>
									{/if}

								{:else}
									<!-- Legacy schema -->
									<div class="legacy-row">
										<span class="lr-label">Result</span>
										<span class="lr-val">{game.result}</span>
										<span class="lr-score">P: {(game as any).playerScore ?? '—'} · D: {(game as any).dealerScore ?? '—'}</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}

		{:else}
			<!-- Empty state -->
			<div class="empty-state">
				<div class="empty-icon">🂠</div>
				<p class="empty-title">No hands recorded yet.</p>
				<p class="empty-sub">Play a round of Blackjack or Baccarat to start your archive.</p>
				<a href="/" class="empty-cta">Go to Lobby →</a>
			</div>
		{/if}

	</div>
</div>

<style>
/* ════════════════════════════════════════════════════════════
   ROOT & BACKGROUND
════════════════════════════════════════════════════════════ */
:global(body) { margin:0; padding:0; background:#05080d; }
.hist-root { min-height:100dvh; background:#05080d; color:#fff; position:relative; overflow-x:hidden; }
.hist-bg { position:fixed; inset:0; pointer-events:none; z-index:0; }
.hbg-r1 { position:absolute; top:-10%; left:-5%; width:55%; height:55%; background:radial-gradient(ellipse,rgba(6,78,59,.18) 0%,transparent 65%); animation:hbgD1 20s ease-in-out infinite alternate; }
.hbg-r2 { position:absolute; bottom:-10%; right:-5%; width:50%; height:50%; background:radial-gradient(ellipse,rgba(80,40,10,.15) 0%,transparent 65%); animation:hbgD2 25s ease-in-out infinite alternate; }
.hbg-noise { position:absolute;inset:0;opacity:.035; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E"); background-size:250px; }
@keyframes hbgD1 { from{transform:translate(0,0);} to{transform:translate(4%,6%); } }
@keyframes hbgD2 { from{transform:translate(0,0);} to{transform:translate(-4%,-5%);} }

/* ════════════════════════════════════════════════════════════
   CONTENT
════════════════════════════════════════════════════════════ */
.hist-content { position:relative;z-index:1; max-width:640px; margin:0 auto; padding:36px 18px 60px; opacity:0; transition:opacity .45s; }
.content-in { opacity:1; }
.hist-back { display:inline-block; font-size:11px; color:rgba(52,211,153,.7); text-decoration:none; letter-spacing:.08em; margin-bottom:28px; transition:color .15s; }
.hist-back:hover { color:#34d399; }

/* ════════════════════════════════════════════════════════════
   HERO
════════════════════════════════════════════════════════════ */
.hist-hero { text-align:center; margin-bottom:28px; }
.hist-hero-badge { display:inline-block; font-size:8px; font-weight:800; letter-spacing:.35em; color:rgba(180,150,40,.8); border:1px solid rgba(180,150,40,.22); border-radius:999px; padding:4px 14px; margin-bottom:14px; text-transform:uppercase; }
.hist-hero-title { display:flex; align-items:center; justify-content:center; gap:12px; font-size:clamp(24px,7vw,36px); font-weight:900; letter-spacing:.15em; margin:0 0 10px; line-height:1; }
.hht-suit   { font-size:.75em; color:rgba(255,255,255,.3); animation:suitPulse 3s ease-in-out infinite; }
.hht-suit-r { color:rgba(220,50,50,.3); animation-delay:1.5s; }
@keyframes suitPulse { 0%,100%{opacity:.3;} 50%{opacity:.6;} }
.hht-name {
	background:linear-gradient(135deg,#fff 20%,rgba(180,150,40,1) 50%,#fff 80%);
	-webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
	background-size:200% 100%; animation:heroShine 4s linear infinite;
}
@keyframes heroShine { from{background-position:100% 0;} to{background-position:-100% 0;} }
.hist-hero-sub { font-size:12px; letter-spacing:.2em; color:rgba(255,255,255,.25); text-transform:uppercase; margin:0 0 18px; }
.hist-divider { display:flex; align-items:center; justify-content:center; gap:10px; }
.hdiv-line { flex:1; max-width:80px; height:1px; background:linear-gradient(to right,transparent,rgba(180,150,40,.3)); }
.hdiv-line:last-child { background:linear-gradient(to left,transparent,rgba(180,150,40,.3)); }
.hdiv-diamond { font-size:8px; color:rgba(180,150,40,.5); }

.hist-error { background:rgba(127,29,29,.4); border:1px solid rgba(239,68,68,.3); border-radius:12px; padding:10px 14px; font-size:12px; color:#f87171; margin-bottom:16px; }

/* Shared section animation */
.trophy-section, .stats-section, .group-section {
	animation: secIn .55s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes secIn { from{opacity:0;transform:translateY(16px);} to{opacity:1;transform:translateY(0);} }

/* ════════════════════════════════════════════════════════════
   TROPHY
════════════════════════════════════════════════════════════ */
.trophy-section { margin-bottom:18px; }
.trophy-card {
	position:relative; overflow:hidden;
	background:rgba(8,14,20,.85);
	border:1px solid rgba(180,150,40,.3);
	border-radius:18px; padding:16px 18px;
	display:flex; align-items:center; justify-content:space-between; gap:12px;
	box-shadow:0 0 40px rgba(180,150,40,.08);
}
.trophy-card::before { content:''; position:absolute; top:0;left:0;right:0;height:1px; background:linear-gradient(to right,transparent,rgba(180,150,40,.5),transparent); }
.trophy-shimmer { position:absolute;inset:0; background:linear-gradient(105deg,transparent 40%,rgba(180,150,40,.04) 50%,transparent 60%); background-size:200% 100%; animation:shimmer 3s ease-in-out infinite; pointer-events:none; }
@keyframes shimmer { from{background-position:200% 0;} to{background-position:-200% 0;} }
.trophy-left { display:flex; align-items:center; gap:12px; }
.trophy-icon { font-size:28px; filter:drop-shadow(0 0 8px rgba(251,191,36,.4)); animation:trophyPulse 2s ease-in-out infinite; }
@keyframes trophyPulse { 0%,100%{filter:drop-shadow(0 0 6px rgba(251,191,36,.3));} 50%{filter:drop-shadow(0 0 14px rgba(251,191,36,.6));} }
.trophy-label  { font-size:8px; font-weight:800; letter-spacing:.25em; color:rgba(180,150,40,.7); text-transform:uppercase; margin-bottom:2px; }
.trophy-amount { font-size:clamp(20px,5vw,24px); font-weight:900; color:#fbbf24; text-shadow:0 0 16px rgba(251,191,36,.4); line-height:1.1; }
.trophy-game   { font-size:9px; color:rgba(255,255,255,.3); letter-spacing:.1em; margin-top:2px; }
.trophy-cards  { display:flex; gap:4px; flex-shrink:0; }

/* ════════════════════════════════════════════════════════════
   PREMIUM CARDS (large, matching game quality)
════════════════════════════════════════════════════════════ */
.hist-card {
	width: 46px; height: 68px;
	border-radius: 7px;
	display: flex; flex-direction: column;
	align-items: center; justify-content: center;
	gap: 1px;
	border: 1px solid rgba(0,0,0,.15);
	box-shadow: 0 4px 12px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.9) inset;
	background: linear-gradient(155deg,#ffffff 0%,#f8f8f6 60%,#f4f4f2 100%);
	flex-shrink: 0;
	position: relative;
}
.hc-rank { font-size:12px; font-weight:900; line-height:1; }
.hc-suit { font-size:16px; font-weight:800; line-height:1; }
.hc-red  { color:#c41c1c; text-shadow:0 1px 2px rgba(196,28,28,.15); }
.hc-black{ color:#0d1526; }
/* Card depth accent */
.hist-card::after { content:''; position:absolute; top:3px;left:20%;right:20%;height:35%; border-radius:50%; background:linear-gradient(to bottom,rgba(255,255,255,.22),transparent); pointer-events:none; }

/* ════════════════════════════════════════════════════════════
   STATS
════════════════════════════════════════════════════════════ */
.stats-section { margin-bottom:18px; }
.stats-top { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
.stat-primary {
	border-radius:16px; padding:14px 16px 12px;
	background:rgba(8,14,20,.85); border:1px solid rgba(255,255,255,.06);
	display:flex; flex-direction:column; position:relative; overflow:hidden;
}
.stat-primary::before { content:''; position:absolute; top:0;left:0;right:0;height:1px; background:linear-gradient(to right,transparent,rgba(180,150,40,.2),transparent); }
.pnl-card.pnl-pos { border-color:rgba(52,211,153,.15); }
.pnl-card.pnl-neg { border-color:rgba(239,68,68,.1); }
.sp-label { font-size:7px; font-weight:800; letter-spacing:.25em; color:rgba(255,255,255,.2); text-transform:uppercase; margin-bottom:4px; }
.sp-val   { font-size:clamp(22px,6vw,28px); font-weight:900; line-height:1; font-variant-numeric:tabular-nums; }
.sp-cur   { font-size:11px; color:rgba(255,255,255,.3); margin-top:1px; }
.sv-green  { color:#34d399; text-shadow:0 0 16px rgba(52,211,153,.3); }
.sv-red    { color:#f87171; }
.sv-amber  { color:#fbbf24; }
.sv-neutral{ color:rgba(255,255,255,.5); }

.stats-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
.stat-cell { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.05); border-radius:12px; padding:10px 4px; text-align:center; }
.sc-val { display:block; font-size:clamp(14px,3vw,17px); font-weight:900; color:rgba(255,255,255,.7); line-height:1; margin-bottom:4px; font-variant-numeric:tabular-nums; }
.sc-key { display:block; font-size:7px; color:rgba(255,255,255,.2); letter-spacing:.1em; text-transform:uppercase; }

/* ════════════════════════════════════════════════════════════
   GROUP & HANDS
════════════════════════════════════════════════════════════ */
.group-section { margin-bottom:24px; }
.group-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
.group-label { font-size:8px; font-weight:800; letter-spacing:.25em; color:rgba(255,255,255,.2); text-transform:uppercase; }
.group-count { font-size:9px; color:rgba(255,255,255,.15); }
.group-header .clear-btn { margin-left:auto; font-size:10px; color:rgba(239,68,68,.5); background:rgba(239,68,68,.06); border:1px solid rgba(239,68,68,.15); border-radius:8px; padding:3px 10px; cursor:pointer; transition:all .15s; }
.group-header .clear-btn:hover { color:#f87171; border-color:rgba(239,68,68,.35); }

.hands-list { display:flex; flex-direction:column; gap:10px; }

/* Hand card */
.hand-card {
	background:rgba(8,14,20,.82); border-radius:16px;
	border:1px solid rgba(255,255,255,.06);
	padding:12px 14px 10px;
	transition:transform .2s cubic-bezier(0.34,1.2,0.64,1), box-shadow .2s, border-color .2s;
	animation:handIn .4s cubic-bezier(0.22,1,0.36,1) both;
	position:relative; overflow:hidden;
}
@keyframes handIn { from{opacity:0;transform:translateY(10px);} to{opacity:1;transform:translateY(0);} }
.hand-card:hover { transform:translateY(-2px); }

/* Tier-specific left border accent */
.hand-card::before { content:''; position:absolute; left:0;top:12px;bottom:12px; width:2.5px; border-radius:999px; }
.tier-blackjack::before  { background:rgba(251,191,36,.7); box-shadow:0 0 8px rgba(251,191,36,.4); }
.tier-natural::before    { background:rgba(251,191,36,.55); }
.tier-bust-win::before   { background:rgba(239,68,68,.5); }
.tier-win::before        { background:rgba(52,211,153,.4); }
.tier-push::before       { background:rgba(148,163,184,.25); }
.tier-loss::before       { background:rgba(239,68,68,.15); }

/* Tier hover glow */
.tier-blackjack:hover { border-color:rgba(251,191,36,.25); box-shadow:0 6px 24px rgba(0,0,0,.4),0 0 20px rgba(251,191,36,.07); }
.tier-natural:hover   { border-color:rgba(251,191,36,.2);  box-shadow:0 6px 24px rgba(0,0,0,.4),0 0 16px rgba(251,191,36,.05); }
.tier-bust-win:hover  { border-color:rgba(239,68,68,.2);   box-shadow:0 6px 24px rgba(0,0,0,.4),0 0 16px rgba(239,68,68,.05); }
.tier-win:hover       { border-color:rgba(52,211,153,.18); box-shadow:0 6px 24px rgba(0,0,0,.4),0 0 16px rgba(52,211,153,.05); }

/* Top bar */
.hc-top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
.hc-top-left { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.game-tag { font-size:8px; font-weight:800; letter-spacing:.1em; border-radius:999px; padding:2px 8px; text-transform:uppercase; }
.tag-bj  { background:rgba(52,211,153,.1); color:rgba(52,211,153,.8); border:1px solid rgba(52,211,153,.2); }
.tag-bac { background:rgba(220,120,30,.1); color:rgba(220,120,30,.8); border:1px solid rgba(220,120,30,.2); }

.tier-badge { font-size:8px; font-weight:800; letter-spacing:.12em; border-radius:999px; padding:2px 8px; text-transform:uppercase; }
.tb-blackjack  { background:rgba(92,60,0,.6); color:#fbbf24; border:1px solid rgba(251,191,36,.3); }
.tb-natural    { background:rgba(92,60,0,.5); color:#fde68a; border:1px solid rgba(251,191,36,.2); }
.tb-bust-win   { background:rgba(60,8,8,.6);  color:#fca5a5; border:1px solid rgba(239,68,68,.25); }
.tb-win        { background:rgba(5,40,22,.6); color:#6ee7b7; border:1px solid rgba(52,211,153,.2); }
.tb-push       { background:rgba(20,25,38,.5); color:rgba(148,163,184,.7); border:1px solid rgba(148,163,184,.15); }
.tb-loss       { background:rgba(30,8,8,.4);  color:rgba(248,113,113,.6); border:1px solid rgba(239,68,68,.12); }

.net-val { font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; white-space:nowrap; }
.nv-win  { color:#34d399; }
.nv-loss { color:#f87171; }
.nv-push { color:#fbbf24; }

/* Card row */
.card-row { display:flex; gap:4px; flex-wrap:nowrap; align-items:flex-end; }

/* BACCARAT layout */
.bac-layout { display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; }
.bac-side { flex:1; display:flex; flex-direction:column; gap:5px; }
.side-label { font-size:7px; font-weight:800; letter-spacing:.2em; text-transform:uppercase; }
.player-lbl { color:rgba(96,165,250,.65); }
.banker-lbl { color:rgba(239,68,68,.65); }
.side-score { font-size:18px; font-weight:900; color:rgba(255,255,255,.7); margin-top:2px; }
.bac-vs { display:flex; align-items:center; justify-content:center; padding-top:20px; }
.vs-circle { width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; }
.vs-player { background:rgba(29,78,216,.7); border:1px solid rgba(96,165,250,.4); color:#93c5fd; }
.vs-banker { background:rgba(185,28,28,.7); border:1px solid rgba(239,68,68,.4); color:#fca5a5; }
.vs-tie    { background:rgba(120,90,10,.7); border:1px solid rgba(251,191,36,.4); color:#fde68a; }
.bac-meta { display:flex; gap:8px; align-items:center; margin-top:4px; }
.bm-bet    { font-size:10px; color:rgba(255,255,255,.28); }
.bm-natural{ font-size:9px; color:rgba(251,191,36,.65); font-weight:700; letter-spacing:.1em; }

/* BLACKJACK layout */
.bj-layout { display:flex; flex-direction:column; gap:8px; }
.bj-row { display:flex; align-items:center; gap:8px; }
.row-label { font-size:8px; font-weight:700; letter-spacing:.1em; color:rgba(255,255,255,.25); text-transform:uppercase; width:40px; flex-shrink:0; }
.row-score { font-size:16px; font-weight:800; color:rgba(255,255,255,.6); min-width:24px; }
.dbl-tag { font-size:8px; color:#fbbf24; margin-left:3px; }
.hand-result { font-size:9px; font-weight:700; letter-spacing:.06em; margin-left:auto; }
.hr-blackjack { color:#fbbf24; }
.hr-win, .hr-dealer-bust { color:#34d399; }
.hr-push { color:#fbbf24; }
.hr-lose, .hr-bust { color:#f87171; }

/* Sidebets */
.sidebets-row { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.05); }
.sb-tag { font-size:9px; font-weight:700; border-radius:999px; padding:2px 8px; letter-spacing:.06em; }
.sb-win  { background:rgba(5,40,22,.6); color:#6ee7b7; border:1px solid rgba(52,211,153,.2); }
.sb-loss { background:rgba(20,20,30,.5); color:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.07); }

/* Legacy */
.legacy-row { display:flex; gap:10px; align-items:center; font-size:12px; color:rgba(255,255,255,.5); }
.lr-val { font-weight:700; color:#fff; }

/* ════════════════════════════════════════════════════════════
   EMPTY STATE
════════════════════════════════════════════════════════════ */
.empty-state { text-align:center; padding:60px 20px; }
.empty-icon  { font-size:52px; margin-bottom:16px; opacity:.3; }
.empty-title { font-size:18px; font-weight:700; color:rgba(255,255,255,.4); margin-bottom:8px; }
.empty-sub   { font-size:12px; color:rgba(255,255,255,.2); margin-bottom:24px; }
.empty-cta   { display:inline-block; background:rgba(52,211,153,.1); border:1px solid rgba(52,211,153,.25); border-radius:12px; padding:10px 22px; color:rgba(52,211,153,.8); text-decoration:none; font-size:12px; font-weight:700; letter-spacing:.1em; transition:all .15s; }
.empty-cta:hover { background:rgba(52,211,153,.18); }
</style>