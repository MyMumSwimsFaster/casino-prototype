<script lang="ts">
	import { resetBankroll } from '$lib/bankroll';
	import { resetStats } from '$lib/stats';

	interface Props {
		onReset: () => void;
	}

	let { onReset }: Props = $props();

	function handleReset() {
		resetBankroll();
		resetStats(1000);
		onReset();
	}

	// Verhindert dass Klicks auf dem Card durch zum Backdrop durchdringen
	function stopProp(e: MouseEvent) {
		e.stopPropagation();
	}
</script>

<!--
	Z-Index / Pointer-Events Struktur (von innen nach aussen):
	
	[Outer wrapper]  fixed inset-0 z-[9999]  pointer-events:auto
	  [Backdrop]     absolute inset-0 z-[0]   pointer-events:auto   → schluckt Hintergrundklicks
	  [Modal card]   relative z-[10]           pointer-events:auto   → empfängt alle Interaktionen
	    [pulse-ring] absolute -inset-px        pointer-events:none   → dekorativ, blockiert nichts
	
	Backdrop und Card teilen denselben Stacking Context.
	Backdrop hat z-[0], Card hat z-[10] → Card liegt garantiert über dem Backdrop.
	stopPropagation auf dem Card verhindert Bubbling zum Wrapper.
-->
<div
	class="game-over-backdrop fixed inset-0 z-[9999] flex items-center justify-center px-6"
	role="presentation"
	aria-hidden="false"
>
	<!-- Backdrop: schluckt Klicks auf den Hintergrund -->
	<div class="absolute inset-0 z-0 bg-black/85 backdrop-blur-sm vignette"></div>

	<!-- Modal Card: stopPropagation verhindert dass Klicks den Backdrop erreichen -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="game-over-card relative z-10 w-full max-w-sm rounded-3xl border border-red-900/60 bg-slate-950 p-8 text-center shadow-2xl"
		onclick={stopProp}
		role="dialog"
		aria-modal="true"
	>
		<!-- Pulsierender roter Ring — pointer-events:none damit er Buttons nicht blockiert -->
		<div class="pulse-ring absolute -inset-px rounded-3xl" style="pointer-events: none;"></div>

		<!-- Icon -->
		<div class="skull-icon mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full border-2 border-red-800/60 bg-red-950/60">
			<span class="text-4xl" aria-hidden="true">💸</span>
		</div>

		<!-- Titel -->
		<h1 class="mb-2 text-3xl font-bold tracking-tight text-red-400">
			Out of Money
		</h1>
		<p class="mb-1 text-sm text-slate-400">
			Your bankroll has reached zero.
		</p>
		<p class="mb-8 text-xs text-slate-600">
			The house always wins — but you can try again.
		</p>

		<!-- Divider -->
		<div class="mb-6 h-px bg-gradient-to-r from-transparent via-red-900/50 to-transparent"></div>

		<!-- Buttons -->
		<div class="relative z-20 flex flex-col gap-3">
			<button
				type="button"
				onclick={handleReset}
				class="reset-btn w-full rounded-2xl px-6 py-4 text-base font-bold text-white transition active:scale-95"
			>
				↺ Reset Bankroll — 1000 CHF
			</button>

			<a
				href="/"
				class="block w-full rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 text-base font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white active:scale-95"
			>
				← Return to Home
			</a>
		</div>
	</div>
</div>

<style>
	/* ── Backdrop Fade-In + Vignette ─────────────────────────────────────────── */
	.game-over-backdrop {
		animation: backdropIn 350ms ease both;
	}
	@keyframes backdropIn {
		from { opacity: 0; }
		to   { opacity: 1; }
	}

	.vignette {
		background:
			radial-gradient(ellipse at center, transparent 30%, rgba(185, 28, 28, 0.3) 100%),
			rgba(0, 0, 0, 0.85);
	}

	/* ── Modal Card: fly in von unten ────────────────────────────────────────── */
	.game-over-card {
		animation: cardIn 450ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: 60ms;
	}
	@keyframes cardIn {
		from { opacity: 0; transform: translateY(40px) scale(0.93); }
		to   { opacity: 1; transform: translateY(0) scale(1); }
	}

	/* ── Pulsierender roter Rand ─────────────────────────────────────────────── */
	.pulse-ring {
		background: transparent;
		animation: pulseRing 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
	@keyframes pulseRing {
		0%   { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0.35); }
		50%  { box-shadow: 0 0 24px 8px rgba(220, 38, 38, 0.15); }
		100% { box-shadow: 0 0 0 0   rgba(220, 38, 38, 0); }
	}

	/* ── Icon Bounce ─────────────────────────────────────────────────────────── */
	.skull-icon {
		animation: skullBounce 550ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: 220ms;
	}
	@keyframes skullBounce {
		0%   { opacity: 0; transform: scale(0.4) rotate(-15deg); }
		70%  { transform: scale(1.12) rotate(4deg); }
		100% { opacity: 1; transform: scale(1) rotate(0deg); }
	}

	/* ── Reset Button ────────────────────────────────────────────────────────── */
	.reset-btn {
		background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%);
		border: 1px solid rgba(239, 68, 68, 0.35);
		box-shadow: 0 0 20px rgba(220, 38, 38, 0.2);
	}
	.reset-btn:hover {
		background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
		box-shadow: 0 0 30px rgba(220, 38, 38, 0.38);
	}
</style>