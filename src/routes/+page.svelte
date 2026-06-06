<script lang="ts">
	import { onMount } from 'svelte';
	import { getBankroll, resetBankroll } from '$lib/bankroll';
	import { getStats, resetStats, winRate, sessionProfit, type SessionStats } from '$lib/stats';

	let bankroll = $state(1000);
	let stats    = $state<SessionStats>({
		handsPlayed: 0, wins: 0, losses: 0, pushes: 0,
		biggestWin: 0, sessionStartBankroll: 1000,
	});

	let profit = $derived(sessionProfit(stats, bankroll));
	let wr     = $derived(winRate(stats));
	let broke  = $derived(bankroll <= 0);

	// ── Auth: read cached user from localStorage (set on login/register) ────────
	import { getCachedUser, clearUserSession, setBankroll } from '$lib/bankroll';

	let user = $state(getCachedUser());

	// On mount: verify session is still valid with server, sync bankroll
	onMount(async () => {
		bankroll = getBankroll();
		stats    = getStats();
		// Refresh user session from server (handles cookie expiry etc.)
		try {
			const res  = await fetch('/api/auth/me');
			const data = await res.json();
			if (data.user) {
				user     = data.user;
				// Sync bankroll from server — server is source of truth for logged-in users
				if (typeof data.user.bankroll === 'number') {
					bankroll = data.user.bankroll;
					setBankroll(data.user.bankroll);
				}
			} else {
				// Cookie expired or invalid — clear cached user
				clearUserSession();
				user = null;
			}
		} catch {}
		const onVisible = () => { if (document.visibilityState === 'visible') loadFromStorage(); };
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		// 1. Clear localStorage: wipe casino_user, set bankroll = 2000
		clearUserSession();
		// 2. Reset all reactive state immediately — no stale UI
		user     = null;
		bankroll = getBankroll();   // reads freshly written 2000
		stats    = { handsPlayed:0, wins:0, losses:0, pushes:0, biggestWin:0, sessionStartBankroll:2000 };
		// 3. Reset animated display values instantly (skip count-up from old values)
		animBankroll = bankroll;
		animProfit   = 0;
		animHands    = 0;
		animWins     = 0;
		animLosses   = 0;
		animPushes   = 0;
		animBestWin  = 0;
		animWR       = 0;
		// 4. Invalidate server data (history, user session check)
		await invalidateAll();
	}

	// Animated counter values
	let animBankroll  = $state(0);
	let animProfit    = $state(0);
	let animHands     = $state(0);
	let animWins      = $state(0);
	let animLosses    = $state(0);
	let animWR        = $state(0);
	let animBestWin   = $state(0);
	let mounted       = $state(false);
	let cardsVisible  = $state(false);

	function countUp(target: number, setter: (v: number) => void, duration = 900) {
		const steps = 30;
		const step  = target / steps;
		const delay = duration / steps;
		let i = 0;
		const tick = () => {
			i++;
			if (i >= steps) { setter(target); return; }
			setter(Math.round(step * i * 100) / 100);
			setTimeout(tick, delay);
		};
		setTimeout(tick, delay);
	}

	function loadFromStorage() {
		bankroll = getBankroll();
		stats    = getStats();
	}

	onMount(() => {
		loadFromStorage();
		const onVisible = () => { if (document.visibilityState === 'visible') { loadFromStorage(); runCountUp(); } };
		document.addEventListener('visibilitychange', onVisible);

		// Stagger entrance animations
		setTimeout(() => { mounted = true; }, 80);
		setTimeout(() => { cardsVisible = true; }, 400);
		setTimeout(() => runCountUp(), 600);

		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	function runCountUp() {
		countUp(bankroll, v => animBankroll = v, 1100);
		countUp(profit, v => animProfit = v, 900);
		countUp(stats.handsPlayed, v => animHands = Math.round(v), 700);
		countUp(stats.wins, v => animWins = Math.round(v), 750);
		countUp(stats.losses, v => animLosses = Math.round(v), 750);
		countUp(wr, v => animWR = v, 800);
		countUp(stats.biggestWin, v => animBestWin = v, 900);
	}

	function handleReset() {
		const also = confirm(
			'Bankroll auf 1000 CHF zurücksetzen?\n\nOK = auch Session-Stats zurücksetzen\nAbbrechen = nur Bankroll zurücksetzen'
		);
		resetBankroll();
		bankroll = 1000;
		if (also) { resetStats(1000); stats = getStats(); }
		setTimeout(() => runCountUp(), 100);
	}

	type ModalGame = 'blackjack' | 'baccarat' | null;
	let openModal = $state<ModalGame>(null);
	function open(game: ModalGame) { openModal = game; }
	function close() { openModal = null; }
	function handleBackdrop(e: MouseEvent) { if ((e.target as HTMLElement).dataset.backdrop) close(); }
	function handleKeydown(e: KeyboardEvent) { if (e.key === 'Escape') close(); }

	// Last played game (localStorage)
	let lastPlayed = $state<'blackjack' | 'baccarat' | null>(null);
	onMount(() => {
		const lp = localStorage.getItem('lastPlayed') as 'blackjack' | 'baccarat' | null;
		if (lp) lastPlayed = lp;
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="lobby-root">

	<!-- ── Atmospheric Background ──────────────────────────────── -->
	<div class="bg-layer" aria-hidden="true">
		<div class="bg-radial-1"></div>
		<div class="bg-radial-2"></div>
		<div class="bg-radial-3"></div>
		<div class="bg-noise"></div>
		<!-- Floating card suits -->
		<div class="float-suit fs-1">♠</div>
		<div class="float-suit fs-2">♥</div>
		<div class="float-suit fs-3">♦</div>
		<div class="float-suit fs-4">♣</div>
		<div class="float-suit fs-5">♠</div>
		<div class="float-suit fs-6">♦</div>
		<!-- Light streak -->
		<div class="light-streak ls-1"></div>
		<div class="light-streak ls-2"></div>
	</div>

	<!-- ── Page content ────────────────────────────────────────── -->
	<div class="lobby-content {mounted ? 'content-in' : ''}">

		<!-- HERO ─────────────────────────────────────────────── -->
		<header class="hero">
			<div class="hero-badge">PREMIUM CASINO</div>
			<h1 class="hero-title">
				<span class="hero-suit">♠</span>
				<span class="hero-name">ROYAL TABLE</span>
				<span class="hero-suit hero-suit-r">♥</span>
			</h1>
			<p class="hero-sub">Tonight, the cards decide.</p>
			<!-- Decorative divider -->
			<div class="hero-divider">
				<span class="hd-line"></span>
				<span class="hd-diamond">◆</span>
				<span class="hd-line"></span>
			</div>

			<!-- User bar -->
			<div class="user-bar">
				{#if user}
					<a href="/account" class="ub-user">
						<span class="ub-avatar">{user.username[0].toUpperCase()}</span>
						<span class="ub-name">{user.username}</span>
					</a>
					<button onclick={handleLogout} class="ub-logout">Sign Out</button>
				{:else}
					<a href="/login"    class="ub-login">Sign In</a>
					<a href="/register" class="ub-register">Register</a>
					<span class="ub-guest">or continue as guest</span>
				{/if}
			</div>
		</header>

		<!-- BANKROLL ─────────────────────────────────────────── -->
		<section class="bankroll-section {mounted ? 'section-in' : ''}" style="animation-delay:.15s">
			<div class="bankroll-card {broke ? 'bankroll-broke' : profit > 0 ? 'bankroll-up' : profit < 0 ? 'bankroll-down' : ''}">
				<div class="bankroll-top">
					<span class="bankroll-label">BALANCE</span>
					<button onclick={handleReset} class="reset-btn" title="Reset">↺</button>
				</div>
				<div class="bankroll-amount">
					<span class="ba-number {broke ? 'ba-broke' : bankroll < 100 ? 'ba-warn' : 'ba-good'}">
						{animBankroll.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
					</span>
					<span class="ba-currency">CHF</span>
				</div>
				<div class="bankroll-pnl {profit > 0 ? 'pnl-pos' : profit < 0 ? 'pnl-neg' : 'pnl-zero'}">
					Session: {animProfit > 0 ? '+' : ''}{animProfit.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF
				</div>
				{#if broke}
					<div class="bankroll-broke-msg">💸 No funds remaining</div>
				{/if}
			</div>
		</section>

		<!-- SESSION STATS ───────────────────────────────────── -->
		<section class="stats-section {mounted ? 'section-in' : ''}" style="animation-delay:.25s">
			<h2 class="section-label">SESSION STATS</h2>
			<div class="stats-grid">
				<div class="stat-cell">
					<span class="stat-val">{animHands}</span>
					<span class="stat-key">Hands</span>
				</div>
				<div class="stat-cell">
					<span class="stat-val stat-win">{animWins}</span>
					<span class="stat-key">Wins</span>
				</div>
				<div class="stat-cell">
					<span class="stat-val stat-loss">{animLosses}</span>
					<span class="stat-key">Losses</span>
				</div>
				<div class="stat-cell">
					<span class="stat-val {animWR >= 50 ? 'stat-win' : animWR > 0 ? 'stat-warn' : ''}">
						{stats.handsPlayed > 0 ? animWR.toFixed(1) + '%' : '—'}
					</span>
					<span class="stat-key">Win Rate</span>
				</div>
				<div class="stat-cell stat-wide">
					<span class="stat-val {animBestWin > 0 ? 'stat-win' : ''}">
						{animBestWin > 0 ? '+' + animBestWin.toFixed(0) : '—'}
					</span>
					<span class="stat-key">Best Win</span>
				</div>
			</div>
		</section>

		<!-- LAST PLAYED ─────────────────────────────────────── -->
		{#if lastPlayed}
			<section class="last-section {mounted ? 'section-in' : ''}" style="animation-delay:.3s">
				<a href="/{lastPlayed}" class="last-card" onclick={() => localStorage.setItem('lastPlayed', lastPlayed!)}>
					<span class="last-badge">🔥 LAST PLAYED</span>
					<span class="last-name">{lastPlayed === 'blackjack' ? '♠ BLACKJACK' : '♦ BACCARAT'}</span>
					<span class="last-cta">Continue →</span>
				</a>
			</section>
		{/if}

		<!-- GAME TILES ──────────────────────────────────────── -->
		<section class="games-section {cardsVisible ? 'games-in' : ''}" style="animation-delay:.38s">
			<h2 class="section-label">CHOOSE YOUR GAME</h2>
			<div class="games-grid">

				<!-- BLACKJACK -->
				<div class="game-tile bj-tile {broke ? 'tile-broke' : ''}">
					<div class="tile-glow bj-glow"></div>
					<div class="tile-inner">
						<div class="tile-suit-bg">♠</div>
						<div class="tile-header">
							<span class="tile-suit">♠</span>
							<span class="tile-badge bj-badge">3:2</span>
						</div>
						<h3 class="tile-name">BLACKJACK</h3>
						<p class="tile-desc">Beat the dealer.<br>21 is the magic number.</p>
						<div class="tile-meta">
							<span class="tm-item">6 Deck Shoe</span>
							<span class="tm-dot">·</span>
							<span class="tm-item">Sidebets</span>
						</div>
						<div class="tile-actions">
							<a href="/blackjack"
								onclick={() => localStorage.setItem('lastPlayed','blackjack')}
								class="tile-play {broke ? 'tile-play-broke' : 'bj-play'}">
								{broke ? 'No Funds' : 'PLAY NOW →'}
							</a>
							<button onclick={() => open('blackjack')} class="tile-rules">Rules</button>
						</div>
					</div>
				</div>

				<!-- BACCARAT -->
				<div class="game-tile bac-tile {broke ? 'tile-broke' : ''}">
					<div class="tile-glow bac-glow"></div>
					<div class="tile-inner">
						<div class="tile-suit-bg">♦</div>
						<div class="tile-header">
							<span class="tile-suit bac-suit">♦</span>
							<span class="tile-badge bac-badge">8:1 TIE</span>
						</div>
						<h3 class="tile-name">BACCARAT</h3>
						<p class="tile-desc">Player vs Banker.<br>The classic casino duel.</p>
						<div class="tile-meta">
							<span class="tm-item">Punto Banco</span>
							<span class="tm-dot">·</span>
							<span class="tm-item">Auto Reveal</span>
						</div>
						<div class="tile-actions">
							<a href="/baccarat"
								onclick={() => localStorage.setItem('lastPlayed','baccarat')}
								class="tile-play {broke ? 'tile-play-broke' : 'bac-play'}">
								{broke ? 'No Funds' : 'PLAY NOW →'}
							</a>
							<button onclick={() => open('baccarat')} class="tile-rules">Rules</button>
						</div>
					</div>
				</div>

			</div>
		</section>

		<!-- HISTORY ─────────────────────────────────────────── -->
		<section class="history-section {mounted ? 'section-in' : ''}" style="animation-delay:.45s">
			<a href="/history" class="history-link">
				<span class="hl-icon">📜</span>
				<span class="hl-text">Round History</span>
				<span class="hl-arrow">→</span>
			</a>
		</section>

		<!-- Footer motto -->
		<footer class="lobby-footer">
			<span>The house always wins — but tonight might be different.</span>
		</footer>

	</div>
</div>

<!-- ══ RULES MODAL ═════════════════════════════════════════════ -->
{#if openModal !== null}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div data-backdrop="true" onclick={handleBackdrop}
		class="modal-backdrop">
		<div class="modal-card">
			<button onclick={close} class="modal-close" aria-label="Close">✕</button>

			{#if openModal === 'blackjack'}
				<div class="modal-body">
					<div class="modal-header">
						<span class="modal-icon">♠</span>
						<h2>Blackjack Rules</h2>
					</div>
					<section class="rule-section">
						<h3 class="rule-heading bj-heading">OBJECTIVE</h3>
						<p class="rule-text">Get as close to <strong>21</strong> as possible without going over — and beat the dealer.</p>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bj-heading">CARD VALUES</h3>
						<div class="value-grid">
							<div class="value-cell"><p class="vc-val">2–10</p><p class="vc-key">Face value</p></div>
							<div class="value-cell"><p class="vc-val">J·Q·K</p><p class="vc-key">= 10</p></div>
							<div class="value-cell"><p class="vc-val">A</p><p class="vc-key">= 1 or 11</p></div>
						</div>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bj-heading">ACTIONS</h3>
						<div class="action-list">
							{#each [['Hit','Draw another card.','#16a34a'],['Stand','End your turn.','#4b5563'],['Double','Double bet, one more card.','#d97706'],['Split','Split equal cards into two hands.','#7c3aed']] as [name, desc, col]}
								<div class="action-row">
									<span class="act-badge" style="background:{col}">{name}</span>
									<span class="act-desc">{desc}</span>
								</div>
							{/each}
						</div>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bj-heading">PAYOUTS</h3>
						<div class="payout-list">
							<div class="payout-row"><span>Blackjack</span><span class="pay-val pay-gold">3:2</span></div>
							<div class="payout-row"><span>Win</span><span class="pay-val pay-green">1:1</span></div>
							<div class="payout-row"><span>Push</span><span class="pay-val pay-amber">Bet returned</span></div>
							<div class="payout-row"><span>Bust / Lose</span><span class="pay-val pay-red">Lost</span></div>
						</div>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bj-heading">HOUSE RULES</h3>
						<ul class="rule-list">
							{#each ['6-Deck Shoe','Dealer stands on Soft 17','Double after Split allowed','No Surrender','Dealer peeks for Blackjack'] as r}
								<li><span class="rule-check">✓</span>{r}</li>
							{/each}
						</ul>
					</section>
				</div>

			{:else if openModal === 'baccarat'}
				<div class="modal-body">
					<div class="modal-header">
						<span class="modal-icon bac-modal-icon">♦</span>
						<h2>Baccarat Rules</h2>
					</div>
					<section class="rule-section">
						<h3 class="rule-heading bac-heading">OBJECTIVE</h3>
						<p class="rule-text">Bet on which hand reaches <strong>9</strong> — Player, Banker, or Tie.</p>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bac-heading">CARD VALUES</h3>
						<div class="value-grid">
							<div class="value-cell"><p class="vc-val">A</p><p class="vc-key">= 1</p></div>
							<div class="value-cell"><p class="vc-val">2–9</p><p class="vc-key">Face value</p></div>
							<div class="value-cell"><p class="vc-val">10·J·Q·K</p><p class="vc-key">= 0</p></div>
						</div>
						<p class="rule-note">Hand value = sum mod 10 · Example: 7+6 = 13 → value <strong>3</strong></p>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bac-heading">PAYOUTS</h3>
						<div class="payout-list">
							<div class="payout-row"><span>Player Win</span><span class="pay-val pay-green">1:1</span></div>
							<div class="payout-row"><span>Banker Win</span><span class="pay-val pay-green">0.95:1</span></div>
							<div class="payout-row"><span>Tie Win</span><span class="pay-val pay-gold">8:1</span></div>
							<div class="payout-row"><span>Tie (P/B bet)</span><span class="pay-val pay-amber">Push</span></div>
						</div>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bac-heading">NATURAL HAND</h3>
						<div class="natural-box">✨ 8 or 9 on first two cards — round ends immediately.</div>
					</section>
					<section class="rule-section">
						<h3 class="rule-heading bac-heading">DRAWING RULES (PUNTO BANCO)</h3>
						<div class="draw-list">
							<div class="draw-row"><span class="draw-side">Player</span><span>Draws on 0–5 · Stands on 6–7</span></div>
							<div class="draw-row"><span class="draw-side">Banker</span><span>Depends on own total and Player's 3rd card per Punto Banco table.</span></div>
						</div>
					</section>
				</div>
			{/if}

			<button onclick={close} class="modal-close-btn">Close</button>
		</div>
	</div>
{/if}

<style>
/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
:global(body) { margin:0; padding:0; background:#05080d; }

.lobby-root {
	min-height: 100dvh;
	background: #05080d;
	color: #fff;
	overflow-x: hidden;
	position: relative;
}

/* ════════════════════════════════════════════════════════════
   ATMOSPHERIC BACKGROUND
════════════════════════════════════════════════════════════ */
.bg-layer {
	position: fixed; inset: 0;
	pointer-events: none; z-index: 0;
	overflow: hidden;
}
.bg-radial-1 {
	position:absolute; top:-20%; left:-10%; width:70%; height:70%;
	background: radial-gradient(ellipse, rgba(6,78,59,.22) 0%, transparent 65%);
	animation: bgDrift1 18s ease-in-out infinite alternate;
}
.bg-radial-2 {
	position:absolute; bottom:-15%; right:-10%; width:60%; height:60%;
	background: radial-gradient(ellipse, rgba(120,50,10,.18) 0%, transparent 65%);
	animation: bgDrift2 22s ease-in-out infinite alternate;
}
.bg-radial-3 {
	position:absolute; top:30%; left:30%; width:50%; height:50%;
	background: radial-gradient(ellipse, rgba(180,140,40,.06) 0%, transparent 60%);
	animation: bgDrift1 28s ease-in-out infinite alternate-reverse;
}
@keyframes bgDrift1 { from{transform:translate(0,0);} to{transform:translate(5%,8%);} }
@keyframes bgDrift2 { from{transform:translate(0,0);} to{transform:translate(-6%,-5%);} }

.bg-noise {
	position:absolute; inset:0;
	opacity:.04;
	background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");
	background-size:250px;
}

/* Floating suits */
.float-suit {
	position:absolute; font-size:clamp(60px,10vw,120px); font-weight:900;
	color:rgba(255,255,255,.025); pointer-events:none; user-select:none;
	animation: floatUp linear infinite;
}
.fs-1 { left:5%;  bottom:-10%; animation-duration:25s; animation-delay:0s; font-size:80px; }
.fs-2 { left:20%; bottom:-10%; animation-duration:32s; animation-delay:-8s; color:rgba(239,68,68,.03); }
.fs-3 { left:45%; bottom:-10%; animation-duration:28s; animation-delay:-4s; color:rgba(180,140,40,.025); }
.fs-4 { left:65%; bottom:-10%; animation-duration:22s; animation-delay:-12s; }
.fs-5 { left:80%; bottom:-10%; animation-duration:35s; animation-delay:-18s; font-size:60px; }
.fs-6 { left:92%; bottom:-10%; animation-duration:27s; animation-delay:-6s; color:rgba(180,140,40,.02); font-size:90px; }
@keyframes floatUp {
	0%   { transform: translateY(0) rotate(0deg); opacity:0; }
	5%   { opacity:1; }
	95%  { opacity:.8; }
	100% { transform: translateY(-120vh) rotate(15deg); opacity:0; }
}

/* Light streaks */
.light-streak {
	position:absolute; width:1px; height:30vh;
	background: linear-gradient(to bottom, transparent, rgba(180,150,50,.15), transparent);
	animation: streakFall linear infinite;
}
.ls-1 { left:25%; top:-30%; animation-duration:8s; animation-delay:-3s; }
.ls-2 { left:72%; top:-30%; animation-duration:12s; animation-delay:-7s; }
@keyframes streakFall { to { transform: translateY(180vh); } }

/* ════════════════════════════════════════════════════════════
   CONTENT LAYOUT
════════════════════════════════════════════════════════════ */
.lobby-content {
	position: relative; z-index: 1;
	max-width: 460px; margin: 0 auto;
	padding: 48px 20px 60px;
	opacity: 0;
	transition: opacity .5s ease;
}
.content-in { opacity: 1; }

.section-in { animation: sectionIn .55s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes sectionIn {
	from { opacity:0; transform:translateY(18px); }
	to   { opacity:1; transform:translateY(0); }
}

/* ════════════════════════════════════════════════════════════
   HERO
════════════════════════════════════════════════════════════ */
.hero { text-align:center; margin-bottom:32px; }

.hero-badge {
	display:inline-block;
	font-size:9px; font-weight:800; letter-spacing:.35em;
	color:rgba(180,150,40,.8); text-transform:uppercase;
	border:1px solid rgba(180,150,40,.2); border-radius:999px;
	padding:4px 14px; margin-bottom:16px;
	animation: sectionIn .5s cubic-bezier(0.22,1,0.36,1) .1s both;
}
.hero-title {
	display:flex; align-items:center; justify-content:center; gap:14px;
	font-size:clamp(28px,8vw,42px); font-weight:900;
	letter-spacing:.15em; margin:0 0 12px;
	line-height:1;
	animation: heroIn .7s cubic-bezier(0.22,1,0.36,1) .2s both;
}
@keyframes heroIn {
	from { opacity:0; transform:scale(.92) translateY(10px); letter-spacing:.25em; }
	to   { opacity:1; transform:scale(1) translateY(0); letter-spacing:.15em; }
}
.hero-suit {
	font-size:.75em; color:rgba(255,255,255,.35);
	animation: suitPulse 3s ease-in-out infinite;
}
.hero-suit-r { color:rgba(220,50,50,.35); animation-delay:1.5s; }
@keyframes suitPulse { 0%,100%{opacity:.35;} 50%{opacity:.65;} }
.hero-name {
	background: linear-gradient(135deg, #fff 20%, rgba(180,150,40,1) 50%, #fff 80%);
	-webkit-background-clip: text; -webkit-text-fill-color: transparent;
	background-clip: text;
	background-size: 200% 100%;
	animation: heroShine 4s linear infinite;
}
@keyframes heroShine { from{background-position:100% 0;} to{background-position:-100% 0;} }

.hero-sub {
	font-size:13px; letter-spacing:.2em; color:rgba(255,255,255,.28);
	text-transform:uppercase; margin:0 0 20px;
	animation: sectionIn .5s cubic-bezier(0.22,1,0.36,1) .35s both;
}

.hero-divider {
	display:flex; align-items:center; justify-content:center; gap:10px;
	animation: sectionIn .5s cubic-bezier(0.22,1,0.36,1) .45s both;
}
.hd-line { flex:1; max-width:80px; height:1px; background:linear-gradient(to right,transparent,rgba(180,150,40,.3)); }
.hd-line:last-child { background:linear-gradient(to left,transparent,rgba(180,150,40,.3)); }
.hd-diamond { font-size:8px; color:rgba(180,150,40,.5); }

/* ════════════════════════════════════════════════════════════
   BANKROLL CARD
════════════════════════════════════════════════════════════ */
.bankroll-section { margin-bottom:16px; }

.bankroll-card {
	border-radius:20px; padding:18px 22px 14px;
	background: rgba(8,14,20,.85);
	border: 1px solid rgba(255,255,255,.07);
	box-shadow: 0 8px 40px rgba(0,0,0,.5);
	transition: border-color .3s, box-shadow .3s;
	position:relative; overflow:hidden;
}
.bankroll-card::before {
	content:''; position:absolute; top:0; left:0; right:0; height:1px;
	background: linear-gradient(to right, transparent, rgba(180,150,40,.35), transparent);
}
.bankroll-up   { border-color:rgba(52,211,153,.15); box-shadow:0 8px 40px rgba(0,0,0,.5),0 0 30px rgba(52,211,153,.06); }
.bankroll-down { border-color:rgba(239,68,68,.12); }
.bankroll-broke{ border-color:rgba(239,68,68,.25); box-shadow:0 8px 40px rgba(0,0,0,.5),0 0 30px rgba(220,38,38,.08); }

.bankroll-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
.bankroll-label { font-size:9px; font-weight:800; letter-spacing:.25em; color:rgba(180,150,40,.7); text-transform:uppercase; }
.reset-btn {
	font-size:13px; color:rgba(255,255,255,.2); background:rgba(255,255,255,.04);
	border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:3px 10px;
	cursor:pointer; transition:all .15s;
}
.reset-btn:hover { color:rgba(255,255,255,.55); border-color:rgba(255,255,255,.15); }

.bankroll-amount { display:flex; align-items:baseline; gap:6px; margin-bottom:4px; }
.ba-number { font-size:clamp(28px,7vw,36px); font-weight:900; letter-spacing:-.02em; font-variant-numeric:tabular-nums; transition:color .3s; }
.ba-good { color:#34d399; text-shadow:0 0 20px rgba(52,211,153,.3); }
.ba-warn { color:#fbbf24; }
.ba-broke{ color:#f87171; }
.ba-currency { font-size:14px; color:rgba(255,255,255,.3); font-weight:500; }

.bankroll-pnl { font-size:11px; letter-spacing:.06em; }
.pnl-pos  { color:rgba(52,211,153,.65); }
.pnl-neg  { color:rgba(239,68,68,.65); }
.pnl-zero { color:rgba(255,255,255,.2); }

.bankroll-broke-msg { margin-top:8px; font-size:11px; color:#f87171; text-align:center; letter-spacing:.08em; }

/* ════════════════════════════════════════════════════════════
   STATS
════════════════════════════════════════════════════════════ */
.stats-section { margin-bottom:16px; }
.section-label {
	font-size:8px; font-weight:800; letter-spacing:.3em;
	color:rgba(255,255,255,.2); text-transform:uppercase;
	margin:0 0 10px; text-align:center;
}
.stats-grid {
	display:grid; grid-template-columns:repeat(5,1fr); gap:6px;
}
.stat-cell {
	background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.05);
	border-radius:12px; padding:10px 6px; text-align:center;
}
.stat-wide { grid-column:span 1; }
.stat-val {
	display:block; font-size:clamp(15px,3vw,18px); font-weight:900;
	color:rgba(255,255,255,.7); font-variant-numeric:tabular-nums;
	line-height:1; margin-bottom:4px;
}
.stat-win  { color:#34d399; }
.stat-loss { color:#f87171; }
.stat-warn { color:#fbbf24; }
.stat-key  { display:block; font-size:8px; color:rgba(255,255,255,.22); letter-spacing:.1em; text-transform:uppercase; }

/* ════════════════════════════════════════════════════════════
   LAST PLAYED
════════════════════════════════════════════════════════════ */
.last-section { margin-bottom:16px; }
.last-card {
	display:flex; align-items:center; gap:10px;
	background:rgba(180,150,40,.06); border:1px solid rgba(180,150,40,.18);
	border-radius:14px; padding:12px 16px; text-decoration:none; color:#fff;
	transition:all .2s;
}
.last-card:hover { background:rgba(180,150,40,.1); border-color:rgba(180,150,40,.3); }
.last-badge { font-size:9px; font-weight:800; letter-spacing:.15em; color:rgba(180,150,40,.8); white-space:nowrap; }
.last-name  { flex:1; font-size:13px; font-weight:700; letter-spacing:.08em; text-align:center; }
.last-cta   { font-size:11px; color:rgba(180,150,40,.6); white-space:nowrap; }

/* ════════════════════════════════════════════════════════════
   GAME TILES
════════════════════════════════════════════════════════════ */
.games-section { margin-bottom:16px; }
.games-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.games-in .game-tile:nth-child(1) { animation: tileIn .55s cubic-bezier(0.22,1,0.36,1) .05s both; }
.games-in .game-tile:nth-child(2) { animation: tileIn .55s cubic-bezier(0.22,1,0.36,1) .15s both; }
@keyframes tileIn {
	from { opacity:0; transform:translateY(20px) scale(.96); }
	to   { opacity:1; transform:translateY(0) scale(1); }
}

.game-tile {
	position:relative; border-radius:20px; overflow:hidden;
	background:rgba(8,14,20,.9); border:1px solid rgba(255,255,255,.07);
	transition:transform .2s cubic-bezier(0.34,1.3,0.64,1), box-shadow .2s, border-color .2s;
}
.game-tile:hover { transform:translateY(-4px) scale(1.01); }
.bj-tile:hover  { border-color:rgba(52,211,153,.2); box-shadow:0 12px 40px rgba(0,0,0,.5),0 0 24px rgba(52,211,153,.06); }
.bac-tile:hover { border-color:rgba(220,120,30,.2); box-shadow:0 12px 40px rgba(0,0,0,.5),0 0 24px rgba(220,120,30,.06); }
.tile-broke { opacity:.5; pointer-events:none; }

.tile-glow {
	position:absolute; inset:0; opacity:0;
	transition:opacity .3s;
	pointer-events:none;
}
.game-tile:hover .tile-glow { opacity:1; }
.bj-glow  { background:radial-gradient(ellipse at 50% 0%, rgba(52,211,153,.08) 0%, transparent 65%); }
.bac-glow { background:radial-gradient(ellipse at 50% 0%, rgba(220,120,30,.08) 0%, transparent 65%); }

.tile-inner { position:relative; z-index:1; padding:16px 14px 14px; }

.tile-suit-bg {
	position:absolute; bottom:-10px; right:-5px; font-size:80px;
	color:rgba(255,255,255,.025); font-weight:900; pointer-events:none;
	user-select:none; line-height:1;
}

.tile-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.tile-suit    { font-size:20px; color:rgba(255,255,255,.6); }
.bac-suit     { color:rgba(220,120,30,.7); }
.tile-badge {
	font-size:8px; font-weight:800; letter-spacing:.12em;
	border-radius:999px; padding:2px 8px; text-transform:uppercase;
}
.bj-badge  { background:rgba(52,211,153,.12); color:rgba(52,211,153,.8); border:1px solid rgba(52,211,153,.2); }
.bac-badge { background:rgba(220,120,30,.12); color:rgba(220,120,30,.8); border:1px solid rgba(220,120,30,.2); }

.tile-name {
	font-size:16px; font-weight:900; letter-spacing:.12em;
	margin:0 0 6px; text-transform:uppercase; color:#fff;
}
.tile-desc { font-size:11px; color:rgba(255,255,255,.35); line-height:1.5; margin-bottom:10px; }

.tile-meta { display:flex; align-items:center; gap:5px; margin-bottom:12px; }
.tm-item { font-size:8px; color:rgba(255,255,255,.2); letter-spacing:.08em; text-transform:uppercase; }
.tm-dot  { color:rgba(255,255,255,.1); font-size:8px; }

.tile-actions { display:flex; flex-direction:column; gap:6px; }
.tile-play {
	display:block; text-align:center; text-decoration:none;
	font-size:11px; font-weight:800; letter-spacing:.12em;
	border-radius:10px; padding:9px;
	transition:all .15s; text-transform:uppercase;
}
.bj-play  { background:rgba(52,211,153,.15); color:rgba(52,211,153,.9); border:1px solid rgba(52,211,153,.25); }
.bj-play:hover  { background:rgba(52,211,153,.22); border-color:rgba(52,211,153,.4); }
.bac-play { background:rgba(220,120,30,.15); color:rgba(220,120,30,.9); border:1px solid rgba(220,120,30,.25); }
.bac-play:hover { background:rgba(220,120,30,.22); border-color:rgba(220,120,30,.4); }
.tile-play-broke { background:rgba(255,255,255,.04); color:rgba(255,255,255,.2); border:1px solid rgba(255,255,255,.06); cursor:not-allowed; }
.tile-rules { font-size:9px; color:rgba(255,255,255,.2); background:none; border:none; cursor:pointer; transition:color .15s; letter-spacing:.1em; text-transform:uppercase; }
.tile-rules:hover { color:rgba(255,255,255,.5); }

/* ════════════════════════════════════════════════════════════
   HISTORY LINK
════════════════════════════════════════════════════════════ */
.history-section { margin-bottom:24px; }
.history-link {
	display:flex; align-items:center; justify-content:center; gap:10px;
	background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
	border-radius:14px; padding:14px; text-decoration:none; color:rgba(255,255,255,.5);
	font-size:12px; font-weight:600; letter-spacing:.1em; text-transform:uppercase;
	transition:all .2s;
}
.history-link:hover { background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.12); color:rgba(255,255,255,.75); }
.hl-icon { font-size:14px; }
.hl-arrow { margin-left:auto; font-size:14px; opacity:.4; }

/* ════════════════════════════════════════════════════════════
   FOOTER
════════════════════════════════════════════════════════════ */
.lobby-footer {
	text-align:center; font-size:10px; letter-spacing:.18em;
	color:rgba(255,255,255,.1); text-transform:uppercase;
}

/* ════════════════════════════════════════════════════════════
   MODAL
════════════════════════════════════════════════════════════ */
.modal-backdrop {
	position:fixed; inset:0; z-index:40;
	background:rgba(0,0,0,.82); backdrop-filter:blur(6px);
	display:flex; align-items:center; justify-content:center;
	padding:16px;
}
.modal-card {
	position:relative; z-index:50; width:100%; max-width:420px;
	max-height:88dvh; overflow-y:auto;
	background:#07101a; border:1px solid rgba(255,255,255,.08);
	border-radius:24px; padding:28px 24px 20px;
	box-shadow:0 20px 80px rgba(0,0,0,.7);
}
.modal-close {
	position:absolute; top:14px; right:14px;
	background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
	border-radius:8px; color:rgba(255,255,255,.4);
	width:28px; height:28px; cursor:pointer; font-size:11px;
	transition:all .15s; display:flex; align-items:center; justify-content:center;
}
.modal-close:hover { color:#fff; background:rgba(255,255,255,.1); }

.modal-body { }
.modal-header { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
.modal-icon { font-size:28px; color:rgba(52,211,153,.8); }
.bac-modal-icon { color:rgba(220,120,30,.8); }
.modal-header h2 { font-size:20px; font-weight:800; margin:0; }

.rule-section { margin-bottom:16px; }
.rule-heading { font-size:8px; font-weight:800; letter-spacing:.25em; text-transform:uppercase; margin:0 0 8px; }
.bj-heading  { color:rgba(52,211,153,.7); }
.bac-heading { color:rgba(220,120,30,.7); }
.rule-text   { font-size:12px; color:rgba(255,255,255,.55); line-height:1.6; margin:0; }
.rule-note   { font-size:10px; color:rgba(255,255,255,.3); text-align:center; margin-top:8px; }

.value-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.value-cell { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:10px 6px; text-align:center; }
.vc-val { font-size:14px; font-weight:700; color:#fff; margin:0 0 2px; }
.vc-key { font-size:9px; color:rgba(255,255,255,.3); margin:0; }

.action-list { display:flex; flex-direction:column; gap:6px; }
.action-row { display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:10px; padding:8px 12px; }
.act-badge { border-radius:6px; padding:2px 8px; font-size:9px; font-weight:700; color:#fff; white-space:nowrap; }
.act-desc  { font-size:11px; color:rgba(255,255,255,.5); }

.payout-list { display:flex; flex-direction:column; gap:4px; }
.payout-row { display:flex; justify-content:space-between; font-size:12px; color:rgba(255,255,255,.4); padding:4px 0; border-bottom:1px solid rgba(255,255,255,.04); }
.pay-val   { font-weight:700; }
.pay-gold  { color:#fbbf24; }
.pay-green { color:#34d399; }
.pay-amber { color:#f59e0b; }
.pay-red   { color:#f87171; }

.rule-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
.rule-list li { display:flex; align-items:center; gap:8px; font-size:11px; color:rgba(255,255,255,.45); }
.rule-check { color:#34d399; }

.natural-box { background:rgba(180,140,20,.1); border:1px solid rgba(180,140,20,.25); border-radius:10px; padding:10px 14px; font-size:11px; color:rgba(255,220,100,.7); }

.draw-list { display:flex; flex-direction:column; gap:6px; }
.draw-row  { display:flex; gap:10px; font-size:11px; color:rgba(255,255,255,.45); background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:10px; padding:8px 12px; }
.draw-side { font-weight:700; color:rgba(220,120,30,.7); white-space:nowrap; }

.modal-close-btn {
	display:block; width:100%; margin-top:16px;
	background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1);
	border-radius:12px; padding:11px; color:rgba(255,255,255,.5);
	font-size:12px; font-weight:600; letter-spacing:.08em; cursor:pointer;
	transition:all .15s;
}
.modal-close-btn:hover { background:rgba(255,255,255,.09); color:rgba(255,255,255,.8); }

/* ── Auth User Bar ──────────────────────────────────────────────────────── */
.user-bar {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; margin-top: 14px; flex-wrap: wrap;
}
.ub-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  background: rgba(180,150,40,.3);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 900; color: #fbbf24;
  flex-shrink: 0;
}
.ub-user {
  display: flex; align-items: center; gap: 6px;
  text-decoration: none;
  background: rgba(180,150,40,.07); border: 1px solid rgba(180,150,40,.18);
  border-radius: 999px; padding: 4px 12px 4px 5px;
  transition: all .15s;
}
.ub-user:hover { background: rgba(180,150,40,.13); border-color: rgba(180,150,40,.3); }
.ub-name { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.65); letter-spacing: .06em; }
.ub-logout {
  font-size: 10px; color: rgba(248,113,113,.5);
  background: none; border: 1px solid rgba(239,68,68,.15);
  border-radius: 999px; padding: 4px 12px; cursor: pointer; transition: all .15s;
}
.ub-logout:hover { color: #f87171; border-color: rgba(239,68,68,.35); background: rgba(239,68,68,.06); }
.ub-login {
  font-size: 11px; font-weight: 700; color: rgba(52,211,153,.75);
  background: rgba(52,211,153,.07); border: 1px solid rgba(52,211,153,.2);
  border-radius: 999px; padding: 5px 14px; text-decoration: none; transition: all .15s;
}
.ub-login:hover { background: rgba(52,211,153,.14); border-color: rgba(52,211,153,.35); }
.ub-register {
  font-size: 11px; font-weight: 700; color: rgba(220,120,30,.75);
  background: rgba(220,120,30,.07); border: 1px solid rgba(220,120,30,.2);
  border-radius: 999px; padding: 5px 14px; text-decoration: none; transition: all .15s;
}
.ub-register:hover { background: rgba(220,120,30,.14); border-color: rgba(220,120,30,.35); }
.ub-guest { font-size: 9px; color: rgba(255,255,255,.16); letter-spacing: .08em; }

</style>