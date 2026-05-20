<script lang="ts">
	// ─── Modal state ──────────────────────────────────────────────────────────

	type ModalGame = 'blackjack' | 'baccarat' | null;
	let openModal = $state<ModalGame>(null);

	function open(game: ModalGame) {
		openModal = game;
	}

	function close() {
		openModal = null;
	}

	function handleBackdrop(e: MouseEvent) {
		if ((e.target as HTMLElement).dataset.backdrop) close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<main class="min-h-screen bg-slate-950 px-6 py-16 text-white flex items-center justify-center">
	<div class="mx-auto max-w-xl text-center">
		<h1 class="text-6xl font-bold tracking-tight">🎰 Casino</h1>
		<p class="mt-4 text-lg text-slate-400">Wähle ein Spiel und starte deine Runde.</p>

		<div class="mt-12 flex flex-col gap-6">

			<!-- ── Blackjack ──────────────────────────────────────────────── -->
			<div class="flex flex-col gap-2">
				<a
					href="/blackjack"
					class="rounded-2xl bg-emerald-600 px-8 py-5 text-xl font-semibold transition hover:bg-emerald-500 active:scale-95"
				>
					🃏 Blackjack starten
				</a>
				<button
					onclick={() => open('blackjack')}
					class="text-sm text-slate-500 hover:text-slate-300 transition"
				>
					Blackjack Regeln
				</button>
			</div>

			<!-- ── Baccarat ───────────────────────────────────────────────── -->
			<div class="flex flex-col gap-2">
				<a
					href="/baccarat"
					class="rounded-2xl bg-emerald-700 px-8 py-5 text-xl font-semibold transition hover:bg-emerald-600 active:scale-95"
				>
					🎴 Baccarat starten
				</a>
				<button
					onclick={() => open('baccarat')}
					class="text-sm text-slate-500 hover:text-slate-300 transition"
				>
					Baccarat Regeln
				</button>
			</div>

			<!-- ── History ────────────────────────────────────────────────── -->
			<a
				href="/history"
				class="rounded-2xl border border-slate-700 bg-slate-900 px-8 py-5 text-xl font-semibold transition hover:bg-slate-800 active:scale-95"
			>
				📜 History
			</a>

		</div>
	</div>
</main>

<!-- ══ MODAL OVERLAY ════════════════════════════════════════════════════════ -->
{#if openModal !== null}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		data-backdrop="true"
		onclick={handleBackdrop}
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm
		       animate-[fadeIn_150ms_ease-out]"
		style="animation: fadeIn 150ms ease-out;"
	>
		<!-- Modal box (click inside does NOT close) -->
		<div
			class="relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"
			style="animation: slideUp 180ms ease-out;"
		>
			<!-- Close button -->
			<button
				onclick={close}
				class="absolute top-4 right-4 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white transition"
				aria-label="Schließen"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
				</svg>
			</button>

			<!-- ── BLACKJACK REGELN ──────────────────────────────────────── -->
			{#if openModal === 'blackjack'}
				<div class="pr-4">
					<div class="flex items-center gap-3 mb-6">
						<span class="text-3xl">🃏</span>
						<h2 class="text-2xl font-bold">Blackjack Regeln</h2>
					</div>

					<!-- Ziel -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-2">Ziel</h3>
						<p class="text-slate-300 text-sm leading-relaxed">
							Komme mit deinen Karten möglichst nah an <strong class="text-white">21</strong>, ohne zu überschreiten — und schlage dabei den Dealer.
						</p>
					</section>

					<!-- Kartenwerte -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Kartenwerte</h3>
						<div class="grid grid-cols-3 gap-2">
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
								<p class="text-lg font-bold text-white">2 – 10</p>
								<p class="text-xs text-slate-400 mt-1">Nennwert</p>
							</div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
								<p class="text-lg font-bold text-white">J · Q · K</p>
								<p class="text-xs text-slate-400 mt-1">= 10</p>
							</div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
								<p class="text-lg font-bold text-white">A</p>
								<p class="text-xs text-slate-400 mt-1">= 1 oder 11</p>
							</div>
						</div>
					</section>

					<!-- Aktionen -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Aktionen</h3>
						<div class="flex flex-col gap-2">
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
								<span class="mt-0.5 rounded-lg bg-emerald-700 px-2 py-0.5 text-xs font-bold text-white shrink-0">Hit</span>
								<p class="text-sm text-slate-300">Ziehe eine weitere Karte.</p>
							</div>
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
								<span class="mt-0.5 rounded-lg bg-slate-600 px-2 py-0.5 text-xs font-bold text-white shrink-0">Stand</span>
								<p class="text-sm text-slate-300">Beende deinen Zug — der Dealer spielt.</p>
							</div>
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
								<span class="mt-0.5 rounded-lg bg-amber-600 px-2 py-0.5 text-xs font-bold text-white shrink-0">Double</span>
								<p class="text-sm text-slate-300">Verdopple deinen Einsatz, erhalte genau eine weitere Karte.</p>
							</div>
							<div class="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
								<span class="mt-0.5 rounded-lg bg-violet-700 px-2 py-0.5 text-xs font-bold text-white shrink-0">Split</span>
								<p class="text-sm text-slate-300">Teile zwei gleichwertige Karten in zwei separate Hände auf.</p>
							</div>
						</div>
					</section>

					<!-- Hausregeln -->
					<section>
						<h3 class="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-3">Hausregeln</h3>
						<ul class="flex flex-col gap-1.5">
							{#each [
								'6-Deck Shoe',
								'Dealer steht auf Soft 17',
								'Double after Split erlaubt',
								'Kein Surrender',
								'Dealer prüft auf Blackjack (Peek)'
							] as rule}
								<li class="flex items-center gap-2 text-sm text-slate-300">
									<span class="text-emerald-500">✓</span>
									{rule}
								</li>
							{/each}
						</ul>
					</section>
				</div>

			<!-- ── BACCARAT REGELN ───────────────────────────────────────── -->
			{:else if openModal === 'baccarat'}
				<div class="pr-4">
					<div class="flex items-center gap-3 mb-6">
						<span class="text-3xl">🎴</span>
						<h2 class="text-2xl font-bold">Baccarat Regeln</h2>
					</div>

					<!-- Ziel -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-2">Ziel</h3>
						<p class="text-slate-300 text-sm leading-relaxed">
							Wette darauf, wessen Hand näher an <strong class="text-white">9</strong> liegt — Player, Banker oder Unentschieden (Tie).
						</p>
					</section>

					<!-- Kartenwerte -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Kartenwerte</h3>
						<div class="grid grid-cols-3 gap-2">
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
								<p class="text-lg font-bold text-white">A</p>
								<p class="text-xs text-slate-400 mt-1">= 1</p>
							</div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
								<p class="text-lg font-bold text-white">2 – 9</p>
								<p class="text-xs text-slate-400 mt-1">Nennwert</p>
							</div>
							<div class="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
								<p class="text-lg font-bold text-white">10 J Q K</p>
								<p class="text-xs text-slate-400 mt-1">= 0</p>
							</div>
						</div>
						<p class="mt-3 text-xs text-slate-500 text-center">
							Handwert = Summe mod 10 · Beispiel: 7 + 6 = 13 → Wert <strong class="text-slate-300">3</strong>
						</p>
					</section>

					<!-- Einsatzmöglichkeiten -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Einsatzmöglichkeiten</h3>
						<div class="grid grid-cols-3 gap-2">
							{#each [
								{ label: 'Player', desc: 'Player gewinnt', color: 'border-emerald-700 bg-emerald-900/30 text-emerald-300' },
								{ label: 'Banker', desc: 'Banker gewinnt', color: 'border-violet-700 bg-violet-900/30 text-violet-300' },
								{ label: 'Tie', desc: 'Gleichstand', color: 'border-amber-700 bg-amber-900/30 text-amber-300' }
							] as opt}
								<div class="rounded-xl border {opt.color} p-3 text-center">
									<p class="font-bold">{opt.label}</p>
									<p class="text-xs mt-1 opacity-80">{opt.desc}</p>
								</div>
							{/each}
						</div>
					</section>

					<!-- Natural -->
					<section class="mb-6">
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-2">Natural Hand</h3>
						<div class="rounded-xl border border-amber-700/50 bg-amber-900/20 px-4 py-3">
							<p class="text-sm text-amber-200">
								✨ Wenn Player oder Banker mit den ersten zwei Karten <strong>8 oder 9</strong> erreicht, ist es eine Natural Hand — es werden keine weiteren Karten gezogen.
							</p>
						</div>
					</section>

					<!-- Ziehregeln -->
					<section>
						<h3 class="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-3">Ziehregeln (Punto Banco)</h3>
						<p class="text-xs text-slate-500 mb-3">Laufen automatisch — du musst nur die Karten aufdecken.</p>
						<div class="flex flex-col gap-2">
							<div class="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
								<p class="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1">Player</p>
								<p class="text-sm text-slate-400">Zieht bei Wert 0 – 5 · Steht bei 6 – 7</p>
							</div>
							<div class="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
								<p class="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1">Banker</p>
								<p class="text-sm text-slate-400">Hängt vom eigenen Wert und der dritten Karte des Players ab — gemäss Punto-Banco-Tabelle.</p>
							</div>
						</div>
					</section>
				</div>
			{/if}

			<!-- Close button bottom -->
			<button
				onclick={close}
				class="mt-8 w-full rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 active:scale-95"
			>
				Schliessen
			</button>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeIn {
		from { opacity: 0; }
		to   { opacity: 1; }
	}
	@keyframes slideUp {
		from { opacity: 0; transform: translateY(12px); }
		to   { opacity: 1; transform: translateY(0); }
	}
</style>