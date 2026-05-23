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

	function loadFromStorage() {
		bankroll = getBankroll();
		stats    = getStats();
	}

	onMount(() => {
		loadFromStorage();
		// Wenn der Tab wieder sichtbar wird (Rückkehr von Spielseite):
		// Stats und Bankroll aus localStorage neu laden → live aktualisiert
		const onVisible = () => { if (document.visibilityState === 'visible') loadFromStorage(); };
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	function handleReset() {
		const also = confirm(
			'Bankroll auf 1000 CHF zurücksetzen?\n\nOK = auch Session-Stats zurücksetzen\nAbbrechen = nur Bankroll zurücksetzen'
		);
		resetBankroll();
		bankroll = 1000;
		if (also) { resetStats(1000); stats = getStats(); }
	}

	type ModalGame = 'blackjack' | 'baccarat' | null;
	let openModal = $state<ModalGame>(null);

	function open(game: ModalGame) { openModal = game; }
	function close() { openModal = null; }
	function handleBackdrop(e: MouseEvent) {
		if ((e.target as HTMLElement).dataset.backdrop) close();
	}
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<main class="min-h-screen bg-slate-950 px-6 py-12 text-white">
	<div class="mx-auto max-w-xl">

		<!-- ── Titel ─────────────────────────────────────────────────────── -->
		<div class="text-center">
			<h1 class="text-6xl font-bold tracking-tight">🎰 Casino</h1>
			<p class="mt-4 text-lg text-slate-400">Wähle ein Spiel und starte deine Runde.</p>
		</div>

		<!-- ── Session Stats Dashboard ───────────────────────────────────── -->
		<div class="mt-10 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-xs font-semibold tracking-widest text-slate-500 uppercase">Session Stats</h2>
				<button
					onclick={handleReset}
					class="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-500 transition hover:border-slate-500 hover:text-slate-300"
				>
					↺ Reset
				</button>
			</div>

			<!-- Bankroll + P&L: grosse obere Zeile -->
			<div class="mb-4 grid grid-cols-2 gap-3">
				<div class="rounded-xl bg-slate-800/60 px-4 py-3">
					<p class="text-xs text-slate-500 uppercase tracking-wide">Bankroll</p>
					<p class="mt-1 text-2xl font-bold {bankroll <= 0 ? 'text-red-400' : bankroll < 100 ? 'text-amber-400' : 'text-emerald-400'}">
						{bankroll.toFixed(2)} <span class="text-sm font-normal text-slate-400">CHF</span>
					</p>
				</div>
				<div class="rounded-xl bg-slate-800/60 px-4 py-3">
					<p class="text-xs text-slate-500 uppercase tracking-wide">Session P&L</p>
					<p class="mt-1 text-2xl font-bold {profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-slate-400'}">
						{profit > 0 ? '+' : ''}{profit.toFixed(2)} <span class="text-sm font-normal text-slate-400">CHF</span>
					</p>
				</div>
			</div>

			<!-- 6 kleinere Stat-Karten -->
			<div class="grid grid-cols-3 gap-2">
				<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
					<p class="text-[10px] text-slate-500 uppercase tracking-wide">Hands</p>
					<p class="mt-0.5 text-xl font-bold text-white">{stats.handsPlayed}</p>
				</div>
				<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
					<p class="text-[10px] text-slate-500 uppercase tracking-wide">Wins</p>
					<p class="mt-0.5 text-xl font-bold {stats.wins > 0 ? 'text-emerald-400' : 'text-slate-400'}">{stats.wins}</p>
				</div>
				<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
					<p class="text-[10px] text-slate-500 uppercase tracking-wide">Losses</p>
					<p class="mt-0.5 text-xl font-bold {stats.losses > 0 ? 'text-red-400' : 'text-slate-400'}">{stats.losses}</p>
				</div>
				<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
					<p class="text-[10px] text-slate-500 uppercase tracking-wide">Pushes</p>
					<p class="mt-0.5 text-xl font-bold text-amber-400">{stats.pushes}</p>
				</div>
				<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
					<p class="text-[10px] text-slate-500 uppercase tracking-wide">Win Rate</p>
					<p class="mt-0.5 text-xl font-bold {wr >= 50 ? 'text-emerald-400' : wr > 0 ? 'text-amber-400' : 'text-slate-400'}">
						{stats.handsPlayed > 0 ? wr.toFixed(1) + '%' : '—'}
					</p>
				</div>
				<div class="rounded-xl bg-slate-800/40 px-3 py-2.5 text-center">
					<p class="text-[10px] text-slate-500 uppercase tracking-wide">Best Win</p>
					<p class="mt-0.5 text-xl font-bold {stats.biggestWin > 0 ? 'text-emerald-400' : 'text-slate-400'}">
						{stats.biggestWin > 0 ? '+' + stats.biggestWin.toFixed(0) : '—'}
					</p>
				</div>
			</div>
		</div>

		<!-- ── Hinweis bei 0 Guthaben ────────────────────────────────────── -->
		{#if broke}
			<div class="mt-6 rounded-2xl border border-red-900/50 bg-red-950/30 px-5 py-4 text-sm text-red-400 text-center">
				💸 Kein Guthaben mehr. Setze dein Guthaben zurück oder schau dir deine History an.
			</div>
		{/if}

		<!-- ── Spielbuttons ──────────────────────────────────────────────── -->
		<div class="mt-6 flex flex-col gap-6">

			<!-- Blackjack: bei 0 CHF führt der Link zur Spielseite → dort erscheint das Modal -->
			<div class="flex flex-col gap-2">
				<a
					href="/blackjack"
					class="rounded-2xl px-8 py-5 text-xl font-semibold text-center transition active:scale-95
					{broke
						? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-default'
						: 'bg-emerald-600 hover:bg-emerald-500'}"
				>
					🃏 Blackjack starten
				</a>
				<button onclick={() => open('blackjack')} class="text-sm text-slate-500 hover:text-slate-300 transition">
					Blackjack Regeln
				</button>
			</div>

			<!-- Baccarat: gleiche Logik -->
			<div class="flex flex-col gap-2">
				<a
					href="/baccarat"
					class="rounded-2xl px-8 py-5 text-xl font-semibold text-center transition active:scale-95
					{broke
						? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-default'
						: 'bg-emerald-700 hover:bg-emerald-600'}"
				>
					🎴 Baccarat starten
				</a>
				<button onclick={() => open('baccarat')} class="text-sm text-slate-500 hover:text-slate-300 transition">
					Baccarat Regeln
				</button>
			</div>

			<!-- History: immer anklickbar -->
			<a
				href="/history"
				class="rounded-2xl border border-slate-700 bg-slate-900 px-8 py-5 text-xl font-semibold text-center transition hover:bg-slate-800 active:scale-95"
			>
				📜 History
			</a>

		</div>
	</div>
</main>

<!-- ══ MODAL OVERLAY ════════════════════════════════════════════════════════ -->
{#if openModal !== null}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		data-backdrop="true"
		onclick={handleBackdrop}
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
	>
		<div class="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
			<button onclick={close}
				class="absolute top-4 right-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition"
				aria-label="Schliessen">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
				</svg>
			</button>

			{#if openModal === 'blackjack'}
				<div class="pr-4">
					<div class="flex items-center gap-3 mb-6"><span class="text-3xl">🃏</span><h2 class="text-2xl font-bold">Blackjack Regeln</h2></div>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-2">Ziel</h3>
						<p class="text-slate-300 text-sm leading-relaxed">Komme mit deinen Karten möglichst nah an <strong class="text-white">21</strong>, ohne zu überschreiten — und schlage dabei den Dealer.</p>
					</section>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Kartenwerte</h3>
						<div class="grid grid-cols-3 gap-2">
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center"><p class="text-lg font-bold text-white">2 – 10</p><p class="text-xs text-slate-400 mt-1">Nennwert</p></div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center"><p class="text-lg font-bold text-white">J · Q · K</p><p class="text-xs text-slate-400 mt-1">= 10</p></div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center"><p class="text-lg font-bold text-white">A</p><p class="text-xs text-slate-400 mt-1">= 1 oder 11</p></div>
						</div>
					</section>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Aktionen</h3>
						<div class="flex flex-col gap-2">
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"><span class="mt-0.5 rounded-lg bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white shrink-0">Hit</span><p class="text-sm text-slate-300">Ziehe eine weitere Karte.</p></div>
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"><span class="mt-0.5 rounded-lg bg-slate-600 px-2 py-0.5 text-xs font-bold text-white shrink-0">Stand</span><p class="text-sm text-slate-300">Beende deinen Zug — der Dealer spielt.</p></div>
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"><span class="mt-0.5 rounded-lg bg-amber-600 px-2 py-0.5 text-xs font-bold text-white shrink-0">Double</span><p class="text-sm text-slate-300">Verdopple deinen Einsatz, erhalte genau eine weitere Karte.</p></div>
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"><span class="mt-0.5 rounded-lg bg-violet-700 px-2 py-0.5 text-xs font-bold text-white shrink-0">Split</span><p class="text-sm text-slate-300">Teile zwei gleichwertige Karten in zwei separate Hände auf.</p></div>
						</div>
					</section>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Auszahlungen</h3>
						<div class="flex flex-col gap-1 text-sm">
							<div class="flex justify-between"><span class="text-slate-300">Blackjack</span><span class="font-bold text-emerald-400">3:2</span></div>
							<div class="flex justify-between"><span class="text-slate-300">Win</span><span class="font-bold text-emerald-400">1:1</span></div>
							<div class="flex justify-between"><span class="text-slate-300">Push</span><span class="font-bold text-amber-400">Einsatz zurück</span></div>
							<div class="flex justify-between"><span class="text-slate-300">Lose / Bust</span><span class="font-bold text-red-400">Verloren</span></div>
						</div>
					</section>
					<section>
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Hausregeln</h3>
						<ul class="flex flex-col gap-1.5">
							{#each ['6-Deck Shoe','Dealer steht auf Soft 17 (z.B. A+6)','Double after Split erlaubt','Kein Surrender','Dealer prüft auf Blackjack (Peek)'] as rule}
								<li class="flex items-center gap-2 text-sm text-slate-300"><span class="text-emerald-500">✓</span>{rule}</li>
							{/each}
						</ul>
					</section>
				</div>

			{:else if openModal === 'baccarat'}
				<div class="pr-4">
					<div class="flex items-center gap-3 mb-6"><span class="text-3xl">🎴</span><h2 class="text-2xl font-bold">Baccarat Regeln</h2></div>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-2">Ziel</h3>
						<p class="text-slate-300 text-sm leading-relaxed">Wette darauf, wessen Hand näher an <strong class="text-white">9</strong> liegt — Player, Banker oder Tie.</p>
					</section>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Kartenwerte</h3>
						<div class="grid grid-cols-3 gap-2">
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center"><p class="text-lg font-bold text-white">A</p><p class="text-xs text-slate-400 mt-1">= 1</p></div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center"><p class="text-lg font-bold text-white">2 – 9</p><p class="text-xs text-slate-400 mt-1">Nennwert</p></div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center"><p class="text-lg font-bold text-white">10 J Q K</p><p class="text-xs text-slate-400 mt-1">= 0</p></div>
						</div>
						<p class="mt-3 text-xs text-slate-500 text-center">Handwert = Summe mod 10 · Beispiel: 7 + 6 = 13 → Wert <strong class="text-slate-300">3</strong></p>
					</section>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Auszahlungen</h3>
						<div class="flex flex-col gap-1 text-sm">
							<div class="flex justify-between"><span class="text-slate-300">Player Win</span><span class="font-bold text-emerald-400">1:1</span></div>
							<div class="flex justify-between"><span class="text-slate-300">Banker Win</span><span class="font-bold text-emerald-400">0.95:1 (5% Kommission)</span></div>
							<div class="flex justify-between"><span class="text-slate-300">Tie Win</span><span class="font-bold text-emerald-400">8:1</span></div>
							<div class="flex justify-between"><span class="text-slate-300">Tie (P/B-Wette)</span><span class="font-bold text-amber-400">Push</span></div>
						</div>
					</section>
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-2">Natural Hand</h3>
						<div class="rounded-xl border border-amber-700/50 bg-amber-900/20 px-4 py-3">
							<p class="text-sm text-amber-200">✨ Wenn Player oder Banker mit den ersten zwei Karten <strong>8 oder 9</strong> erreicht — keine weiteren Karten.</p>
						</div>
					</section>
					<section>
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Ziehregeln (Punto Banco)</h3>
						<p class="text-xs text-slate-500 mb-3">Laufen automatisch — du musst nur die Karten aufdecken.</p>
						<div class="flex flex-col gap-2">
							<div class="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"><p class="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1">Player</p><p class="text-sm text-slate-400">Zieht bei Wert 0–5 · Steht bei 6–7</p></div>
							<div class="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3"><p class="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1">Banker</p><p class="text-sm text-slate-400">Hängt vom eigenen Wert und der dritten Karte des Players ab — gemäss Punto-Banco-Tabelle.</p></div>
						</div>
					</section>
				</div>
			{/if}

			<button onclick={close}
				class="mt-8 w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 active:scale-95">
				Schliessen
			</button>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
	@keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
</style>