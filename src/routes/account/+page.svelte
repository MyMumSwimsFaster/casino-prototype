<!-- src/routes/account/+page.svelte -->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { clearUserSession } from '$lib/bankroll';
	let { data } = $props();
	// data.user and data.stats come from +page.server.ts
	const user  = data.user;
	const stats = data.stats;

	async function handleLogout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		clearUserSession();        // wipe casino_user + reset bankroll to 2000
		await invalidateAll();     // tell SvelteKit to re-run all load() functions
		await goto('/');
	}

	function fmt(n: number) {
		return n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
</script>

<div class="acc-root">
	<div class="acc-bg" aria-hidden="true">
		<div class="abg-r1"></div><div class="abg-r2"></div>
		<div class="abg-noise"></div>
	</div>
	<div class="acc-content">
		<a href="/" class="acc-back">← Lobby</a>

		<header class="acc-hero">
			<div class="acc-avatar">{user?.username?.[0]?.toUpperCase() ?? '?'}</div>
			<h1 class="acc-name">{user?.username ?? '—'}</h1>
			<p class="acc-email">{user?.email ?? ''}</p>
		</header>

		<!-- Bankroll -->
		<div class="acc-bankroll">
			<span class="abr-label">BANKROLL</span>
			<span class="abr-val {(data.bankroll ?? 1000) <= 0 ? 'abr-broke' : (data.bankroll ?? 1000) < 100 ? 'abr-warn' : 'abr-good'}">
				{fmt(data.bankroll ?? 1000)}
			</span>
			<span class="abr-cur">CHF</span>
		</div>

		<!-- Stats -->
		{#if stats}
			<div class="acc-stats">
				<div class="as-section-label">ALL TIME STATS</div>
				<div class="as-grid">
					<div class="as-cell"><span class="as-val">{stats.hands}</span><span class="as-key">Hands</span></div>
					<div class="as-cell"><span class="as-val as-green">{stats.wins}</span><span class="as-key">Wins</span></div>
					<div class="as-cell"><span class="as-val as-red">{stats.losses}</span><span class="as-key">Losses</span></div>
					<div class="as-cell"><span class="as-val as-amber">{stats.pushes}</span><span class="as-key">Pushes</span></div>
					<div class="as-cell">
						<span class="as-val {stats.winRate >= 50 ? 'as-green' : stats.winRate > 0 ? 'as-amber' : ''}">
							{stats.hands > 0 ? stats.winRate.toFixed(1) + '%' : '—'}
						</span>
						<span class="as-key">Win Rate</span>
					</div>
					<div class="as-cell">
						<span class="as-val {stats.totalPnL > 0 ? 'as-green' : stats.totalPnL < 0 ? 'as-red' : ''}">
							{stats.totalPnL > 0 ? '+' : ''}{fmt(stats.totalPnL)}
						</span>
						<span class="as-key">Total P&L</span>
					</div>
					<div class="as-cell">
						<span class="as-val {stats.bestWin > 0 ? 'as-green' : ''}">
							{stats.bestWin > 0 ? '+' + stats.bestWin.toFixed(0) : '—'}
						</span>
						<span class="as-key">Best Win</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="acc-actions">
			<a href="/history" class="acc-btn-secondary">📜 View History</a>
			<button onclick={handleLogout} class="acc-btn-logout">Sign Out</button>
		</div>
	</div>
</div>

<style>
:global(body) { margin:0; background:#05080d; }
.acc-root { min-height:100dvh;background:#05080d;color:#fff;position:relative;overflow-x:hidden; }
.acc-bg { position:fixed;inset:0;pointer-events:none; }
.abg-r1 { position:absolute;top:-10%;left:-10%;width:60%;height:60%;background:radial-gradient(ellipse,rgba(6,78,59,.18) 0%,transparent 65%); }
.abg-r2 { position:absolute;bottom:-10%;right:-5%;width:50%;height:50%;background:radial-gradient(ellipse,rgba(80,40,10,.14) 0%,transparent 65%); }
.abg-noise { position:absolute;inset:0;opacity:.03;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");background-size:250px; }
.acc-content { position:relative;z-index:1;max-width:420px;margin:0 auto;padding:36px 20px 60px; }
.acc-back    { display:inline-block;font-size:11px;color:rgba(52,211,153,.7);text-decoration:none;letter-spacing:.08em;margin-bottom:28px;transition:color .15s; }
.acc-back:hover { color:#34d399; }

.acc-hero   { text-align:center;margin-bottom:24px; }
.acc-avatar { width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,rgba(6,78,59,.6),rgba(180,150,40,.3));border:1px solid rgba(180,150,40,.3);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#fbbf24;margin:0 auto 12px;text-shadow:0 0 10px rgba(251,191,36,.4); }
.acc-name   { font-size:22px;font-weight:900;letter-spacing:.1em;margin:0 0 4px; }
.acc-email  { font-size:11px;color:rgba(255,255,255,.3);margin:0; }

.acc-bankroll { background:rgba(8,14,20,.88);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:16px 20px;display:flex;align-items:baseline;gap:6px;margin-bottom:16px;position:relative;overflow:hidden; }
.acc-bankroll::before { content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(to right,transparent,rgba(180,150,40,.3),transparent); }
.abr-label { font-size:8px;font-weight:800;letter-spacing:.25em;color:rgba(180,150,40,.7);text-transform:uppercase;margin-right:8px; }
.abr-val   { font-size:clamp(24px,6vw,30px);font-weight:900;font-variant-numeric:tabular-nums; }
.abr-cur   { font-size:13px;color:rgba(255,255,255,.3); }
.abr-good  { color:#34d399;text-shadow:0 0 14px rgba(52,211,153,.3); }
.abr-warn  { color:#fbbf24; }
.abr-broke { color:#f87171; }

.acc-stats { background:rgba(8,14,20,.82);border:1px solid rgba(255,255,255,.06);border-radius:18px;padding:14px 16px;margin-bottom:16px; }
.as-section-label { font-size:7px;font-weight:800;letter-spacing:.3em;color:rgba(255,255,255,.18);text-transform:uppercase;margin-bottom:10px; }
.as-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:8px; }
.as-cell { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:10px;padding:9px 4px;text-align:center; }
.as-val  { display:block;font-size:clamp(13px,3vw,16px);font-weight:900;color:rgba(255,255,255,.7);line-height:1;margin-bottom:3px;font-variant-numeric:tabular-nums; }
.as-key  { display:block;font-size:7px;color:rgba(255,255,255,.2);letter-spacing:.1em;text-transform:uppercase; }
.as-green { color:#34d399; } .as-red { color:#f87171; } .as-amber { color:#fbbf24; }

.acc-actions { display:flex;flex-direction:column;gap:8px; }
.acc-btn-secondary { display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:13px;font-size:13px;font-weight:600;color:rgba(255,255,255,.55);text-decoration:none;transition:all .15s; }
.acc-btn-secondary:hover { background:rgba(255,255,255,.08);color:rgba(255,255,255,.8); }
.acc-btn-logout { background:rgba(127,29,29,.35);border:1px solid rgba(239,68,68,.2);border-radius:14px;padding:13px;font-size:13px;font-weight:700;color:rgba(248,113,113,.7);cursor:pointer;transition:all .15s; }
.acc-btn-logout:hover { background:rgba(153,27,27,.5);color:#fca5a5; }
</style>