<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { getBankroll, setBankroll, baccaratPayout, type BaccaratSelectedBet, type BaccaratResult } from '$lib/bankroll';
	import { recordRoundDirect, type RoundOutcome } from '$lib/stats';
	import { sfx, getMuted, toggleMuted as _toggleMuted } from '$lib/sounds';
	import GameOver from '$lib/components/GameOver.svelte';

	// ─── Types ────────────────────────────────────────────────────────────────
	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
	type Phase = 'setup' | 'dealing' | 'reveal-initial' | 'reveal-p3' | 'reveal-b3' | 'result';

	interface Card { rank: Rank; suit: Suit; value: number; }

	interface DealtRound {
		playerCards: Card[];
		bankerCards: Card[];
		playerScore: number;
		bankerScore: number;
		naturalHand: boolean;
		playerDrewThird: boolean;
		bankerDrewThird: boolean;
		result: BaccaratResult;
	}

	// ─── Chips ────────────────────────────────────────────────────────────────
	const CHIPS = [
		{ value: 1,   label: '1',   bg: 'bg-slate-100',   border: 'border-slate-300', text: 'text-slate-900' },
		{ value: 5,   label: '5',   bg: 'bg-red-600',     border: 'border-red-400',   text: 'text-white'     },
		{ value: 25,  label: '25',  bg: 'bg-emerald-600', border: 'border-emerald-400',text: 'text-white'    },
		{ value: 100, label: '100', bg: 'bg-slate-900',   border: 'border-slate-400', text: 'text-white'     },
		{ value: 500, label: '500', bg: 'bg-violet-700',  border: 'border-yellow-400',text: 'text-yellow-300'},
	] as const;

	// ─── Deck helpers ─────────────────────────────────────────────────────────
	const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
	const SUITS: Suit[] = ['♠','♥','♦','♣'];

	function cv(rank: Rank): number {
		if (rank === 'A') return 1;
		if (['10','J','Q','K'].includes(rank)) return 0;
		return parseInt(rank);
	}
	function buildDeck(): Card[] {
		const d: Card[] = [];
		for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit, value: cv(rank) });
		return d;
	}
	function shuffle(deck: Card[]): Card[] {
		const d = [...deck];
		for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
		return d;
	}
	function handValue(cards: Card[]): number { return cards.reduce((s, c) => s + c.value, 0) % 10; }
	function cardLabel(c: Card): string { return `${c.rank}${c.suit}`; }
	function isRed(c: Card): boolean { return c.suit === '♥' || c.suit === '♦'; }

	// ─── Punto Banco logic ────────────────────────────────────────────────────
	function computeRound(): DealtRound {
		const deck = shuffle(buildDeck());
		let idx = 0;
		const draw = () => deck[idx++];
		const pc: Card[] = [draw(), draw()];
		const bc: Card[] = [draw(), draw()];
		let pv = handValue(pc), bv = handValue(bc);
		const naturalHand = pv >= 8 || bv >= 8;
		let playerDrewThird = false, bankerDrewThird = false, playerThirdValue: number | null = null;
		if (!naturalHand) {
			if (pv <= 5) { const t = draw(); pc.push(t); playerThirdValue = t.value; playerDrewThird = true; pv = handValue(pc); }
			if (playerDrewThird) {
				const t = playerThirdValue!;
				let bd = false;
				if (bv <= 2) bd = true;
				else if (bv === 3) bd = t !== 8;
				else if (bv === 4) bd = t >= 2 && t <= 7;
				else if (bv === 5) bd = t >= 4 && t <= 7;
				else if (bv === 6) bd = t === 6 || t === 7;
				if (bd) { bc.push(draw()); bankerDrewThird = true; bv = handValue(bc); }
			} else {
				if (bv <= 5) { bc.push(draw()); bankerDrewThird = true; bv = handValue(bc); }
			}
		}
		const ps = handValue(pc), bs = handValue(bc);
		const result: BaccaratResult = ps > bs ? 'Player wins' : bs > ps ? 'Banker wins' : 'Tie';
		return { playerCards: pc, bankerCards: bc, playerScore: ps, bankerScore: bs, naturalHand, playerDrewThird, bankerDrewThird, result };
	}

	// ─── State ────────────────────────────────────────────────────────────────
	let bankroll     = $state(1000);
	let bet          = $state(0);
	let betError     = $state('');
	let selectedBet  = $state<BaccaratSelectedBet>('Player');
	let phase        = $state<Phase>('setup');
	// gameOver reaktiv — feuert sofort wenn bankroll <= 0 nach einer Runde
	// ── Chip-Stack (identical to Blackjack) ─────────────────────────────────
	interface ChipVisual { color: string; edge: string; label: string; }
	function chipStack(amount: number, maxChips = 5): ChipVisual[] {
		if (amount <= 0) return [];
		const stack: ChipVisual[] = [];
		let remaining = amount;
		const denoms = [
			{ value: 500, color: '#4c1d95', edge: '#fde68a', label: '500' },
			{ value: 100, color: '#0f172a', edge: '#94a3b8', label: '100' },
			{ value: 25,  color: '#064e3b', edge: '#6ee7b7', label: '25'  },
			{ value: 5,   color: '#7f1d1d', edge: '#fca5a5', label: '5'   },
			{ value: 1,   color: '#d1d5db', edge: '#6b7280', label: '1'   },
		];
		for (const d of denoms) {
			while (remaining >= d.value && stack.length < maxChips) {
				stack.push({ color: d.color, edge: d.edge, label: d.label });
				remaining -= d.value;
			}
			if (stack.length >= maxChips) break;
		}
		return stack; // index 0 = bottom chip
	}

	// ── Game-Over State ───────────────────────────────────────────────────────
	let gameOver    = $state(false);
	let showHand    = $state(false);
	let goCountdown = $state(0);
	let goTimer: ReturnType<typeof setTimeout> | null = null;

	function startGameOverDelay() {
		if (goTimer !== null) return;
		goCountdown = 3;
		const t1 = setTimeout(() => { goCountdown = 2; }, 1000);
		const t2 = setTimeout(() => { goCountdown = 1; }, 2000);
		goTimer = setTimeout(() => {
			clearTimeout(t1); clearTimeout(t2);
			goTimer = null; goCountdown = 0;
			showHand = false; gameOver = true;
		}, 3000);
	}
	function clearGameOverTimer() {
		if (goTimer !== null) { clearTimeout(goTimer); goTimer = null; }
		goCountdown = 0; gameOver = false; showHand = false;
	}

	// isBankrupt: disables EOR buttons during countdown/show-hand
	let isBankrupt = $derived(bankroll <= 0 && phase === 'result');

	// ── Auto Reveal Toggle ──────────────────────────────────────────────────
	// Controls whether cards reveal automatically (cinematic) or manually (user clicks each card).
	// Does NOT affect game rounds — one round per deal, always.
	let autoReveal = $state(true); // default: cinematic auto-reveal ON

	// ── Chip selection (Blackjack-style) ─────────────────────────────────────
	let selectedChip = $state(25);

	function placeBet(target: BaccaratSelectedBet) {
		betError = '';
		const value = selectedChip;
		const remaining = bankroll - bet;
		// Switching bet target: clear previous bet first
		if (selectedBet !== target) {
			// Different spot: start fresh on new target
			bet = 0;
			selectedBet = target;
		}
		// All-In logic
		if (value > remaining) {
			if (remaining <= 0) { betError = 'Nicht genügend Guthaben.'; return; }
			sfx.chipClick();
			bet += remaining;
			return;
		}
		sfx.chipClick();
		bet += value;
	}
	let saved        = $state(false);
	let round        = $state<DealtRound | null>(null);
	let revealed     = $state<Set<string>>(new Set());
	let payout       = $state(0);
	let bankrollBefore = 0;

	// Verfolgt welche Karten animiert erscheinen sollen (erst nach reveal)
	let animatedCards = $state<Set<string>>(new Set());

	let displayNetResult = $derived(Math.round((bankroll - bankrollBefore) * 100) / 100);

	// ── Result Tier System ─────────────────────────────────────────────────
	// Classifies any net result into an emotional tier for the result overlay.
	type ResultTier = 'blackjack' | 'natural' | 'big-win' | 'medium-win' | 'small-win'
		| 'push' | 'small-loss' | 'heavy-loss';

	function getResultTier(net: number, isNatural = false, isBJ = false): ResultTier {
		if (isBJ)           return 'blackjack';
		if (isNatural)      return 'natural';
		if (net >  200)     return 'big-win';
		if (net >   40)     return 'medium-win';
		if (net >    0)     return 'small-win';
		if (net ===  0)     return 'push';
		if (net > -100)     return 'small-loss';
		return 'heavy-loss';
	}

	// Animated count-up for net display (runs in result phase)
	let animatedNet    = $state(0);
	let netAnimRunning = $state(false);
	function animateNet(target: number) {
		if (target === 0) { animatedNet = 0; return; }
		animatedNet    = 0;
		netAnimRunning = true;
		const dur    = Math.min(700, 200 + Math.abs(target) * 0.4);
		const steps  = 28;
		const step   = target / steps;
		const delay  = dur / steps;
		let  i       = 0;
		const tick = () => {
			i++;
			if (i >= steps) { animatedNet = target; netAnimRunning = false; return; }
			animatedNet = Math.round(step * i * 100) / 100;
			setTimeout(tick, delay);
		};
		setTimeout(tick, 300); // delay slightly so panel appears first
	}

	let muted = $state(false);
	function toggleMute() { muted = _toggleMuted(); }

	// ── Auto Reveal hint (shown once, tracked in localStorage) ───────────────
	let showRevealHint = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	function dismissHint() {
		showRevealHint = false;
		if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
		try { localStorage.setItem('bac_ar_hint_seen', '1'); } catch {}
	}

	onMount(() => {
		bankroll = getBankroll();
		muted = getMuted();
		// Show first-time hint after 1.2s if not seen before
		try {
			if (!localStorage.getItem('bac_ar_hint_seen')) {
				setTimeout(() => {
					showRevealHint = true;
					hintTimer = setTimeout(dismissHint, 5000);
				}, 1200);
			}
		} catch {}
	});

	// ─── Chip helpers ─────────────────────────────────────────────────────────
	function addChip(value: number) {
		if (bet + value > bankroll) return;
		betError = '';
		bet += value;
		sfx.chipClick();
	}
	function clearBet() { bet = 0; betError = ''; }

	// ─── Cinematic Reveal Engine ─────────────────────────────────────────────
	// Baccarat cards reveal automatically with dramatic, staged timing.
	// Players can also tap cards to reveal early (classic feel preserved).

	const DEAL_ORDER: Record<string, number> = { p0: 0, b0: 1, p1: 2, b1: 3 };

	// ─── Timing constants ────────────────────────────────────────────────────
	const T = {
		deal:    480,  // ms between each initial card
		pause:   320,  // breath after all initial cards
		third:   900,  // suspense before 3rd card
		result:  700,  // pause before result panel
		natural: 500,  // extra beat for natural hands
	};

	// ─── Reveal State ─────────────────────────────────────────────────────────
	let revealFocus     = $state<'player'|'banker'|'both'|'none'>('none');
	let anticipating3rd = $state(false);
	let revealRunning   = $state(false);

	// Single timer slot — only one pending step at a time.
	// This makes stopAutoRevealTimer() / continueAutoReveal() reliable.
	let revealTimer: ReturnType<typeof setTimeout> | null = null;

	function stopAutoRevealTimer() {
		if (revealTimer !== null) { clearTimeout(revealTimer); revealTimer = null; }
		revealRunning   = false;
		anticipating3rd = false;
	}

	// Toggle handler — works mid-round
	function setAutoReveal(val: boolean) {
		autoReveal = val;
		if (!val) {
			// OFF: kill any pending timer, hand control to user
			stopAutoRevealTimer();
		} else {
			// ON mid-round: resume from current state if a round is in progress
			if (round && phase !== 'setup' && phase !== 'dealing' && phase !== 'result') {
				continueAutoReveal();
			}
		}
	}

	// ── Internal: schedule one step after `ms` ms ────────────────────────────
	function _after(ms: number, fn: () => void) {
		if (revealTimer !== null) clearTimeout(revealTimer);
		revealTimer = setTimeout(() => { revealTimer = null; fn(); }, ms);
	}

	// ── Reveal one card (sound + state) ──────────────────────────────────────
	function _revealOne(key: string) {
		sfx.cardDeal();
		animatedCards = new Set([...animatedCards, key]);
		revealed      = new Set([...revealed, key]);
	}

	// ── Public: reveal a card (called by manual button or programmatically) ──
	function isRevealed(key: string): boolean { return revealed.has(key); }
	function isRevealable(key: string): boolean {
		if (isRevealed(key)) return false;
		if (phase === 'reveal-initial') return ['p0','b0','p1','b1'].includes(key);
		if (phase === 'reveal-p3')      return key === 'p2';
		if (phase === 'reveal-b3')      return key === 'b2';
		return false;
	}

	// Manual card tap
	function revealCard(key: string) {
		if (!isRevealable(key) || revealRunning) return;
		_revealOne(key);
		// After manual tap, let _nextStep decide what comes next
		_after(T.pause, () => _nextStep(key));
	}

	// ── Heart of the engine: decide what to do after any reveal ──────────────
	function _nextStep(justRevealed?: string) {
		if (!round) return;

		// Phase: initial 4 cards
		if (phase === 'reveal-initial') {
			const order = ['p0','b0','p1','b1'];
			const next = order.find(k => !revealed.has(k));

			if (next) {
				// Still cards to reveal in initial phase
				if (!autoReveal) return; // manual — show button
				revealFocus = next.startsWith('p') ? 'player' : 'banker';
				_after(T.deal, () => { _revealOne(next); _after(0, () => _nextStep(next)); });
				return;
			}

			// All 4 initial cards revealed
			revealFocus = 'both';
			if (round.naturalHand) {
				if (!autoReveal) { finishRound(); return; }
				_after(T.pause + T.natural, () => finishRound());
				return;
			}
			if (round.playerDrewThird) {
				phase = 'reveal-p3';
				if (!autoReveal) {
					// Show anticipation animation, then hand back to manual button
					_showAnticipation('player');
					return;
				}
				_startThirdCard('player', 'p2', () => _nextStep('p2'));
				return;
			}
			if (round.bankerDrewThird) {
				phase = 'reveal-b3';
				if (!autoReveal) {
					_showAnticipation('banker');
					return;
				}
				_startThirdCard('banker', 'b2', () => finishRound());
				return;
			}
			// No 3rd cards needed
			if (!autoReveal) { finishRound(); return; }
			_after(T.result, () => finishRound());
			return;
		}

		// Phase: player 3rd card just revealed
		if (phase === 'reveal-p3') {
			if (round.bankerDrewThird) {
				phase = 'reveal-b3';
				if (!autoReveal) {
					_showAnticipation('banker');
					return;
				}
				_startThirdCard('banker', 'b2', () => finishRound());
			} else {
				if (!autoReveal) { finishRound(); return; }
				_after(T.result, () => finishRound());
			}
			return;
		}

		// Phase: banker 3rd card just revealed → result
		if (phase === 'reveal-b3') {
			if (!autoReveal) { finishRound(); return; }
			_after(T.result, () => finishRound());
			return;
		}
	}

	// Anticipation + reveal for a 3rd card (auto mode: reveals automatically)
	function _startThirdCard(side: 'player'|'banker', key: string, onDone: () => void) {
		anticipating3rd = true;
		revealFocus     = side;
		_after(T.third, () => {
			anticipating3rd = false;
			_revealOne(key);
			_after(T.pause, onDone);
		});
	}

	// Anticipation animation only (manual mode: shows overlay, then stops — user clicks)
	function _showAnticipation(side: 'player'|'banker') {
		anticipating3rd = true;
		revealFocus     = side;
		_after(T.third, () => {
			anticipating3rd = false;
			// Do NOT reveal — just hand back control to the manual button
		});
	}

	// ── Start the sequence (called from dealCards) ────────────────────────────
	function runRevealSequence() {
		if (!round || revealRunning) return;
		revealFocus = 'player';
		// Kick off with first card after a short lead-in delay
		_after(T.deal * 0.5, () => {
			_revealOne('p0');
			_after(0, () => _nextStep('p0'));
		});
	}

	// ── Resume auto-reveal from mid-round state (Toggle ON during round) ──────
	function continueAutoReveal() {
		if (!round || phase === 'result') return;
		// Determine current progress and call _nextStep with pseudo-last reveal
		// _nextStep reads `revealed` and `phase` to find the right next action
		_after(T.deal * 0.5, () => _nextStep());
	}

	function thirdCardDelay(): number { return 0; }

	async function dealCards() {
		betError = '';
		if (bet <= 0)         { betError = 'Bitte zuerst Einsatz wählen.'; return; }
		if (bet > bankroll)   { betError = 'Nicht genügend Guthaben.'; return; }

		bankrollBefore = bankroll;
		bankroll -= bet;
		setBankroll(bankroll);

		phase         = 'dealing';
		saved         = false;
		revealed      = new Set();
		animatedCards = new Set();
		payout        = 0;

		await new Promise(r => setTimeout(r, 350));
		round = computeRound();
		phase = 'reveal-initial';
		revealFocus = 'none';
		anticipating3rd = false;
		revealRunning   = false;
		// Auto Reveal ON: cinematic sequence. OFF: wait for manual clicks.
		if (autoReveal) { runRevealSequence(); }
	}

	async function finishRound() {
		if (!round || saved) return;
		revealRunning = false;
		phase = 'result';
		setTimeout(() => animateNet(displayNetResult), 80);

		payout = baccaratPayout(bet, selectedBet, round.result);
		bankroll += payout;
		setBankroll(bankroll);

		// ── Session Stats ────────────────────────────────────────────────────
		const bacNetResult = Math.round((payout - bet) * 100) / 100;
		const bacOutcome: RoundOutcome =
			bacNetResult > 0 ? 'win' :
			bacNetResult < 0 ? 'loss' :
			'push';
		recordRoundDirect(bacOutcome, bacNetResult, 1);
		// ── Game Over delay ────────────────────────────────────────────────
		if (bankroll <= 0) { startGameOverDelay(); }

		// ── Sounds ───────────────────────────────────────────────────────────
		setTimeout(() => {
			if (round?.naturalHand) sfx.natural();
			else if (bacNetResult > 0) sfx.win();
			else if (bacNetResult < 0) sfx.lose();
		}, 350);

		try {
			await fetch('/api/save-game', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					game: 'baccarat', bet, selectedBet,
					playerCards:    round.playerCards.map(cardLabel),
					bankerCards:    round.bankerCards.map(cardLabel),
					playerScore:    round.playerScore,
					bankerScore:    round.bankerScore,
					result:         round.result,
					playerWon:      payout > 0,
					naturalHand:    round.naturalHand,
					payout:         Math.round(payout * 100) / 100,
					bankrollBefore: Math.round(bankrollBefore * 100) / 100,
					bankrollAfter:  Math.round(bankroll * 100) / 100,
					netResult:      Math.round((bankroll - bankrollBefore) * 100) / 100,
				})
			});
			saved = true;
		// Für "Erneut spielen" merken
		lastBet = bet;
		lastSelectedBet = selectedBet;
		} catch (e) { console.error('Failed to save:', e); }
	}

	function handleGameOverReset() {
		clearGameOverTimer();
		bankroll = 1000; bet = 0;
		lastBet = 0; replayError = '';
		phase = 'setup';
	}

	// ── End-of-Round State ──────────────────────────────────────────────────
	let lastBet          = $state(0);
	let lastSelectedBet  = $state<BaccaratSelectedBet>('Player');
	let replayError      = $state('');

	function playAgain() {
		replayError = '';
		if (lastBet <= 0) { newBet(); return; }
		if (lastBet > bankroll) {
			replayError = 'Nicht genügend Guthaben für dieselben Einsatz.';
			return;
		}
		// Spielzustand sauber zurücksetzen
		round = null; payout = 0; saved = false;
		revealed = new Set(); animatedCards = new Set();
		betError = '';
		// Letzten Einsatz wiederherstellen
		bet = lastBet;
		selectedBet = lastSelectedBet;
		// Sofort dealen
		dealCards();
	}

	function newBet() {
		clearGameOverTimer();
		round = null; payout = 0; saved = false;
		revealed = new Set(); animatedCards = new Set();
		phase = 'setup'; betError = ''; replayError = ''; bet = 0;
		revealFocus = 'none'; anticipating3rd = false; revealRunning = false;
	}

	function newRound() { newBet(); }

	function phaseHint(): string {
		if (phase === 'reveal-initial') {
			// Nächste Karte in der Casino-Reihenfolge anzeigen
			const order = ['p0','b0','p1','b1'];
			const next = order.find(k => !revealed.has(k));
			const labels: Record<string, string> = { p0: 'Player 1', b0: 'Banker 1', p1: 'Player 2', b1: 'Banker 2' };
			return next ? `${labels[next]} aufdecken…` : '';
		}
		if (phase === 'reveal-p3') return 'Player — 3. Karte aufdecken…';
		if (phase === 'reveal-b3') return 'Banker — 3. Karte aufdecken…';
		return '';
	}

	function visibleScore(cards: Card[], prefix: string): number | null {
		const vis = cards.filter((_, i) => revealed.has(`${prefix}${i}`));
		return vis.length === 0 ? null : handValue(vis);
	}

	// Gibt CSS-Animationsdelay für eine Karte zurück
	function cardRevealDelay(key: string, isThird = false): string {
		if (isThird) return `${thirdCardDelay()}ms`;
		return `${(DEAL_ORDER[key] ?? 0) * 130}ms`;
	}
</script>

<!-- ═══════════════════════════════════════════════════════════
     BACCARAT — Cinematic Casino Experience
═══════════════════════════════════════════════════════════════ -->
<main class="bac-root">

  <!-- TOAST -->
  {#if goCountdown > 0}
    <div class="bac-toast" transition:fly={{ y: -14, duration: 260 }}>
      💸 Bankrott — Letzte Hand <strong class="bac-toast-num">{goCountdown}</strong>
    </div>
  {/if}

  <!-- HEADER -->
  <header class="bac-header">
    <a href="/" class="bac-header-link">← Menü</a>
    <div class="bac-bankroll">
      <span class="bac-bankroll-lbl">Balance</span>
      <span class="bac-bankroll-val {bankroll<=0?'red':bankroll<100?'amber':'green'}">
        {bankroll.toFixed(2)} CHF
      </span>
    </div>
    <div class="bac-header-right">
      <button onclick={toggleMute} class="bac-mute" aria-label="Mute">
        {muted ? '🔇' : '🔊'}
      </button>
      <!-- Auto Reveal toggle -->
      <div class="bac-ar-wrap">
        <button onclick={() => { setAutoReveal(!autoReveal); dismissHint(); }}
          class="bac-ar-btn {autoReveal ? 'bac-ar-on' : 'bac-ar-off'}"
          title={autoReveal ? 'Cinematic auto-reveal aktiv' : 'Manuelles Aufdecken aktiv'}
          aria-label="Toggle auto reveal">
          <span class="bac-ar-dot {autoReveal ? 'bac-ar-dot-on' : ''}"></span>
          <span class="bac-ar-icon">{autoReveal ? '🎬' : '🎴'}</span>
          <span class="bac-ar-label">{autoReveal ? 'AUTO' : 'MANUAL'}</span>
        </button>
        <!-- First-time hint bubble -->
        {#if showRevealHint}
          <div class="bac-hint-bubble" transition:fly={{ y: 6, duration: 280 }}>
            <span class="bac-hint-arrow"></span>
            <p class="bac-hint-title">Reveal Mode</p>
            <p class="bac-hint-body">Auto — cinematic reveal<br>Manual — flip each card</p>
            <button onclick={dismissHint} class="bac-hint-close">✕</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- TABLE -->
  <section class="bac-table">
    <div class="bac-felt" aria-hidden="true">
      <div class="bac-felt-inner"></div>
    </div>
    <div class="bac-watermark" aria-hidden="true">
      <p class="bwm1">BACCARAT · PUNTO BANCO</p>
      <p class="bwm2">Banker pays 0.95:1 · Tie pays 8:1 · Natural ends round</p>
    </div>
    <!-- Subtle reveal mode indicator on the felt — visible but unobtrusive -->
    <div class="bac-mode-badge" aria-hidden="true">
      {autoReveal ? '🎬 Cinematic' : '🎴 Manual'}
    </div>

    <!-- ════ SETUP ════════════════════════════════════════════ -->
    {#if phase === 'setup'}
      <div class="bac-setup-layer">

        <!-- THREE BETTING SPOTS -->
        <div class="bac-spots">

          <!-- PLAYER SPOT -->
          <div class="bspot-cell">
            <button onclick={() => placeBet('Player')}
              class="bspot bspot-lg player-spot {selectedBet==='Player'&&bet>0?'player-active':''}"
              aria-label="Bet on Player">
              <svg class="bspot-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" class="bspot-outer player-ring"/>
                <circle cx="50" cy="50" r="36" class="bspot-inner player-ring-i"/>
                <circle cx="50" cy="50" r="27" class="bspot-inner2"/>
              </svg>
              {#if bet > 0 && selectedBet === 'Player'}
                <div class="bchip-tower">
                  {#each chipStack(bet) as c, i}
                    <div class="bchip-coin"
                      style="background:{c.color};box-shadow:0 0 0 2px {c.edge}45,inset 0 2px 0 rgba(255,255,255,.18),0 3px 0 {c.edge}55,0 6px 12px rgba(0,0,0,.4);position:absolute;bottom:{i*11}px;z-index:{i+1};transform:rotate({(i%3-1)*0.8}deg)">
                      <span class="bchip-lbl" style="color:{c.edge}">{c.label}</span>
                    </div>
                  {/each}
                </div>
                <span class="bchip-pill">{bet} CHF</span>
                <button onclick={(e)=>{e.stopPropagation();bet=0;}} class="bspot-x">✕</button>
              {:else}
                <span class="bspot-name player-name">PLAYER</span>
                <span class="bspot-odds">1:1</span>
              {/if}
            </button>
            <span class="bspot-cap player-cap">Player</span>
          </div>

          <!-- TIE SPOT -->
          <div class="bspot-cell">
            <button onclick={() => placeBet('Tie')}
              class="bspot bspot-md tie-spot {selectedBet==='Tie'&&bet>0?'tie-active':''}"
              aria-label="Bet on Tie">
              <svg class="bspot-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" class="bspot-outer tie-ring"/>
                <circle cx="50" cy="50" r="36" class="bspot-inner tie-ring-i"/>
              </svg>
              {#if bet > 0 && selectedBet === 'Tie'}
                <div class="bchip-tower">
                  {#each chipStack(bet) as c, i}
                    <div class="bchip-coin"
                      style="background:{c.color};box-shadow:0 0 0 2px {c.edge}45,inset 0 2px 0 rgba(255,255,255,.18),0 3px 0 {c.edge}55,0 6px 12px rgba(0,0,0,.4);position:absolute;bottom:{i*11}px;z-index:{i+1};transform:rotate({(i%3-1)*0.8}deg)">
                      <span class="bchip-lbl" style="color:{c.edge}">{c.label}</span>
                    </div>
                  {/each}
                </div>
                <span class="bchip-pill">{bet} CHF</span>
                <button onclick={(e)=>{e.stopPropagation();bet=0;}} class="bspot-x">✕</button>
              {:else}
                <span class="bspot-name tie-name">TIE</span>
                <span class="bspot-odds">8:1</span>
              {/if}
            </button>
            <span class="bspot-cap tie-cap">Tie</span>
          </div>

          <!-- BANKER SPOT -->
          <div class="bspot-cell">
            <button onclick={() => placeBet('Banker')}
              class="bspot bspot-lg banker-spot {selectedBet==='Banker'&&bet>0?'banker-active':''}"
              aria-label="Bet on Banker">
              <svg class="bspot-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" class="bspot-outer banker-ring"/>
                <circle cx="50" cy="50" r="36" class="bspot-inner banker-ring-i"/>
                <circle cx="50" cy="50" r="27" class="bspot-inner2"/>
              </svg>
              {#if bet > 0 && selectedBet === 'Banker'}
                <div class="bchip-tower">
                  {#each chipStack(bet) as c, i}
                    <div class="bchip-coin"
                      style="background:{c.color};box-shadow:0 0 0 2px {c.edge}45,inset 0 2px 0 rgba(255,255,255,.18),0 3px 0 {c.edge}55,0 6px 12px rgba(0,0,0,.4);position:absolute;bottom:{i*11}px;z-index:{i+1};transform:rotate({(i%3-1)*0.8}deg)">
                      <span class="bchip-lbl" style="color:{c.edge}">{c.label}</span>
                    </div>
                  {/each}
                </div>
                <span class="bchip-pill">{bet} CHF</span>
                <button onclick={(e)=>{e.stopPropagation();bet=0;}} class="bspot-x">✕</button>
              {:else}
                <span class="bspot-name banker-name">BANKER</span>
                <span class="bspot-odds">0.95:1</span>
              {/if}
            </button>
            <span class="bspot-cap banker-cap">Banker</span>
          </div>
        </div>

        <div class="bac-bet-meta">
          {#if betError}<p class="bac-bet-err">{betError}</p>{/if}
          {#if bet > 0}
            <p class="bac-bet-total">
              <span class="bet-on-label">{selectedBet}</span>
              <strong>{bet} CHF</strong>
            </p>
          {/if}
        </div>

      </div>

    <!-- ════ DEALING ════════════════════════════════════════════ -->
    {:else if phase === 'dealing'}
      <div class="bac-dealing">
        <div class="bac-dealing-icon">🎴</div>
        <span class="bac-dealing-text">Karten werden ausgeteilt…</span>
      </div>

    <!-- ════ REVEAL + RESULT ════════════════════════════════════ -->
    {:else if round !== null}

      <!-- Anticipation overlay: dims table before 3rd card -->
      {#if anticipating3rd}
        <div class="bac-anticipation" transition:fade={{ duration: 300 }}>
          <div class="bac-anticipation-inner">
            <span class="bac-anticipation-text">
              {revealFocus === 'player' ? '— Player —' : '— Banker —'}
            </span>
            <span class="bac-anticipation-sub">3rd card</span>
          </div>
        </div>
      {/if}

      <!-- Natural badge — premium announcement -->
      {#if round.naturalHand && ['p0','b0','p1','b1'].every(k => revealed.has(k))}
        <div class="bac-natural" transition:fly={{ y: -8, duration: 500 }}>
          <span class="bac-natural-star">✦</span>
          <span class="bac-natural-text">Natural Hand</span>
          <span class="bac-natural-star">✦</span>
        </div>
      {/if}

      <!-- Focus vignette: darkens inactive side during reveal -->
      <div class="bac-focus-vignette
        {revealFocus==='player' ? 'focus-player' : revealFocus==='banker' ? 'focus-banker' : ''}">
      </div>

      <!-- CARD TABLE -->
      <div class="bac-card-table">

        <!-- Player area -->
        <div class="bac-side player-side
          {phase==='result' && round.result==='Player wins' ? 'side-winner' : ''}
          {phase==='result' && round.result==='Banker wins' ? 'side-loser' : ''}
          {revealFocus==='banker' ? 'side-dimmed' : ''}">
          <div class="bac-side-header">
            <span class="bac-side-label player-label">PLAYER</span>
            {#if visibleScore(round.playerCards, 'p') !== null}
              <div class="bac-score-pill player-score
                {phase==='result' && round.result==='Player wins' ? 'score-winner' : ''}"
                transition:fade={{ duration: 200 }}>
                {visibleScore(round.playerCards, 'p')}
              </div>
            {/if}
          </div>
          <div class="bac-cards-row">
            {#each [0,1] as i}
              {@const key = `p${i}`}
              <div class="bac-card-wrap">
                <button onclick={() => revealCard(key)} disabled={!isRevealable(key) || revealRunning}
                  class="bac-card {isRevealed(key)?(isRed(round.playerCards[i])?'bac-card-r':'bac-card-b'):(isRevealable(key)?'bac-card-revealable':'bac-card-hidden')}">
                  {#if isRevealed(key)}
                    <div class="{animatedCards.has(key)?'bac-flip':''}  bac-card-face">
                      <span class="bac-cr-tl">{round.playerCards[i].rank}</span>
                      <span class="bac-cr-s">{round.playerCards[i].suit}</span>
                      <span class="bac-cr-br">{round.playerCards[i].rank}</span>
                    </div>
                  {:else}
                    <div class="bac-card-back-pat"></div>
                    <span class="bac-card-back-ico">🂠</span>
                  {/if}
                </button>
              </div>
            {/each}
            {#if round.playerDrewThird && (phase==='reveal-p3'||phase==='reveal-b3'||phase==='result')}
              <div class="bac-card-wrap bac-third-wrap {anticipating3rd && revealFocus==='player' ? 'bac-third-anticipate' : ''}">
                <button onclick={() => revealCard('p2')} disabled={!isRevealable('p2') || revealRunning}
                  class="bac-card bac-third-card {isRevealed('p2')?(isRed(round.playerCards[2])?'bac-card-r':'bac-card-b'):(isRevealable('p2')?'bac-card-revealable':'bac-card-hidden')}">
                  {#if isRevealed('p2')}
                    <div class="{animatedCards.has('p2')?'bac-flip':''}  bac-card-face">
                      <span class="bac-cr-tl">{round.playerCards[2].rank}</span>
                      <span class="bac-cr-s">{round.playerCards[2].suit}</span>
                      <span class="bac-cr-br">{round.playerCards[2].rank}</span>
                    </div>
                  {:else}
                    <div class="bac-card-back-pat"></div>
                    <span class="bac-card-back-ico">🂠</span>
                  {/if}
                </button>
              </div>
            {/if}
          </div>
          {#if phase==='result'}
            <p class="bac-draw-note player-note" transition:fade>
              {round.playerDrewThird ? '+3rd card' : 'Stand'}
            </p>
          {/if}
        </div>

        <!-- VS divider — shows active indicator -->
        <div class="bac-vs">
          {#if phase === 'result'}
            <span class="bac-vs-result
              {round.result==='Player wins'?'vs-player':round.result==='Banker wins'?'vs-banker':'vs-tie'}">
              {round.result==='Player wins'?'P':round.result==='Banker wins'?'B':'T'}
            </span>
          {:else}
            <span class="bac-vs-line">VS</span>
          {/if}
        </div>

        <!-- Banker area -->
        <div class="bac-side banker-side
          {phase==='result' && round.result==='Banker wins' ? 'side-winner' : ''}
          {phase==='result' && round.result==='Player wins' ? 'side-loser' : ''}
          {revealFocus==='player' ? 'side-dimmed' : ''}">
          <div class="bac-side-header">
            <span class="bac-side-label banker-label">BANKER</span>
            {#if visibleScore(round.bankerCards, 'b') !== null}
              <div class="bac-score-pill banker-score
                {phase==='result' && round.result==='Banker wins' ? 'score-winner' : ''}"
                transition:fade={{ duration: 200 }}>
                {visibleScore(round.bankerCards, 'b')}
              </div>
            {/if}
          </div>
          <div class="bac-cards-row">
            {#each [0,1] as i}
              {@const key = `b${i}`}
              <div class="bac-card-wrap">
                <button onclick={() => revealCard(key)} disabled={!isRevealable(key) || revealRunning}
                  class="bac-card {isRevealed(key)?(isRed(round.bankerCards[i])?'bac-card-r':'bac-card-b'):(isRevealable(key)?'bac-card-revealable-b':'bac-card-hidden')}">
                  {#if isRevealed(key)}
                    <div class="{animatedCards.has(key)?'bac-flip':''}  bac-card-face">
                      <span class="bac-cr-tl">{round.bankerCards[i].rank}</span>
                      <span class="bac-cr-s">{round.bankerCards[i].suit}</span>
                      <span class="bac-cr-br">{round.bankerCards[i].rank}</span>
                    </div>
                  {:else}
                    <div class="bac-card-back-pat"></div>
                    <span class="bac-card-back-ico">🂠</span>
                  {/if}
                </button>
              </div>
            {/each}
            {#if round.bankerDrewThird && (phase==='reveal-b3'||phase==='result')}
              <div class="bac-card-wrap bac-third-wrap {anticipating3rd && revealFocus==='banker' ? 'bac-third-anticipate' : ''}">
                <button onclick={() => revealCard('b2')} disabled={!isRevealable('b2') || revealRunning}
                  class="bac-card bac-third-card {isRevealed('b2')?(isRed(round.bankerCards[2])?'bac-card-r':'bac-card-b'):(isRevealable('b2')?'bac-card-revealable-b':'bac-card-hidden')}">
                  {#if isRevealed('b2')}
                    <div class="{animatedCards.has('b2')?'bac-flip':''}  bac-card-face">
                      <span class="bac-cr-tl">{round.bankerCards[2].rank}</span>
                      <span class="bac-cr-s">{round.bankerCards[2].suit}</span>
                      <span class="bac-cr-br">{round.bankerCards[2].rank}</span>
                    </div>
                  {:else}
                    <div class="bac-card-back-pat"></div>
                    <span class="bac-card-back-ico">🂠</span>
                  {/if}
                </button>
              </div>
            {/if}
          </div>
          {#if phase==='result'}
            <p class="bac-draw-note banker-note" transition:fade>
              {round.bankerDrewThird ? '+3rd card' : 'Stand'}
            </p>
          {/if}
        </div>
      </div>

      <!-- Result overlay — cinematic entrance -->
      {#if phase === 'result'}
        {@const _tier = getResultTier(displayNetResult, round?.naturalHand ?? false)}
        <div class="bac-result-overlay ro-bac ro-{_tier}" transition:fly={{ y: 22, duration: 460, delay: 160 }}>

          <!-- Tier badge -->
          <div class="ro-badge ro-badge-{_tier}">
            {#if _tier==='natural'}✦ NATURAL
            {:else if _tier==='big-win'}★ BIG WIN
            {:else if _tier==='medium-win'}✓ WIN
            {:else if _tier==='small-win'}✓ WIN
            {:else if _tier==='push'}◈ TIE · PUSH
            {:else if _tier==='small-loss'}✗ LOSS
            {:else}✗ LOSS{/if}
          </div>

          <!-- Verdict line -->
          <div class="bac-result-verdict
            {round.result==='Player wins'?'verdict-player':round.result==='Banker wins'?'verdict-banker':'verdict-tie'}">
            {round.result}
          </div>

          <!-- Bet + payout rows -->
          <div class="bac-result-rows">
            <div class="bac-result-row">
              <span class="bac-result-lbl">Bet · {selectedBet}</span>
              <span class="bac-result-num">{bet} CHF</span>
            </div>
            {#if payout > 0}
              <div class="bac-result-row">
                <span class="bac-result-lbl">Payout</span>
                <span class="bac-result-pay">+{payout.toFixed(2)} CHF</span>
              </div>
            {/if}
          </div>

          <!-- Animated net -->
          <div class="ro-net ro-net-{_tier}">
            <span class="ro-net-label">Net</span>
            <span class="ro-net-value {netAnimRunning?'ro-counting':''}">
              {animatedNet>0?'+':animatedNet<0?'':''}{animatedNet.toFixed(2)} CHF
            </span>
          </div>
        </div>
      {/if}

    {/if}
  </section>

  <!-- CONTROLS -->
  <footer class="bac-controls">

    {#if phase === 'setup'}
      <div class="bac-chip-rack">
        {#each CHIPS as chip}
          {@const isActive = selectedChip === chip.value}
          {@const cantAfford = bankroll <= 0 && !isActive}
          <button onclick={() => { selectedChip = chip.value; betError = ''; }}
            class="bac-rack-chip {chip.bg} {chip.border} {chip.text}
              {isActive ? 'bac-rack-active' : 'bac-rack-idle'}
              {cantAfford ? 'bac-rack-broke' : ''}">
            <span class="pointer-events-none absolute inset-[4px] rounded-full border border-white/12"></span>
            {#if isActive}<span class="pointer-events-none absolute -inset-[5px] rounded-full border border-white/30 bac-pulse-slow"></span>{/if}
            <span class="relative z-10 text-sm font-extrabold leading-none">{chip.label}</span>
            <span class="relative z-10 text-[8px] leading-none opacity-55">CHF</span>
          </button>
        {/each}
      </div>
      <div class="bac-deal-row">
        {#if bet > 0}
          <button onclick={() => { bet = 0; betError = ''; }} class="bac-clear-btn">✕ Clear</button>
        {/if}
        <button onclick={dealCards} disabled={bet <= 0} class="bac-deal-btn">🎴 Deal</button>
      </div>

    {:else if phase === 'dealing'}
      <div class="bac-phase-footer">Karten werden ausgeteilt…</div>

    {:else if round !== null && phase !== 'result'}
      <!-- During reveal: just ambient text, no buttons -->
      <div class="bac-phase-footer bac-phase-watching">
        {#if anticipating3rd}
          <span class="bac-watching-pulse">
            {revealFocus === 'player' ? '⟨ Player draws ⟩' : '⟨ Banker draws ⟩'}
          </span>
        {:else if autoReveal}
          <span style="opacity:.28">— Karten werden aufgedeckt —</span>
        {:else}
          <!-- Manual mode: show next step as prominent action button -->
          {@const nextKey = ['p0','b0','p1','b1'].find(k => !revealed.has(k))}
          {@const keyLabel: Record<string,string> = {p0:'Player 1',b0:'Banker 1',p1:'Player 2',b1:'Banker 2'}}
          {#if phase === 'reveal-initial' && nextKey}
            <button onclick={() => revealCard(nextKey)}
              class="bac-manual-btn">
              ▶ {keyLabel[nextKey]} aufdecken
            </button>
          {:else if phase === 'reveal-p3'}
            <button onclick={() => revealCard('p2')}
              class="bac-manual-btn bac-manual-player">
              ▶ Player — 3. Karte aufdecken
            </button>
          {:else if phase === 'reveal-b3'}
            <button onclick={() => revealCard('b2')}
              class="bac-manual-btn bac-manual-banker">
              ▶ Banker — 3. Karte aufdecken
            </button>
          {/if}
        {/if}
      </div>

    {:else if phase === 'result'}
      {#if replayError}<p class="bac-replay-err">{replayError}</p>{/if}
      <div class="bac-eor-col">
        {#if lastBet > 0}
          <button onclick={playAgain} disabled={isBankrupt}
            class="bac-eor-replay {isBankrupt?'bac-eor-disabled':''}">
            🔁 Erneut
            <span class="bac-eor-tag">{lastBet} CHF · {lastSelectedBet}</span>
          </button>
        {/if}
        <div class="bac-eor-row">
          <button onclick={newBet} disabled={isBankrupt}
            class="bac-eor-new {isBankrupt?'bac-eor-disabled':''}">
            🎴 Neuer Einsatz
          </button>
          {#if isBankrupt}
            <span class="bac-eor-menu bac-eor-disabled">🏠 Menü</span>
          {:else}
            <a href="/" class="bac-eor-menu">🏠 Menü</a>
          {/if}
        </div>
      </div>

    {/if}
  </footer>

</main>

<!-- GAME OVER MODAL -->
{#if gameOver}
  <div class="bac-go-backdrop" transition:fade={{ duration: 350 }}>
    <div class="bac-go-modal" transition:fly={{ y: 30, duration: 420 }}>
      <div class="bac-go-pulse"></div>
      <div class="bac-go-icon">💸</div>
      <h2 class="bac-go-title">Out of Money</h2>
      <p class="bac-go-sub">Your bankroll has reached zero.</p>
      <p class="bac-go-sub2">The house always wins — but you can try again.</p>
      <div class="bac-go-divider"></div>
      <div class="bac-go-actions">
        <button onclick={() => { gameOver = false; showHand = true; }} class="bac-go-btn bac-go-view">
          👁 Hand ansehen
        </button>
        <button onclick={handleGameOverReset} class="bac-go-btn bac-go-reset">
          ↺ Reset Bankroll — 1000 CHF
        </button>
        <a href="/" class="bac-go-btn bac-go-home">← Return to Home</a>
      </div>
    </div>
  </div>
{/if}

{#if showHand}
  <div class="bac-show-bar" transition:fly={{ y: 16, duration: 250 }}>
    <span class="bac-show-lbl">Letzte Hand — kein Weiterspielen möglich</span>
    <button onclick={() => { showHand = false; gameOver = true; }} class="bac-show-go-btn">
      ⚠ Game Over
    </button>
  </div>
{/if}
<style>

/* ════════════════════════════════════════════════════
   CINEMATIC ADDITIONS
════════════════════════════════════════════════════ */

/* Anticipation overlay — dims table before 3rd card */
.bac-anticipation {
  position: absolute; inset: 0; z-index: 18;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.bac-anticipation-inner {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.bac-anticipation-text {
  font-size: 18px; font-weight: 700; letter-spacing: .25em;
  color: rgba(255,255,255,.7); text-transform: uppercase;
  animation: anticipatePulse 0.9s ease-in-out infinite alternate;
}
.bac-anticipation-sub {
  font-size: 10px; letter-spacing: .3em;
  color: rgba(255,255,255,.3); text-transform: uppercase;
}
@keyframes anticipatePulse {
  from { opacity: .5; letter-spacing: .22em; }
  to   { opacity: 1;  letter-spacing: .28em; }
}

/* Focus vignette — directional spotlight during reveal */
.bac-focus-vignette {
  position: absolute; inset: 0; z-index: 6;
  pointer-events: none;
  transition: background 600ms ease;
  background: transparent;
}
.bac-focus-vignette.focus-player {
  background: linear-gradient(to right,
    transparent 0%, transparent 40%,
    rgba(0,0,0,.28) 65%, rgba(0,0,0,.45) 100%
  );
}
.bac-focus-vignette.focus-banker {
  background: linear-gradient(to left,
    transparent 0%, transparent 40%,
    rgba(0,0,0,.28) 65%, rgba(0,0,0,.45) 100%
  );
}

/* Natural badge — premium gold */
.bac-natural {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  z-index: 15;
  display: flex; align-items: center; gap: 10px;
  background: linear-gradient(135deg, rgba(92,60,0,.9), rgba(60,38,0,.9));
  border: 1px solid rgba(251,191,36,.45);
  border-radius: 999px; padding: 7px 22px;
  animation: naturalGlowAnim 1.2s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes naturalGlowAnim {
  0%   { opacity:0; transform:translateX(-50%) scale(.85) translateY(6px);
         box-shadow:0 0 0 0 rgba(251,191,36,0); }
  50%  { box-shadow:0 0 32px 10px rgba(251,191,36,.4); }
  100% { opacity:1; transform:translateX(-50%) scale(1) translateY(0);
         box-shadow:0 0 16px 4px rgba(251,191,36,.18); }
}
.bac-natural-star { font-size:11px; color:rgba(251,191,36,.7); }
.bac-natural-text {
  font-size:13px; font-weight:800; letter-spacing:.18em;
  color:#fbbf24; text-transform:uppercase;
}

/* Side states */
.side-loser {
  opacity: .55;
  filter: saturate(.4) brightness(.8);
  transition: opacity 800ms ease, filter 800ms ease;
}
.side-dimmed {
  opacity: .65;
  filter: brightness(.75);
  transition: opacity 400ms ease, filter 400ms ease;
}
.side-winner {
  border-color: rgba(74,222,128,.35) !important;
  animation: sideWinnerGlow 2s ease-in-out infinite alternate;
}
@keyframes sideWinnerGlow {
  from { box-shadow: 0 0 16px rgba(74,222,128,.08), inset 0 0 12px rgba(74,222,128,.03); }
  to   { box-shadow: 0 0 32px rgba(74,222,128,.16), inset 0 0 20px rgba(74,222,128,.06); }
}

/* Score winner pill */
.score-winner {
  background: rgba(6,78,59,.85) !important;
  border-color: rgba(52,211,153,.5) !important;
  color: #34d399 !important;
  box-shadow: 0 0 14px rgba(52,211,153,.2);
  animation: scorePop .5s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes scorePop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.18); }
  100% { transform: scale(1); }
}

/* VS indicator — morphs into result badge */
.bac-vs-result {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  font-size: 11px; font-weight: 900;
  animation: vsResultPop .6s cubic-bezier(0.34,1.56,0.64,1) both;
}
.vs-player { background: rgba(29,78,216,.8); border: 1px solid rgba(96,165,250,.5); color: #93c5fd; }
.vs-banker { background: rgba(185,28,28,.8); border: 1px solid rgba(239,68,68,.5); color: #fca5a5; }
.vs-tie    { background: rgba(120,90,10,.8); border: 1px solid rgba(251,191,36,.5); color: #fde68a; }
@keyframes vsResultPop {
  0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
  60%  { transform: scale(1.2) rotate(3deg); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}
.bac-vs-line { font-size: 9px; font-weight: 800; letter-spacing: .12em; color: rgba(255,255,255,.15); }

/* Result overlay — cinematic verdict */
.bac-result-verdict {
  text-align: center;
  font-size: 18px; font-weight: 800; letter-spacing: .08em;
  padding: 12px 0 8px;
  animation: verdictSlide .5s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes verdictSlide {
  from { opacity: 0; transform: translateY(-8px); letter-spacing: .18em; }
  to   { opacity: 1; transform: translateY(0);    letter-spacing: .08em; }
}
.verdict-player { color: #60a5fa; }
.verdict-banker { color: #f87171; }
.verdict-tie    { color: #fbbf24; }
.bac-result-rows { border-top: 1px solid rgba(255,255,255,.08); margin-top: 8px; padding-top: 8px; }

/* Third card anticipation slot glow */
.bac-third-anticipate .bac-card {
  animation: thirdAnticipate 0.8s ease-in-out infinite alternate !important;
}
@keyframes thirdAnticipate {
  from { box-shadow: 0 0 0 1.5px rgba(255,255,255,.15), 0 8px 24px rgba(0,0,0,.5); }
  to   { box-shadow: 0 0 0 2px rgba(255,255,255,.45),   0 8px 30px rgba(0,0,0,.6), 0 0 20px rgba(255,255,255,.08); }
}

/* Dealing animation */
.bac-dealing { position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px; }
.bac-dealing-icon { font-size:36px; animation:bacDealSpin 1s ease-in-out infinite; }
@keyframes bacDealSpin { 0%,100%{transform:rotate(-8deg) scale(1);} 50%{transform:rotate(8deg) scale(1.08);} }
.bac-dealing-text { font-size:12px; letter-spacing:.2em; color:rgba(255,255,255,.3); text-transform:uppercase; }

/* Watching footer */
.bac-phase-watching { letter-spacing:.15em; }
.bac-watching-pulse {
  color: rgba(255,255,255,.55);
  animation: watchPulse 1.2s ease-in-out infinite;
}
@keyframes watchPulse {
  0%,100% { opacity:.4; }
  50%     { opacity:.85; }
}

/* ════════════════════════════════════════════════════
   ROOT / LAYOUT (identical structure to Blackjack)
════════════════════════════════════════════════════ */
.bac-root {
  display: flex; flex-direction: column;
  height: 100dvh; max-height: 100dvh;
  background: #06090d; color: #fff;
  overflow: hidden;
}
.green { color: #4ade80; } .amber { color: #fbbf24; } .red { color: #f87171; }

/* Header */
.bac-header { display:flex;align-items:center;justify-content:space-between;padding:10px 16px 6px;background:rgba(0,0,0,.45);border-bottom:1px solid rgba(255,255,255,.04);flex-shrink:0;z-index:20; }
.bac-header-link { font-size:11px;color:rgba(74,222,128,.7);text-decoration:none;letter-spacing:.05em; }
.bac-header-link:hover { color:#4ade80; }
.bac-bankroll { display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:4px 12px; }
.bac-bankroll-lbl { font-size:8px;letter-spacing:.15em;color:rgba(255,255,255,.25);text-transform:uppercase; }
.bac-bankroll-val { font-size:14px;font-weight:800;line-height:1.1; }
.bac-mute { width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);font-size:13px;cursor:pointer;transition:background .15s;display:flex;align-items:center;justify-content:center; }
.bac-mute:hover { background:rgba(255,255,255,.1); }

/* Table */
.bac-table { flex:1;position:relative;overflow:hidden;display:flex;flex-direction:column; }
.bac-felt { position:absolute;inset:0;overflow:hidden; }
.bac-felt-inner {
  position:absolute;inset:0;
  background: radial-gradient(ellipse 160% 110% at 50% -5%, #13562a 0%, #0b3d1c 30%, #072011 60%, #030f07 100%);
}
.bac-felt-inner::after { content:'';position:absolute;inset:0;opacity:.055;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");background-size:250px; }
.bac-felt::before { content:'';position:absolute;inset:0;background:radial-gradient(ellipse 88% 88% at 50% 50%,transparent 38%,rgba(0,0,0,.20) 68%,rgba(0,0,0,.48) 100%);box-shadow:inset 0 0 0 1px rgba(180,140,40,.15),inset 0 0 60px rgba(0,0,0,.32);pointer-events:none;z-index:3; }
.bac-felt::after  { content:'';position:absolute;bottom:-55px;left:-12%;right:-12%;height:110px;background:linear-gradient(to bottom,#2c1a09,#190f05);border-radius:50% 50% 0 0/75px 75px 0 0;box-shadow:0 -3px 14px rgba(0,0,0,.55);z-index:4; }
.bac-watermark { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;z-index:2;width:100%;overflow:visible; }
.bwm1 { font-size:11px;font-weight:800;letter-spacing:.22em;color:rgba(255,255,255,.055);text-transform:uppercase; }
.bwm2 { font-size:7px;letter-spacing:.1em;color:rgba(255,255,255,.03);margin-top:4px; }

/* ════════════════════════════════════════════════════
   SETUP LAYER
════════════════════════════════════════════════════ */
.bac-setup-layer { position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:8px; }

.bac-spots { display:flex;align-items:flex-end;justify-content:center;gap:8px;width:100%;padding:0 12px; }
.bspot-cell { display:flex;flex-direction:column;align-items:center;gap:3px; }

/* Spots */
.bspot { position:relative;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;transition:transform .18s ease,filter .18s ease;overflow:visible; }
.bspot:hover  { transform:scale(1.06);filter:brightness(1.18); }
.bspot:active { transform:scale(0.96); }
.bspot-lg { width:130px;height:130px; }
.bspot-md { width:90px; height:90px;  }

.bspot-svg { position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1; }
.bspot-outer  { fill:none;stroke:rgba(255,255,255,.13);stroke-width:1.2; }
.bspot-inner  { fill:none;stroke:rgba(255,255,255,.07);stroke-width:.8;stroke-dasharray:4 3; }
.bspot-inner2 { fill:none;stroke:rgba(255,255,255,.04);stroke-width:.6; }

/* Player: blue */
.player-ring    { stroke:rgba(96,165,250,.4); }
.player-ring-i  { stroke:rgba(96,165,250,.15); }
.player-spot    { background:radial-gradient(circle at 50% 60%,rgba(29,78,216,.22) 0%,transparent 65%); }
.player-active  { background:radial-gradient(circle at 50% 60%,rgba(29,78,216,.38) 0%,transparent 65%); }
/* Banker: red/crimson */
.banker-ring    { stroke:rgba(239,68,68,.4); }
.banker-ring-i  { stroke:rgba(239,68,68,.15); }
.banker-spot    { background:radial-gradient(circle at 50% 60%,rgba(185,28,28,.22) 0%,transparent 65%); }
.banker-active  { background:radial-gradient(circle at 50% 60%,rgba(185,28,28,.38) 0%,transparent 65%); }
/* Tie: gold */
.tie-ring   { stroke:rgba(251,191,36,.4); }
.tie-ring-i { stroke:rgba(251,191,36,.15); }
.tie-spot   { background:radial-gradient(circle at 50% 60%,rgba(180,130,20,.2) 0%,transparent 65%); }
.tie-active { background:radial-gradient(circle at 50% 60%,rgba(180,130,20,.35) 0%,transparent 65%); }

.bspot-name { font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.22);position:relative;z-index:5; }
.player-name { color:rgba(96,165,250,.45); }
.banker-name { color:rgba(239,68,68,.45); }
.tie-name    { color:rgba(251,191,36,.45); }
.bspot-odds { font-size:8px;color:rgba(255,255,255,.12);position:relative;z-index:5;margin-top:1px; }
.bspot-cap  { font-size:8px;letter-spacing:.1em;color:rgba(255,255,255,.15);text-transform:uppercase; }
.player-cap { color:rgba(96,165,250,.25); }
.banker-cap { color:rgba(239,68,68,.25); }
.tie-cap    { color:rgba(251,191,36,.25); }

/* Chip tower on spots */
.bchip-tower { position:absolute;top:12px;left:50%;transform:translateX(-50%);width:34px;height:85px;z-index:10; }
.bchip-coin {
  width:34px;height:34px;border-radius:50%;
  border:2px solid rgba(255,255,255,.18);
  outline:2px solid rgba(0,0,0,.25);outline-offset:-5px;
  display:flex;align-items:center;justify-content:center;
}
.bchip-coin::before { content:'';position:absolute;inset:4px;border-radius:50%;border:1.5px solid rgba(255,255,255,.12);pointer-events:none;z-index:1; }
.bchip-coin::after  { content:'';position:absolute;top:3px;left:20%;right:20%;height:40%;border-radius:50%;background:linear-gradient(to bottom,rgba(255,255,255,.18),transparent);pointer-events:none;z-index:3; }
.bchip-lbl { font-size:7px;font-weight:900;letter-spacing:.04em;opacity:.88;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,.6); }
.bchip-pill { position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800;color:rgba(255,255,255,.9);background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:2px 8px;white-space:nowrap;z-index:15; }
.bspot-x { position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.1);font-size:7px;color:rgba(255,255,255,.3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;z-index:20; }
.bspot-x:hover { background:rgba(153,27,27,.7);color:#fca5a5; }

.bac-bet-meta { margin-top:4px;text-align:center;min-height:18px; }
.bac-bet-err  { font-size:11px;color:#f87171; }
.bac-bet-total { font-size:10px;color:rgba(255,255,255,.3); }
.bac-bet-total strong { color:rgba(74,222,128,.7);font-weight:700; }
.bet-on-label { font-size:9px;margin-right:4px;opacity:.6; }

.bac-dealing { position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:rgba(255,255,255,.4);font-size:14px; }
.bac-dealing-icon { font-size:32px;animation:bacSpin 1.2s linear infinite; }
@keyframes bacSpin { to { transform:rotate(360deg); } }

/* ════════════════════════════════════════════════════
   GAME AREA: Card Table
════════════════════════════════════════════════════ */
.bac-natural { position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:15;background:rgba(92,60,0,.8);border:1px solid rgba(251,191,36,.4);border-radius:999px;padding:6px 20px;font-size:11px;font-weight:700;color:#fbbf24;letter-spacing:.1em;white-space:nowrap;animation:naturalGlow 1.2s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes naturalGlow {
  0%   { box-shadow:0 0 0 0 rgba(251,191,36,0); transform:scale(1); }
  25%  { box-shadow:0 0 32px 12px rgba(251,191,36,.55),0 0 0 2px rgba(251,191,36,.3); transform:scale(1.02); }
  60%  { box-shadow:0 0 20px 6px rgba(251,191,36,.3),0 0 0 1px rgba(251,191,36,.15); }
  100% { box-shadow:0 0 10px 2px rgba(251,191,36,.14); transform:scale(1); }
}
.bac-phase-hint { position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:15;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:5px 16px;font-size:11px;color:rgba(255,255,255,.6);white-space:nowrap; }

.bac-card-table { position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;gap:8px;padding:50px 12px 12px; }

.bac-side { flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;border-radius:16px;padding:12px 8px;background:rgba(0,0,0,.15);border:1px solid rgba(255,255,255,.06);transition:border-color .3s,box-shadow .3s; }
.side-winner { border-color:rgba(74,222,128,.3);box-shadow:0 0 20px rgba(74,222,128,.08); }
.bac-side-header { display:flex;flex-direction:column;align-items:center;gap:4px;width:100%; }
.bac-side-label { font-size:8px;font-weight:800;letter-spacing:.2em;text-transform:uppercase; }
.player-label { color:rgba(96,165,250,.6); }
.banker-label { color:rgba(239,68,68,.6); }
.bac-score-pill { min-width:32px;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:800;text-align:center; }
.player-score { border-color:rgba(96,165,250,.25); }
.banker-score { border-color:rgba(239,68,68,.25); }
.bac-cards-row { display:flex;align-items:flex-end; }
.bac-card-wrap { display:contents; }
/* Card lands with natural arc + micro-bounce */
.bac-card { animation:bacCardIn 400ms cubic-bezier(0.22,1,0.36,1) both; }
@keyframes bacCardIn {
  0%   { opacity:0; transform:translateY(-22px) scale(.88) rotate(-1deg); }
  70%  { opacity:1; transform:translateY(3px) scale(1.01) rotate(.25deg); }
  88%  { transform:translateY(-1px) scale(1.002) rotate(0deg); }
  100% { opacity:1; transform:translateY(0) scale(1) rotate(0deg); }
}
.bac-third-wrap { }

/* Cards */
.bac-card {
  width:58px;height:86px;border-radius:8px;
  border:none;padding:0;cursor:pointer;
  position:relative;display:flex;align-items:center;justify-content:center;
  transition:transform .22s cubic-bezier(0.34,1.2,0.64,1),box-shadow .22s;
  margin-left:-10px;
}
.bac-card:first-child { margin-left:0; }
.bac-card:hover:not(:disabled) { transform:translateY(-5px) scale(1.02); box-shadow:0 14px 36px rgba(0,0,0,.7),0 4px 8px rgba(0,0,0,.5) !important; }
.bac-third-card { margin-left:-6px;border:2px solid rgba(255,255,255,.3); }
.bac-card-r {
  background: linear-gradient(160deg,#ffffff,#f8f8f6);
  color:#c41c1c;
  text-shadow:0 1px 2px rgba(196,28,28,.18);
  box-shadow:0 10px 28px rgba(0,0,0,.6),0 3px 6px rgba(0,0,0,.4),0 1px 0 rgba(255,255,255,.9) inset;
}
.bac-card-b {
  background: linear-gradient(160deg,#ffffff,#f8f8f6);
  color:#0d1526;
  text-shadow:0 1px 2px rgba(0,0,0,.18);
  box-shadow:0 10px 28px rgba(0,0,0,.6),0 3px 6px rgba(0,0,0,.4),0 1px 0 rgba(255,255,255,.9) inset;
}
.bac-card-revealable {
  background:linear-gradient(145deg,#1c2d52,#141e38);
  cursor:pointer;
  box-shadow:0 0 0 1.5px rgba(96,165,250,.55),0 8px 24px rgba(0,0,0,.6),0 0 18px rgba(96,165,250,.12);
  animation:pulseRevealP 1.6s ease-in-out infinite;
}
.bac-card-revealable-b {
  background:linear-gradient(145deg,#3a1515,#251010);
  cursor:pointer;
  box-shadow:0 0 0 1.5px rgba(239,68,68,.55),0 8px 24px rgba(0,0,0,.6),0 0 18px rgba(239,68,68,.12);
  animation:pulseRevealB 1.6s ease-in-out infinite;
}
@keyframes pulseRevealP {
  0%,100%{box-shadow:0 0 0 1.5px rgba(96,165,250,.4),0 8px 24px rgba(0,0,0,.6),0 0 12px rgba(96,165,250,.08);}
  50%    {box-shadow:0 0 0 2.5px rgba(96,165,250,.7),0 8px 24px rgba(0,0,0,.6),0 0 22px rgba(96,165,250,.22);}
}
@keyframes pulseRevealB {
  0%,100%{box-shadow:0 0 0 1.5px rgba(239,68,68,.4),0 8px 24px rgba(0,0,0,.6),0 0 12px rgba(239,68,68,.08);}
  50%    {box-shadow:0 0 0 2.5px rgba(239,68,68,.7),0 8px 24px rgba(0,0,0,.6),0 0 22px rgba(239,68,68,.22);}
}
.bac-card-hidden { background:linear-gradient(145deg,#1c2230,#131825);cursor:default;box-shadow:0 8px 22px rgba(0,0,0,.6),0 2px 4px rgba(0,0,0,.4); }
/* pulseReveal replaced by pulseRevealP/pulseRevealB above */
.bac-card-face { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:6px; }
.bac-cr-tl { position:absolute;top:3px;left:4px;font-size:11px;font-weight:900;line-height:1;letter-spacing:-.02em; }
.bac-cr-s  { font-size:22px;font-weight:800;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.1)); }
.bac-cr-br { position:absolute;bottom:3px;right:4px;font-size:11px;font-weight:900;line-height:1;transform:rotate(180deg); }
.bac-card-back-pat {
  position:absolute;inset:4px;border-radius:4px;
  background:
    repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,.035) 4px,rgba(255,255,255,.035) 8px),
    repeating-linear-gradient(-45deg,transparent,transparent 4px,rgba(255,255,255,.025) 4px,rgba(255,255,255,.025) 8px);
}
.bac-card-back-ico { position:relative;z-index:2;font-size:20px;color:rgba(255,255,255,.15); }
.bac-pulse-ring { position:absolute;inset:0;border-radius:7px;pointer-events:none; }
.player-pulse { animation:pulseP 1.4s ease-in-out infinite;box-shadow:0 0 0 2px rgba(96,165,250,.5); }
.banker-pulse { animation:pulseP 1.4s ease-in-out infinite;box-shadow:0 0 0 2px rgba(239,68,68,.5); }
@keyframes pulseP { 0%,100%{opacity:.7;}50%{opacity:1;} }
.bac-flip { animation:bacFlip 530ms cubic-bezier(0.34,1.2,0.64,1) both; }
@keyframes bacFlip {
  0%   { transform:rotateY(92deg) scale(.88); opacity:0; filter:brightness(.6); }
  18%  { opacity:.5; }
  55%  { transform:rotateY(-10deg) scale(1.05); opacity:1; filter:brightness(1.14); }
  78%  { transform:rotateY(3deg) scale(1.01); filter:brightness(1.02); }
  100% { transform:rotateY(0deg) scale(1); opacity:1; filter:brightness(1); }
}
.bac-draw-note { font-size:9px;letter-spacing:.08em;margin-top:4px; }
.player-note { color:rgba(96,165,250,.5); }
.banker-note { color:rgba(239,68,68,.5); }

.bac-vs { display:flex;align-items:center;justify-content:center;width:28px;flex-shrink:0; }
.bac-vs span { font-size:9px;font-weight:800;letter-spacing:.12em;color:rgba(255,255,255,.15);text-transform:uppercase; }

/* Result overlay */
.bac-result-overlay { position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(300px,92%);background:rgba(4,8,14,.85);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:14px 18px 12px;z-index:20;backdrop-filter:blur(10px);box-shadow:0 8px 40px rgba(0,0,0,.5); }
.bac-result-row { display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px; }
.bac-result-lbl { color:rgba(255,255,255,.4);font-size:11px; }
.bac-result-val { font-size:14px;font-weight:800; }
.bac-result-num { font-size:13px;font-weight:600;color:#fff; }
.bac-result-pay { font-size:13px;font-weight:700;color:#4ade80; }
.player-win { color:#60a5fa; }
.banker-win { color:#f87171; }
.tie-win    { color:#fbbf24; }
.bac-result-net { display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.08);margin-top:8px;padding-top:8px;font-size:11px;color:rgba(255,255,255,.35); }
.bac-result-net span:last-child { font-size:16px;font-weight:800; }
.net-pos { color:#4ade80; }
.net-neg { color:#f87171; }
.net-tie { color:#fbbf24; }

/* ════════════════════════════════════════════════════
   CONTROLS
════════════════════════════════════════════════════ */
.bac-controls { flex-shrink:0;background:rgba(2,4,7,.96);border-top:1px solid rgba(255,255,255,.05);padding:10px 12px 12px;z-index:20; }
.bac-chip-rack { display:flex;justify-content:center;gap:10px;padding:8px 10px 6px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.05);border-radius:14px;margin-bottom:8px; }
.bac-rack-chip { width:50px;height:50px;border-radius:50%;border-width:3px;border-style:solid;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;transition:all .15s ease;user-select:none;cursor:pointer; }
.bac-rack-idle   { opacity:.52; }
.bac-rack-idle:hover { opacity:.88;transform:scale(1.1) translateY(-2px); }
.bac-rack-active { transform:scale(1.2) translateY(-3px)!important;box-shadow:0 0 0 2.5px rgba(255,255,255,.42),0 0 18px rgba(255,255,255,.14),0 6px 20px rgba(0,0,0,.6)!important;opacity:1!important; }
.bac-rack-broke  { opacity:.18!important;cursor:not-allowed; }
@keyframes bac-pulse-slow { 0%,100%{opacity:.45;}50%{opacity:.12;} }
.bac-pulse-slow { animation:bac-pulse-slow 1.8s ease-in-out infinite; }
.bac-deal-row { display:flex;gap:8px; }
.bac-clear-btn { flex-shrink:0;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);padding:0 16px;font-size:11px;font-weight:600;color:rgba(255,255,255,.35);cursor:pointer;transition:all .15s; }
.bac-clear-btn:hover { border-color:rgba(239,68,68,.4);color:#f87171; }
.bac-deal-btn { flex:1;border-radius:14px;padding:13px;font-size:17px;font-weight:800;letter-spacing:.06em;background:linear-gradient(135deg,#166534,#14532d);border:1px solid rgba(74,222,128,.2);box-shadow:0 4px 18px rgba(74,222,128,.14),inset 0 1px 0 rgba(74,222,128,.1);color:#fff;cursor:pointer;transition:all .15s; }
.bac-deal-btn:hover:not(:disabled) { filter:brightness(1.12);box-shadow:0 6px 24px rgba(74,222,128,.2); }
.bac-deal-btn:active:not(:disabled) { transform:scale(.98); }
.bac-deal-btn:disabled { opacity:.28;cursor:not-allowed; }
.bac-phase-footer { text-align:center;font-size:10px;letter-spacing:.15em;color:rgba(255,255,255,.2);padding:14px;text-transform:uppercase; }

/* EOR */
.bac-eor-col  { display:flex;flex-direction:column;gap:6px; }
.bac-eor-replay { width:100%;border-radius:13px;padding:13px;background:linear-gradient(135deg,#166534,#14532d);border:1px solid rgba(74,222,128,.2);color:#fff;font-size:15px;font-weight:700;cursor:pointer;transition:filter .15s;display:flex;align-items:center;justify-content:center;gap:8px; }
.bac-eor-replay:hover { filter:brightness(1.1); }
.bac-eor-tag { background:rgba(255,255,255,.1);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:500; }
.bac-eor-row { display:grid;grid-template-columns:1fr 1fr;gap:6px; }
.bac-eor-new, .bac-eor-menu { display:flex;align-items:center;justify-content:center;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);font-size:12px;font-weight:600;color:rgba(255,255,255,.55);cursor:pointer;text-decoration:none;transition:all .14s; }
.bac-eor-new:hover, .bac-eor-menu:hover { background:rgba(255,255,255,.08);color:rgba(255,255,255,.8); }
.bac-eor-disabled { opacity:.28!important;cursor:not-allowed!important;pointer-events:none!important;filter:grayscale(.4); }
.bac-replay-err { text-align:center;font-size:11px;color:#f87171;margin-bottom:6px; }

/* ════════════════════════════════════════════════════
   GAME OVER MODAL
════════════════════════════════════════════════════ */
.bac-go-backdrop { position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px; }
.bac-go-modal { position:relative;width:min(320px,100%);background:#050810;border:1px solid rgba(220,38,38,.35);border-radius:24px;padding:28px 24px 22px;text-align:center;box-shadow:0 0 60px rgba(220,38,38,.12),0 20px 60px rgba(0,0,0,.7); }
.bac-go-pulse { position:absolute;inset:-1px;border-radius:24px;animation:goPulse 2.4s ease-in-out infinite;pointer-events:none; }
@keyframes goPulse { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.3);}50%{box-shadow:0 0 20px 6px rgba(220,38,38,.1);} }
.bac-go-icon  { font-size:40px;margin-bottom:12px;animation:goIconIn .6s cubic-bezier(0.22,1,0.36,1) .1s both; }
@keyframes goIconIn { from{opacity:0;transform:scale(.4) rotate(-15deg);}to{opacity:1;transform:scale(1) rotate(0);} }
.bac-go-title { font-size:24px;font-weight:800;color:#f87171;letter-spacing:.02em;margin-bottom:6px; }
.bac-go-sub   { font-size:12px;color:rgba(255,255,255,.45);margin-bottom:2px; }
.bac-go-sub2  { font-size:10px;color:rgba(255,255,255,.22);margin-bottom:16px; }
.bac-go-divider { height:1px;background:linear-gradient(to right,transparent,rgba(220,38,38,.25),transparent);margin-bottom:16px; }
.bac-go-actions { display:flex;flex-direction:column;gap:8px; }
.bac-go-btn { display:flex;align-items:center;justify-content:center;border-radius:14px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;transition:all .15s;border:none;color:#fff; }
.bac-go-view  { background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.75);font-size:12px;padding:10px; }
.bac-go-view:hover  { background:rgba(255,255,255,.12); }
.bac-go-reset { background:linear-gradient(135deg,#7f1d1d,#991b1b);border:1px solid rgba(239,68,68,.3);box-shadow:0 0 16px rgba(220,38,38,.15); }
.bac-go-reset:hover { filter:brightness(1.15); }
.bac-go-home  { background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.55);font-size:13px;font-weight:600; }
.bac-go-home:hover  { background:rgba(255,255,255,.09);color:rgba(255,255,255,.8); }

/* Toast countdown */
.bac-toast { position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:9998;pointer-events:none;display:inline-flex;align-items:center;gap:8px;background:rgba(127,29,29,.88);border:1px solid rgba(239,68,68,.35);border-radius:999px;padding:8px 20px;font-size:12px;font-weight:600;color:#fca5a5;backdrop-filter:blur(6px);box-shadow:0 4px 20px rgba(0,0,0,.5); }
.bac-toast-num { display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(220,38,38,.5);color:#fff;font-size:13px;font-weight:900; }

/* Show-hand bar */
.bac-show-bar { position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(5,8,14,.95);border-top:1px solid rgba(220,38,38,.25);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;backdrop-filter:blur(8px); }
.bac-show-lbl { font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.05em; }
.bac-show-go-btn { flex-shrink:0;background:rgba(127,29,29,.7);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:8px 14px;font-size:11px;font-weight:700;color:#fca5a5;cursor:pointer;transition:all .15s; }
.bac-show-go-btn:hover { background:rgba(153,27,27,.85); }

/* ════════════════════════════════════════════════════════════════
   BACCARAT — PREMIUM ATMOSPHERE LAYER
════════════════════════════════════════════════════════════════ */

/* 1. Richer felt — warmer center ambient */
.bac-felt-inner {
  background:
    radial-gradient(ellipse 70% 50% at 50% 52%,
      rgba(18,90,45,0.45) 0%,
      transparent 65%),
    radial-gradient(ellipse 160% 110% at 50% -5%,
      #14602e 0%, #0b3d1c 28%, #062010 58%, #020c05 100%);
}

/* 2. Overhead spotlight */
.bac-felt-inner::before {
  content: '';
  position: absolute; inset: 0; z-index: 1;
  background: radial-gradient(
    ellipse 65% 40% at 50% 0%,
    rgba(180,230,180,0.07) 0%,
    transparent 70%
  );
  pointer-events: none;
}

/* 3. Edge vignette — merged into existing bac-felt::before */

/* 4. Wood arc — see existing .bac-felt::after */

/* 5. Center separator lines */
.bac-watermark::before {
  content: '';
  position: absolute; left: 8%; right: 8%;
  top: 38%; height: 1px;
  background: linear-gradient(to right,
    transparent, rgba(180,150,60,0.18) 50%, transparent);
  pointer-events: none;
}
.bac-watermark::after {
  content: '';
  position: absolute; left: 8%; right: 8%;
  top: 62%; height: 1px;
  background: linear-gradient(to right,
    transparent, rgba(180,150,60,0.10) 50%, transparent);
  pointer-events: none;
}

/* 6. Ambient glow behind active card areas during game */
.bac-card-table::before {
  content: '';
  position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(
    ellipse 80% 60% at 50% 50%,
    rgba(10,50,25,0.35) 0%,
    transparent 70%
  );
  pointer-events: none;
}

/* 7. Winner side pulse glow (enhanced) */
.side-winner {
  border-color: rgba(74,222,128,.35) !important;
  box-shadow: 0 0 24px rgba(74,222,128,.1), inset 0 0 16px rgba(74,222,128,.04) !important;
  animation: sideWinnerGlow 2s ease-in-out infinite alternate;
}
@keyframes sideWinnerGlow {
  from { box-shadow: 0 0 16px rgba(74,222,128,.08), inset 0 0 12px rgba(74,222,128,.03); }
  to   { box-shadow: 0 0 32px rgba(74,222,128,.14), inset 0 0 20px rgba(74,222,128,.06); }
}


/* ── Baccarat Premium Card Extras ───────────────────────────────────────────── */

/* Winner side: cards get a subtle brightness lift */
.side-winner .bac-card-r,
.side-winner .bac-card-b {
  box-shadow: 0 10px 28px rgba(0,0,0,.55),0 0 18px rgba(74,222,128,.18),0 1px 0 rgba(255,255,255,.9) inset !important;
}

/* Third card — offset like a real deal */
.bac-third-wrap .bac-card { margin-left:-8px; transform-origin:bottom center; }

/* Score pill */
.bac-score-pill {
  font-variant-numeric: tabular-nums;
  letter-spacing:-.01em;
  text-shadow: 0 1px 3px rgba(0,0,0,.5);
}

/* Card back icon — more atmospheric */
.bac-card-back-ico {
  font-size:22px;
  color:rgba(255,255,255,.12);
  filter:drop-shadow(0 1px 3px rgba(0,0,0,.6));
}


/* ════════════════════════════════════════════════════
   AUTO REVEAL TOGGLE
════════════════════════════════════════════════════ */

/* Header right group */
.bac-header-right {
  display: flex; align-items: center; gap: 8px;
}

/* Auto Reveal wrapper (positions hint bubble) */
.bac-ar-wrap { position: relative; }

/* Auto Reveal pill toggle */
.bac-ar-btn {
  display: flex; align-items: center; gap: 5px;
  border-radius: 999px;
  padding: 5px 11px 5px 7px;
  font-size: 9px; font-weight: 800; letter-spacing: .08em;
  cursor: pointer; border: 1px solid;
  transition: all .25s ease;
  user-select: none; text-transform: uppercase;
  white-space: nowrap;
}
.bac-ar-icon  { font-size: 11px; line-height: 1; }
.bac-ar-label { line-height: 1; }

.bac-ar-off {
  background: rgba(255,255,255,.04);
  border-color: rgba(255,255,255,.1);
  color: rgba(255,255,255,.35);
}
.bac-ar-off:hover {
  background: rgba(255,255,255,.08);
  border-color: rgba(255,255,255,.2);
  color: rgba(255,255,255,.6);
}
.bac-ar-on {
  background: rgba(6,78,59,.4);
  border-color: rgba(52,211,153,.38);
  color: rgba(52,211,153,.9);
  box-shadow: 0 0 12px rgba(52,211,153,.12);
  animation: arOnGlow 2.4s ease-in-out infinite;
}
@keyframes arOnGlow {
  0%,100% { box-shadow: 0 0 8px rgba(52,211,153,.1); }
  50%      { box-shadow: 0 0 18px rgba(52,211,153,.25); }
}
.bac-ar-on:hover {
  background: rgba(6,78,59,.6);
  box-shadow: 0 0 20px rgba(52,211,153,.28);
}
.bac-ar-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,255,255,.2);
  transition: all .25s; flex-shrink: 0;
}
.bac-ar-dot-on {
  background: #34d399;
  box-shadow: 0 0 5px rgba(52,211,153,.8);
  animation: arDotPulse 1.6s ease-in-out infinite;
}
@keyframes arDotPulse {
  0%,100% { opacity: 1; } 50% { opacity: .35; }
}

/* First-time hint bubble */
.bac-hint-bubble {
  position: absolute; top: calc(100% + 10px); right: 0;
  width: 160px;
  background: rgba(6,10,18,.95);
  border: 1px solid rgba(52,211,153,.25);
  border-radius: 12px;
  padding: 10px 12px 10px;
  z-index: 100;
  box-shadow: 0 8px 30px rgba(0,0,0,.5), 0 0 0 1px rgba(52,211,153,.08);
}
.bac-hint-arrow {
  position: absolute; top: -5px; right: 14px;
  width: 8px; height: 8px;
  background: rgba(6,10,18,.95);
  border-top: 1px solid rgba(52,211,153,.25);
  border-left: 1px solid rgba(52,211,153,.25);
  transform: rotate(45deg);
}
.bac-hint-title {
  font-size: 9px; font-weight: 800; letter-spacing: .15em;
  color: rgba(52,211,153,.8); text-transform: uppercase;
  margin-bottom: 4px;
}
.bac-hint-body {
  font-size: 10px; line-height: 1.5;
  color: rgba(255,255,255,.5);
}
.bac-hint-close {
  position: absolute; top: 6px; right: 8px;
  font-size: 9px; color: rgba(255,255,255,.2);
  background: none; border: none; cursor: pointer;
  transition: color .15s; padding: 2px;
  line-height: 1;
}
.bac-hint-close:hover { color: rgba(255,255,255,.5); }

/* Felt mode badge */
.bac-mode-badge {
  position: absolute; bottom: 70px; left: 50%;
  transform: translateX(-50%);
  font-size: 9px; letter-spacing: .18em;
  color: rgba(255,255,255,.07);
  pointer-events: none; z-index: 3;
  text-transform: uppercase; white-space: nowrap;
  transition: color .4s ease;
}

/* Manual reveal action button (shown in footer during manual mode) */
.bac-manual-btn {
  border-radius: 12px;
  padding: 11px 24px;
  font-size: 13px; font-weight: 700; letter-spacing: .04em;
  cursor: pointer; border: 1px solid;
  transition: all .2s ease;
  background: rgba(255,255,255,.06);
  border-color: rgba(255,255,255,.15);
  color: rgba(255,255,255,.75);
  animation: manualBtnAppear .3s cubic-bezier(0.22,1,0.36,1) both;
}
.bac-manual-btn:hover {
  background: rgba(255,255,255,.1);
  border-color: rgba(255,255,255,.28);
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0,0,0,.3);
}
.bac-manual-btn:active { transform: scale(.97); }
.bac-manual-player {
  background: rgba(29,78,216,.2);
  border-color: rgba(96,165,250,.3);
  color: #93c5fd;
}
.bac-manual-player:hover {
  background: rgba(29,78,216,.3);
  border-color: rgba(96,165,250,.5);
}
.bac-manual-banker {
  background: rgba(185,28,28,.2);
  border-color: rgba(239,68,68,.3);
  color: #fca5a5;
}
.bac-manual-banker:hover {
  background: rgba(185,28,28,.3);
  border-color: rgba(239,68,68,.5);
}
@keyframes manualBtnAppear {
  from { opacity: 0; transform: translateY(6px) scale(.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}


/* ════════════════════════════════════════════════════════════
   PREMIUM RESULT OVERLAY — Emotional Tier System
   Shared between Blackjack and Baccarat
════════════════════════════════════════════════════════════ */

/* ── Base overlay ───────────────────────────────────────────── */
.result-overlay, .ro-bac {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: min(300px, 92%);
  border-radius: 20px;
  padding: 0 0 14px;
  z-index: 20;
  backdrop-filter: blur(12px);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(4,7,12,.88);
  box-shadow: 0 12px 50px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.04);
  transition: box-shadow .4s ease;
}

/* ── Tier-specific overlay glow ─────────────────────────────── */
.ro-blackjack  { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 50px rgba(251,191,36,.18),  0 0 100px rgba(251,191,36,.08); border-color: rgba(251,191,36,.25); }
.ro-natural    { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 50px rgba(251,191,36,.18),  0 0 100px rgba(251,191,36,.08); border-color: rgba(251,191,36,.22); }
.ro-big-win    { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 40px rgba(52,211,153,.20),  0 0  80px rgba(52,211,153,.08); border-color: rgba(52,211,153,.28); }
.ro-medium-win { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 24px rgba(52,211,153,.12);  border-color: rgba(52,211,153,.18); }
.ro-small-win  { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 16px rgba(52,211,153,.08);  border-color: rgba(52,211,153,.12); }
.ro-push       { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 16px rgba(148,163,184,.08); border-color: rgba(148,163,184,.15); }
.ro-small-loss { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 16px rgba(239,68,68,.08);   border-color: rgba(239,68,68,.12); }
.ro-heavy-loss { box-shadow: 0 12px 50px rgba(0,0,0,.6), 0 0 32px rgba(220,38,38,.18),   0 0  60px rgba(220,38,38,.07);   border-color: rgba(220,38,38,.25); }

/* ── Badge (top stripe) ─────────────────────────────────────── */
.ro-badge {
  display: block;
  text-align: center;
  font-size: 11px; font-weight: 900; letter-spacing: .2em;
  text-transform: uppercase;
  padding: 10px 0 9px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  animation: roBadgeIn .5s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes roBadgeIn {
  from { opacity:0; letter-spacing:.35em; transform:scaleX(.94); }
  to   { opacity:1; letter-spacing:.2em;  transform:scaleX(1); }
}
.ro-badge-blackjack, .ro-badge-natural {
  background: linear-gradient(135deg, rgba(92,60,0,.6), rgba(60,40,0,.6));
  color: #fbbf24;
  text-shadow: 0 0 20px rgba(251,191,36,.6);
  animation: roBadgeGold .6s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes roBadgeGold {
  0%   { opacity:0; letter-spacing:.45em; filter:brightness(.5); }
  40%  { filter:brightness(1.4); }
  100% { opacity:1; letter-spacing:.2em;  filter:brightness(1); }
}
.ro-badge-big-win    { background:rgba(6,45,28,.5);  color:#34d399; text-shadow:0 0 16px rgba(52,211,153,.5); }
.ro-badge-medium-win { background:rgba(5,35,20,.4);  color:#6ee7b7; }
.ro-badge-small-win  { background:rgba(5,28,16,.3);  color:#a7f3d0; }
.ro-badge-push       { background:rgba(20,25,38,.5); color:rgba(148,163,184,.7); }
.ro-badge-small-loss { background:rgba(30,8,8,.4);   color:#fca5a5; }
.ro-badge-heavy-loss { background:rgba(50,5,5,.6);   color:#f87171; text-shadow:0 0 14px rgba(239,68,68,.5); animation:roHeavyLoss .55s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes roHeavyLoss {
  0%   { opacity:0; letter-spacing:.4em; filter:brightness(.4); }
  35%  { filter:brightness(1.3); }
  100% { opacity:1; letter-spacing:.2em; filter:brightness(1); }
}

/* ── Hand rows (BJ) ─────────────────────────────────────────── */
.ro-hand-row { display:flex; align-items:center; justify-content:space-between; padding:0 14px; margin-bottom:4px; }
.ro-hand-lbl { font-size:10px; color:rgba(255,255,255,.3); }
.ro-hand-val { font-size:12px; font-weight:700; }
.ro-hand-pay { font-size:11px; color:#6ee7b7; }
.ro-side     { display:flex; justify-content:space-between; font-size:10px; color:rgba(255,255,255,.3); padding:0 14px; margin-bottom:2px; }
.ro-dim      { color:rgba(255,255,255,.22); }

/* ── Animated net ─────────────────────────────────────────────── */
.ro-net {
  display: flex; justify-content: space-between; align-items: center;
  margin: 10px 14px 0;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,.08);
}
.ro-net-label { font-size:10px; color:rgba(255,255,255,.3); letter-spacing:.08em; text-transform:uppercase; }
.ro-net-value {
  font-size: 20px; font-weight: 900; letter-spacing: -.01em;
  font-variant-numeric: tabular-nums;
  transition: color .15s;
}
.ro-counting { opacity: .75; }

/* Net value colours per tier */
.ro-net-blackjack  .ro-net-value,
.ro-net-natural    .ro-net-value,
.ro-net-big-win    .ro-net-value { color: #fbbf24; text-shadow: 0 0 20px rgba(251,191,36,.4); }
.ro-net-medium-win .ro-net-value { color: #34d399; text-shadow: 0 0 14px rgba(52,211,153,.3); }
.ro-net-small-win  .ro-net-value { color: #6ee7b7; }
.ro-net-push       .ro-net-value { color: rgba(148,163,184,.8); }
.ro-net-small-loss .ro-net-value { color: #f87171; }
.ro-net-heavy-loss .ro-net-value { color: #ef4444; text-shadow: 0 0 16px rgba(220,38,38,.5); }

/* ── Entrance animation for net value ──────────────────────── */
.ro-net-blackjack .ro-net-value,
.ro-net-natural   .ro-net-value,
.ro-net-big-win   .ro-net-value {
  animation: roNetPop .8s cubic-bezier(0.34,1.5,0.64,1) .35s both;
}
@keyframes roNetPop {
  0%   { transform:scale(.7); opacity:0; }
  60%  { transform:scale(1.08); }
  100% { transform:scale(1); opacity:1; }
}

</style>