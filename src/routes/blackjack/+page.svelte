<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { getBankroll, setBankroll, bjPayout, type BjHandResult } from '$lib/bankroll';
	import { recordRoundDirect, type RoundOutcome } from '$lib/stats';
	import { sfx, getMuted, toggleMuted as _toggleMuted } from '$lib/sounds';
	import GameOver from '$lib/components/GameOver.svelte';

	// ─── Types ────────────────────────────────────────────────────────────────
	type Suit = '♠' | '♥' | '♦' | '♣';
	type Rank = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';
	type Phase = 'setup' | 'insurance' | 'player-turn' | 'dealer-turn' | 'result';
	// BetTarget bleibt für interne addChip-Logik
	type BetTarget = 'main' | 'pp' | 'db' | 'tf';
	type InsuranceResult = 'won' | 'lost' | 'declined' | null;
	type PPResult = 'perfect' | 'colored' | 'mixed' | 'lost' | null;
	type DBResult = 'won' | 'lost' | null;
	type TFResult = 'suited-trips' | 'straight-flush' | 'three-of-a-kind' | 'straight' | 'flush' | 'lost' | null;

	interface Card { rank: Rank; suit: Suit; }
	interface PlayerHand {
		cards: Card[]; bet: number; doubled: boolean;
		done: boolean; result: BjHandResult | null; payout: number;
		cardDealIndexes: number[];
	}

	// ─── Chips ────────────────────────────────────────────────────────────────
	const CHIPS = [
		{ value: 1,   label: '1',   bg: 'bg-slate-100',    border: 'border-slate-300',  text: 'text-slate-900' },
		{ value: 5,   label: '5',   bg: 'bg-red-600',      border: 'border-red-400',    text: 'text-white'     },
		{ value: 25,  label: '25',  bg: 'bg-emerald-600',  border: 'border-emerald-400',text: 'text-white'     },
		{ value: 100, label: '100', bg: 'bg-slate-900',    border: 'border-slate-400',  text: 'text-white'     },
		{ value: 500, label: '500', bg: 'bg-violet-700',   border: 'border-yellow-400', text: 'text-yellow-300'},
	] as const;

	// ─── Chip-Stack Visualisierung ───────────────────────────────────────────
	// Gibt Chip-Objekte zurück; max 6 für realistische Stacks
	interface ChipVisual { color: string; edge: string; label: string; }
	function chipStack(amount: number, maxChips = 5): ChipVisual[] {
		if (amount <= 0) return [];
		const stack: ChipVisual[] = [];
		let remaining = amount;
		const denominations = [
			{ value: 500, color: '#4c1d95', edge: '#fde68a', label: '500' },
			{ value: 100, color: '#0f172a', edge: '#94a3b8', label: '100' },
			{ value: 25,  color: '#064e3b', edge: '#6ee7b7', label: '25'  },
			{ value: 5,   color: '#7f1d1d', edge: '#fca5a5', label: '5'   },
			{ value: 1,   color: '#d1d5db', edge: '#6b7280', label: '1'   },
		];
		for (const d of denominations) {
			while (remaining >= d.value && stack.length < maxChips) {
				stack.push({ color: d.color, edge: d.edge, label: d.label });
				remaining -= d.value;
			}
			if (stack.length >= maxChips) break;
		}
		// Index 0 = bottom chip, last index = top chip (rendered bottom→top)
		return stack;
	}

		let chipDropTarget = $state('');
	let chipDropTimer: ReturnType<typeof setTimeout> | null = null;
	function triggerChipDrop(t: string) {
		chipDropTarget = t;
		if (chipDropTimer) clearTimeout(chipDropTimer);
		chipDropTimer = setTimeout(() => { chipDropTarget = ''; }, 420);
	}

	// ─── Deck ─────────────────────────────────────────────────────────────────
	const RANKS: Rank[] = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
	const SUITS: Suit[] = ['♠','♥','♦','♣'];
	function buildShoe(n=6): Card[] {
		const s:Card[]=[];
		for(let d=0;d<n;d++) for(const suit of SUITS) for(const rank of RANKS) s.push({rank,suit});
		return s;
	}
	function shuffle(cards:Card[]): Card[] {
		const s=[...cards];
		for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}
		return s;
	}
	function handScore(cards:Card[]): number {
		let score=cards.reduce((s,c)=>{
			if(c.rank==='A') return s+11;
			if(['J','Q','K'].includes(c.rank)) return s+10;
			return s+parseInt(c.rank);
		},0);
		let aces=cards.filter(c=>c.rank==='A').length;
		while(score>21&&aces>0){score-=10;aces--;}
		return score;
	}
	function isSoft(cards:Card[]): boolean {
		const hard=cards.reduce((s,c)=>{
			if(c.rank==='A') return s+1;
			if(['J','Q','K'].includes(c.rank)) return s+10;
			return s+parseInt(c.rank);
		},0);
		return handScore(cards)!==hard;
	}
	function isSoft17(cards:Card[]): boolean { return handScore(cards)===17&&isSoft(cards); }
	function isBlackjack(cards:Card[]): boolean { return cards.length===2&&handScore(cards)===21; }
	function bjValue(rank:Rank): number {
		if(rank==='A') return 11;
		if(['J','Q','K','10'].includes(rank)) return 10;
		return parseInt(rank);
	}
	function cardLabel(c:Card): string { return `${c.rank}${c.suit}`; }
	function cardIsRed(c:Card): boolean { return c.suit==='♥'||c.suit==='♦'; }

	// ─── Perfect Pairs Logic ──────────────────────────────────────────────────
	function isRed(suit: Suit): boolean { return suit === '♥' || suit === '♦'; }

	function evaluatePP(c1: Card, c2: Card): PPResult {
		if (c1.rank !== c2.rank) return null; // no pair (shouldn't be called)
		if (c1.suit === c2.suit) return 'perfect';     // exact same suit
		if (isRed(c1.suit) === isRed(c2.suit)) return 'colored'; // same color, diff suit
		return 'mixed';                                 // different color
	}

	function ppMultiplier(r: PPResult): number {
		if (r === 'perfect') return 25;
		if (r === 'colored') return 12;
		if (r === 'mixed')   return 6;
		return 0;
	}

	function ppLabel(r: PPResult): string {
		if (r === 'perfect') return '🎯 Perfect Pair — 25:1!';
		if (r === 'colored') return '🎨 Colored Pair — 12:1!';
		if (r === 'mixed')   return '🃏 Mixed Pair — 6:1!';
		if (r === 'lost')    return '❌ Perfect Pairs lost';
		return '';
	}

	// ─── 21+3 Logic ─────────────────────────────────────────────────────────────
	function rankValue(rank: Rank): number {
		if (rank === 'A') return 1; if (rank === 'J') return 11;
		if (rank === 'Q') return 12; if (rank === 'K') return 13;
		return parseInt(rank);
	}
	function isSameSuit(cards: Card[]): boolean { return cards.every(c => c.suit === cards[0].suit); }
	function isSameRank(cards: Card[]): boolean  { return cards.every(c => c.rank === cards[0].rank); }
	function isStraight(cards: Card[]): boolean {
		const vals = cards.map(c => rankValue(c.rank)).sort((a,b)=>a-b);
		const consec = (arr: number[]) => arr[2]-arr[1]===1 && arr[1]-arr[0]===1;
		if (consec(vals)) return true;
		if (vals[0]===1) { const hi=[vals[1],vals[2],14].sort((a,b)=>a-b); if(consec(hi)) return true; }
		return false;
	}
	function evaluateTF(p1: Card, p2: Card, upcard: Card): TFResult {
		const cards=[p1,p2,upcard];
		const sameRank=isSameRank(cards), sameSuit=isSameSuit(cards), straight=isStraight(cards);
		if (sameRank && sameSuit) return 'suited-trips';
		if (straight && sameSuit) return 'straight-flush';
		if (sameRank)             return 'three-of-a-kind';
		if (straight)             return 'straight';
		if (sameSuit)             return 'flush';
		return 'lost';
	}
	function tfMultiplier(r: TFResult): number {
		const m: Record<string,number>={'suited-trips':100,'straight-flush':40,'three-of-a-kind':30,'straight':10,'flush':5};
		return m[r!] ?? 0;
	}
	function tfLabel(r: TFResult): string {
		const labels: Record<string,string>={
			'suited-trips':'\u2728 Suited Trips \u2014 100:1!',
			'straight-flush':'\uD83D\uDD25 Straight Flush \u2014 40:1!',
			'three-of-a-kind':'\uD83C\uDFAF Three of a Kind \u2014 30:1!',
			'straight':'\uD83D\uDCC8 Straight \u2014 10:1!',
			'flush':'\u2660\uFE0F Flush \u2014 5:1!',
			'lost':'\u274C 21+3 lost',
		};
		return labels[r!] ?? '';
	}

	// ─── State ────────────────────────────────────────────────────────────────
	let bankroll       = $state(1000);
	let betError       = $state('');
	let phase          = $state<Phase>('setup');
	// ── Game-Over State ──────────────────────────────────────────────────────
	// Buttons sperren wenn bankrupt (Countdown läuft oder Hand-Ansehen-Modus)
	let isBankrupt = $derived(bankroll <= 0 && phase === 'result');
	// gameOver wird NICHT sofort gezeigt — erst nach 5-Sekunden-Delay
	let gameOver       = $state(false);
	let showHand       = $state(false);   // "Hand ansehen" — Modal versteckt, Hand sichtbar
	let goCountdown    = $state(0);       // 5..1 Countdown
	let goTimer: ReturnType<typeof setInterval> | null = null;

	function startGameOverDelay() {
		// Guard: nicht mehrfach starten
		if (goTimer !== null) return;
		goCountdown = 3;
		// Single countdown display tick (cosmetic only)
		const t1 = setTimeout(() => { goCountdown = 2; }, 1000);
		const t2 = setTimeout(() => { goCountdown = 1; }, 2000);
		goTimer   = setTimeout(() => {
			clearTimeout(t1); clearTimeout(t2);
			goTimer     = null;
			goCountdown = 0;
			showHand    = false;
			gameOver    = true;
		}, 3000) as unknown as ReturnType<typeof setInterval>;
	}

	function clearGameOverTimer() {
		if (goTimer !== null) { clearTimeout(goTimer as unknown as ReturnType<typeof setTimeout>); goTimer = null; }
		goCountdown = 0;
		gameOver = false;
		showHand  = false;
	}
	let shoe           = $state<Card[]>([]);
	let dealerCards    = $state<Card[]>([]);
	let dealerDealIndexes = $state<number[]>([]);
	let holeRevealed   = $state(false);
	let hands          = $state<PlayerHand[]>([]);
	let activeIdx      = $state(0);
	let statusMsg      = $state('');
	let saved          = $state(false);
	let bankrollBefore  = 0;
	let globalCardIdx   = 0;

	// ── Bet state ─────────────────────────────────────────────────────────────
	let selectedChip    = $state(25);   // Welcher Chip ist gerade ausgewählt (Wert)
	let mainBet         = $state(0);
	let ppBet           = $state(0);
	let dbBet           = $state(0);

	let tfBet    = $state(0);  // 21+3 bet
	let totalBet = $derived(mainBet + ppBet + dbBet + tfBet);

	// ── Insurance State ───────────────────────────────────────────────────────
	let insuranceOffered = $state(false);
	let insuranceTaken   = $state(false);
	let insuranceBet     = $state(0);
	let insuranceResult  = $state<InsuranceResult>(null);
	let insurancePayout  = $state(0);
	let insuranceCost    = $derived(Math.floor(mainBet / 2));
	let canAffordInsurance = $derived(insuranceCost > 0 && insuranceCost <= bankroll);

	// ── Sidebet Results ───────────────────────────────────────────────────────
	let ppResult    = $state<PPResult>(null);
	let ppPayout    = $state(0);
	let dbResult    = $state<DBResult>(null);
	let dbPayout    = $state(0);

	// 21+3 State
	let tfResult    = $state<TFResult>(null);
	let tfPayout    = $state(0);
	let tfCards     = $state<string[]>([]); // [p1, p2, dealer upcard]

	let displayNetResult = $derived(Math.round((bankroll - bankrollBefore) * 100) / 100);

	let muted = $state(false);
	function toggleMute() { muted = _toggleMuted(); }

	onMount(() => { bankroll = getBankroll(); muted = getMuted(); });

	// ─── Chip / Bet helpers ───────────────────────────────────────────────────
	// placeBet: platziert den ausgewählten Chip auf ein Feld
	// MAIN BET: All-In wenn chip > verbleibende Bankroll
	// SIDEBETS: Fehlermeldung wenn nicht genügend Guthaben
	function placeBet(target: BetTarget) {
		betError = '';
		const value = selectedChip;
		const remaining = bankroll - totalBet;

		if (target === 'main') {
			// All-In: chip-Wert > verbleibende Bankroll → setze exakt remaining
			if (value > remaining) {
				if (remaining <= 0) { betError = 'Nicht genügend Guthaben.'; return; }
				// All-In!
				sfx.chipClick();
				triggerChipDrop('main');
				mainBet += remaining;
				showToast('All-In! ' + remaining.toFixed(0) + ' CHF');
				return;
			}
		} else {
			// Sidebets: kein All-In, direkte Fehlermeldung
			if (totalBet + value > bankroll) {
				showToast('Nicht genügend Guthaben für Sidebet.');
				return;
			}
		}

		if (totalBet + value > bankroll) {
			betError = 'Nicht genügend Guthaben.';
			return;
		}
		sfx.chipClick();
		triggerChipDrop(target);
		if (target === 'main')       mainBet += value;
		else if (target === 'pp')    ppBet   += value;
		else if (target === 'db')    dbBet   += value;
		else if (target === 'tf')    tfBet   += value;
	}

	// ── Toast notification ────────────────────────────────────────────────────
	let toastMsg   = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(msg: string) {
		toastMsg = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { toastMsg = ''; }, 2200);
	}

	// addChip bleibt für playAgain (interne Nutzung)
	function addChip(value: number, target: BetTarget = 'main') {
		if (totalBet + value > bankroll) return;
		if (target === 'main') mainBet += value;
		else if (target === 'pp')   ppBet += value;
		else if (target === 'db')   dbBet += value;
		else if (target === 'tf')   tfBet += value;
	}

	function clearBetField(target: BetTarget) {
		if (target === 'main') mainBet = 0;
		else if (target === 'pp')   ppBet = 0;
		else if (target === 'db')   dbBet = 0;
		else if (target === 'tf')   tfBet = 0;
		betError = '';
	}

	function clearAllBets() { mainBet = 0; ppBet = 0; dbBet = 0; tfBet = 0; betError = ''; }

	function draw(): Card {
		if (shoe.length < 15) shoe = shuffle(buildShoe(6));
		const c = shoe[0]; shoe = shoe.slice(1); return c;
	}

	// ─── Deal ─────────────────────────────────────────────────────────────────
	function deal() {
		betError = '';
		if (mainBet <= 0)        { betError = 'Bitte zuerst Main Bet setzen.'; return; }
		if (totalBet > bankroll) { betError = 'Nicht genügend Guthaben.'; return; }

		bankrollBefore = bankroll;
		bankroll -= totalBet;       // Main + PP + DB sofort abziehen
		setBankroll(bankroll);

		shoe          = shuffle(buildShoe(6));
		holeRevealed  = false;
		saved         = false;
		statusMsg     = '';
		globalCardIdx = 0;

		// Reset Insurance + Sidebet results
		insuranceOffered = false; insuranceTaken = false;
		insuranceBet = 0; insuranceResult = null; insurancePayout = 0;
		ppResult = null; ppPayout = 0;
		dbResult = null; dbPayout = 0;
		tfResult = null; tfPayout = 0; tfCards = []; tfCards = [];

		const p1 = draw(), p2 = draw(), d1 = draw(), d2 = draw();
		dealerCards       = [d1, d2];
		dealerDealIndexes = [1, 3];
		hands = [{ cards: [p1, p2], bet: mainBet, doubled: false, done: false, result: null, payout: 0, cardDealIndexes: [0, 2] }];
		globalCardIdx = 4;
		activeIdx = 0;

		[0, 140, 280, 420].forEach(delay => setTimeout(() => sfx.cardDeal(), delay));

		// ── 21+3: direkt nach Deal auswerten (Player 1, Player 2, Dealer Upcard) ──
		if (tfBet > 0) {
			const r = evaluateTF(p1, p2, d1); // d1 = Dealer Upcard, d2 = Hole Card (nicht verwendet)
			tfResult = r;
			tfCards  = [cardLabel(p1), cardLabel(p2), cardLabel(d1)];
			const mult = tfMultiplier(r);
			if (mult > 0) {
				tfPayout  = Math.round(tfBet * (1 + mult) * 100) / 100;
				bankroll += tfPayout;
				setBankroll(bankroll);
			} else {
				tfPayout = 0;
			}
		} else {
			tfCards = [];
		}

		// ── Perfect Pairs: direkt nach Deal auswerten ──────────────────────
		if (ppBet > 0) {
			const c1 = hands[0].cards[0], c2 = hands[0].cards[1];
			if (c1.rank === c2.rank) {
				const r = evaluatePP(c1, c2);
				ppResult = r;
				const mult = ppMultiplier(r);
				ppPayout = Math.round(ppBet * (1 + mult) * 100) / 100;
				bankroll += ppPayout;
				setBankroll(bankroll);
			} else {
				ppResult = 'lost';
				ppPayout = 0;
			}
		}

		const uv = bjValue(d1.rank);

		if (uv === 11) {
			// Dealer shows Ace → Insurance anbieten, Peek erst nach Entscheidung
			insuranceOffered = true;
			phase = 'insurance';
			return;
		}

		if (uv === 10) {
			// 10-Wert: automatischer Peek ohne Insurance
			if (isBlackjack(dealerCards)) {
				holeRevealed = true;
				statusMsg = 'Dealer has Blackjack!';
				const r = isBlackjack(hands[0].cards) ? 'push' : 'lose';
				const p = bjPayout(hands[0].bet, r);
				hands = [{ ...hands[0], result: r, done: true, payout: p }];
				bankroll += p;
				// DB: Dealer hat kein Bust → lost
				if (dbBet > 0) { dbResult = 'lost'; dbPayout = 0; }
				setBankroll(bankroll);
				phase = 'result';
				saveRound();
				if (bankroll <= 0) { startGameOverDelay(); }
				setTimeout(() => { if (r === 'push') sfx.win(); else sfx.lose(); }, 400);
				return;
			} else {
				statusMsg = 'Dealer checked — no Blackjack.';
			}
		}

		afterInsuranceDecision();
	}

	// ─── Insurance ────────────────────────────────────────────────────────────
	function takeInsurance() {
		if (!canAffordInsurance) return;
		insuranceTaken = true;
		insuranceBet   = insuranceCost;
		bankroll      -= insuranceBet;
		setBankroll(bankroll);
		resolveInsurance();
	}

	function declineInsurance() {
		insuranceTaken  = false;
		insuranceResult = 'declined';
		resolveInsurance();
	}

	function resolveInsurance() {
		if (isBlackjack(dealerCards)) {
			holeRevealed = true;
			statusMsg = 'Dealer has Blackjack!';
			if (insuranceTaken) {
				insurancePayout  = insuranceBet * 3;
				insuranceResult  = 'won';
				bankroll        += insurancePayout;
			} else {
				insuranceResult = 'declined';
			}
			const r = isBlackjack(hands[0].cards) ? 'push' : 'lose';
			const p = bjPayout(hands[0].bet, r);
			hands = [{ ...hands[0], result: r, done: true, payout: p }];
			bankroll += p;
			if (dbBet > 0) { dbResult = 'lost'; dbPayout = 0; }
			setBankroll(bankroll);
			phase = 'result';
			saveRound();
			if (bankroll <= 0) { startGameOverDelay(); }
			setTimeout(() => {
				if (insuranceTaken && insuranceResult === 'won') sfx.win();
				else if (r === 'push') sfx.win(); else sfx.lose();
			}, 400);
		} else {
			if (insuranceTaken) { insuranceResult = 'lost'; }
			else { insuranceResult = 'declined'; }
			statusMsg = insuranceTaken ? 'Insurance lost — no Dealer Blackjack.' : 'Dealer checked — no Blackjack.';
			afterInsuranceDecision();
		}
	}

	function afterInsuranceDecision() {
		phase = 'player-turn';
		if (isBlackjack(hands[0].cards)) {
			const p = bjPayout(hands[0].bet, 'blackjack');
			hands = [{ ...hands[0], result: 'blackjack', done: true, payout: p }];
			statusMsg = 'Blackjack! 🎉';
			sfx.blackjack();
			startDealerTurn();
		}
	}

	// ─── Actions ──────────────────────────────────────────────────────────────
	function ch(): PlayerHand { return hands[activeIdx]; }
	function canHit():    boolean { return phase==='player-turn'&&!ch().done; }
	function canStand():  boolean { return phase==='player-turn'&&!ch().done; }
	function canDouble(): boolean { return phase==='player-turn'&&!ch().done&&ch().cards.length===2&&ch().bet<=bankroll; }
	function canSplit():  boolean {
		if(phase!=='player-turn'||ch().done) return false;
		const h=ch();
		return h.cards.length===2&&bjValue(h.cards[0].rank)===bjValue(h.cards[1].rank)&&mainBet<=bankroll;
	}
	function updateHand(h:PlayerHand) { hands=hands.map((old,i)=>i===activeIdx?h:old); }

	function hit() {
		if(!canHit()) return;
		sfx.cardDeal();
		const newCard=draw(), newIdx=globalCardIdx++;
		const h={...ch(),cards:[...ch().cards,newCard],cardDealIndexes:[...ch().cardDealIndexes,newIdx]};
		if(handScore(h.cards)>21){h.done=true;h.result='bust';statusMsg='Bust!';}
		updateHand(h); if(h.done) advanceHand();
	}
	function stand() { if(!canStand()) return; updateHand({...ch(),done:true}); advanceHand(); }
	function doubleDown() {
		if(!canDouble()) return;
		bankroll-=ch().bet; setBankroll(bankroll);
		const newCard=draw(), newIdx=globalCardIdx++;
		const h={...ch(),bet:ch().bet*2,doubled:true,cards:[...ch().cards,newCard],cardDealIndexes:[...ch().cardDealIndexes,newIdx],done:true};
		if(handScore(h.cards)>21){h.result='bust';statusMsg='Bust after Double!';}
		updateHand(h); advanceHand();
	}
	function split() {
		if(!canSplit()) return;
		const h=ch(); bankroll-=mainBet; setBankroll(bankroll);
		const isAceSplit=h.cards[0].rank==='A';
		const c1=draw(),c2=draw(),i1=globalCardIdx++,i2=globalCardIdx++;
		const hand1:PlayerHand={cards:[h.cards[0],c1],bet:mainBet,doubled:false,done:isAceSplit,result:null,payout:0,cardDealIndexes:[h.cardDealIndexes[0],i1]};
		const hand2:PlayerHand={cards:[h.cards[1],c2],bet:mainBet,doubled:false,done:isAceSplit,result:null,payout:0,cardDealIndexes:[h.cardDealIndexes[1],i2]};
		hands=[...hands.slice(0,activeIdx),hand1,hand2,...hands.slice(activeIdx+1)];
		if(isAceSplit){statusMsg='Aces split — one card each.'; advanceHand();}
		else{statusMsg=`Playing hand 1 of 2`;}
	}
	function advanceHand() {
		const next=hands.findIndex((h,i)=>i>activeIdx&&!h.done);
		if(next!==-1){activeIdx=next;statusMsg=`Playing hand ${activeIdx+1} of ${hands.length}`;}
		else{
			if(hands.every(h=>h.result==='bust')){
				// All bust → Dealer doesn't play → DB lost
				if(dbBet>0){dbResult='lost';dbPayout=0;}
				holeRevealed=true; phase='result'; saveRound();
				if (bankroll <= 0) { startGameOverDelay(); }
			} else { startDealerTurn(); }
		}
	}

	// ─── Dealer Turn ──────────────────────────────────────────────────────────
	function startDealerTurn() {
		holeRevealed=true; phase='dealer-turn';
		let dCards=[...dealerCards], dIndexes=[...dealerDealIndexes];
		while(true){
			const s=handScore(dCards);
			if(s>17) break;
			if(s===17){if(!isSoft17(dCards)) break;}
			dCards=[...dCards,draw()]; dIndexes=[...dIndexes,globalCardIdx++];
		}
		dealerCards=dCards; dealerDealIndexes=dIndexes;
		evaluateResults();
	}

	function evaluateResults() {
		const dScore=handScore(dealerCards), dBust=dScore>21, dBJ=isBlackjack(dealerCards);

		// ── Dealer Bust sidebet ────────────────────────────────────────────
		if(dbBet>0){
			if(dBust){
				dbResult='won';
				dbPayout=Math.round(dbBet*3*100)/100; // 2:1 = bet + bet*2 = bet*3
				bankroll+=dbPayout;
			} else {
				dbResult='lost'; dbPayout=0;
			}
		}

		hands=hands.map(h=>{
			if(h.result!==null){const p=h.payout>0?h.payout:bjPayout(h.bet,h.result);return{...h,payout:p};}
			const pScore=handScore(h.cards),pBJ=isBlackjack(h.cards);
			let result:BjHandResult;
			if(dBust)                result='dealer-bust';
			else if(pBJ&&!dBJ)       result='blackjack';
			else if(pBJ&&dBJ)        result='push';
			else if(pScore>dScore)   result='win';
			else if(pScore===dScore) result='push';
			else                     result='lose';
			return{...h,result,payout:bjPayout(h.bet,result)};
		});

		const totalPayout=hands.reduce((s,h)=>s+h.payout,0);
		bankroll+=totalPayout;
		setBankroll(bankroll);
		statusMsg=''; phase='result';
		saveRound();

		// If bankrupt after this round → start 5-second delay
		if (bankroll <= 0) { startGameOverDelay(); }

		const hasBJ  =hands.some(h=>h.result==='blackjack');
		const hasWin =hands.some(h=>h.result==='win'||h.result==='dealer-bust');
		const allLost=hands.every(h=>h.result==='lose'||h.result==='bust');
		if(hasBJ)        setTimeout(()=>sfx.blackjack(),200);
		else if(hasWin)  setTimeout(()=>sfx.win(),200);
		else if(allLost) setTimeout(()=>sfx.lose(),200);
	}

	// ─── Save ─────────────────────────────────────────────────────────────────
	async function saveRound() {
		if(saved) return; saved=true;
		// Für "Erneut spielen" merken (Insurance ausgenommen — situativ)
		lastMainBet=mainBet; lastPpBet=ppBet; lastDbBet=dbBet; lastTfBet=tfBet;
		for(const h of hands){
			const isWin =h.result==='win'||h.result==='blackjack'||h.result==='dealer-bust';
			const isLoss=h.result==='lose'||h.result==='bust';
			const outcome:RoundOutcome=isWin?'win':isLoss?'loss':'push';
			recordRoundDirect(outcome,Math.round((h.payout-h.bet)*100)/100,1);
		}
		const totalPayout=hands.reduce((s,h)=>s+h.payout,0);
		const netResult  =Math.round((bankroll-bankrollBefore)*100)/100;
		try {
			await fetch('/api/save-game',{
				method:'POST', headers:{'Content-Type':'application/json'},
				body:JSON.stringify({
					game:'blackjack', bet:mainBet,
					playerHands:hands.map(h=>({
						cards:h.cards.map(cardLabel), score:handScore(h.cards),
						bet:h.bet, doubled:h.doubled, result:h.result, payout:h.payout,
					})),
					dealerCards:dealerCards.map(cardLabel), dealerScore:handScore(dealerCards),
					result:hands[0].result??'lose',
					payout:Math.round(totalPayout*100)/100,
					bankrollBefore:Math.round(bankrollBefore*100)/100,
					bankrollAfter:Math.round(bankroll*100)/100,
					netResult,
					// Insurance
					insuranceOffered, insuranceTaken,
					insuranceBet:   insuranceTaken ? insuranceBet : 0,
					insuranceResult,
					insurancePayout:insuranceTaken&&insuranceResult==='won'?insurancePayout:0,
					// Sidebets
					perfectPairsBet:    ppBet,
					perfectPairsResult: ppResult,
					perfectPairsPayout: ppPayout,
					dealerBustBet:    dbBet,
					dealerBustResult: dbResult,
					dealerBustPayout: dbPayout,
					// 21+3
					twentyOneThreeBet:    tfBet,
					twentyOneThreeResult: tfResult,
					twentyOneThreePayout: tfPayout,
					twentyOneThreeCards:  tfCards,
				})
			});
		} catch(e){console.error('Failed to save:',e);}
	}

	function handleGameOverReset() {
		clearGameOverTimer();
		bankroll=1000; mainBet=0; ppBet=0; dbBet=0; tfBet=0;
		lastMainBet=0; lastPpBet=0; lastDbBet=0; lastTfBet=0;
		replayError=''; phase='setup';
	}

	// ── End-of-Round State ───────────────────────────────────────────────────
	let lastMainBet = $state(0);
	let lastPpBet   = $state(0);
	let lastDbBet   = $state(0);
	let lastTfBet   = $state(0);
	let replayError = $state('');

	function playAgain() {
		replayError = '';
		const totalReplay = lastMainBet + lastPpBet + lastDbBet + lastTfBet;
		if (totalReplay <= 0) { newBet(); return; }
		if (totalReplay > bankroll) {
			replayError = 'Nicht genügend Guthaben für dieselben Einsätze.';
			return;
		}
		dealerCards=[]; dealerDealIndexes=[]; hands=[]; activeIdx=0;
		holeRevealed=false; statusMsg=''; saved=false; betError='';
		globalCardIdx=0;
		insuranceOffered=false; insuranceTaken=false; insuranceBet=0; insuranceResult=null; insurancePayout=0;
		ppResult=null; ppPayout=0; dbResult=null; dbPayout=0;
		tfResult=null; tfPayout=0; tfCards=[];
		mainBet=lastMainBet; ppBet=lastPpBet; dbBet=lastDbBet; tfBet=lastTfBet;
		deal();
	}

	function newBet() {
		clearGameOverTimer();
		phase='setup'; dealerCards=[]; dealerDealIndexes=[]; hands=[]; activeIdx=0;
		holeRevealed=false; statusMsg=''; saved=false; betError=''; replayError='';
		mainBet=0; ppBet=0; dbBet=0; tfBet=0; globalCardIdx=0;
		insuranceOffered=false; insuranceTaken=false; insuranceBet=0; insuranceResult=null; insurancePayout=0;
		ppResult=null; ppPayout=0; dbResult=null; dbPayout=0;
		tfResult=null; tfPayout=0; tfCards=[];
	}

	function newRound() { newBet(); }

	function resultLabel(r:BjHandResult|null): string {
		switch(r){
			case 'blackjack':   return '🎉 Blackjack!';
			case 'win':         return '✅ Win';
			case 'dealer-bust': return '✅ Dealer Bust';
			case 'push':        return '🤝 Push';
			case 'lose':        return '❌ Lose';
			case 'bust':        return '💥 Bust';
			default:            return '';
		}
	}
	function resultColor(r:BjHandResult|null): string {
		switch(r){
			case 'blackjack': case 'win': case 'dealer-bust': return 'text-emerald-400';
			case 'push':      return 'text-amber-400';
			default:          return 'text-red-400';
		}
	}
	function dealDelay(idx:number): number { return idx*140; }
</script>
<!-- ═══════════════════════════════════════════════════════
     BLACKJACK — Casino Table Layout
     Script block is complete above. Template follows.
═══════════════════════════════════════════════════════ -->
<main class="bj-root">

  <!-- TOAST ─────────────────────────────────────────────── -->
  {#if toastMsg}
    <div class="toast" transition:fly={{ y: -16, duration: 260 }}>{toastMsg}</div>
  {/if}

  <!-- HEADER ────────────────────────────────────────────── -->
  <header class="bj-header">
    <a href="/" class="header-link">← Menü</a>
    <div class="bankroll-pill">
      <span class="bankroll-label">Balance</span>
      <span class="bankroll-val {bankroll<=0?'red':bankroll<100?'amber':'green'}">
        {bankroll.toFixed(2)} CHF
      </span>
    </div>
    <button onclick={toggleMute} class="mute-btn" aria-label="Mute">
      {muted ? '🔇' : '🔊'}
    </button>
  </header>

  <!-- TABLE ─────────────────────────────────────────────── -->
  <section class="bj-table">

    <!-- Felt background -->
    <div class="felt" aria-hidden="true">
      <div class="felt-inner"></div>
    </div>
    <!-- Table text watermark -->
    <div class="table-watermark" aria-hidden="true">
      <p class="wm1">BLACKJACK PAYS 3 TO 2</p>
      <p class="wm2">Dealer stands on soft 17 · Insurance pays 2 to 1</p>
    </div>

    <!-- ════ SETUP ══════════════════════════════════════════ -->
    {#if phase === 'setup'}
      <div class="setup-layer">

        <!-- BET SPOTS ────────────────────────────────────── -->
        <div class="spots-grid">

          <!-- Row 1: 21+3 centered top -->
          <div class="spots-row spots-row-top">
            <div class="spot-cell">
              <button onclick={() => placeBet('tf')}
                class="spot spot-md tf-spot {chipDropTarget==='tf'?'chip-drop':''}"
                aria-label="Bet on 21+3">
                <svg class="spot-ring-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" class="outer-ring"/>
                  <circle cx="50" cy="50" r="38" class="inner-ring"/>
                </svg>
                {#if tfBet > 0}
                  <div class="chip-tower">
                    {#each chipStack(tfBet) as c, i}
                      <div class="chip-coin"
                        style="background:{c.color};
                               box-shadow:0 0 0 2px {c.edge}40,
                                          inset 0 2px 0 rgba(255,255,255,.18),
                                          0 3px 0 {c.edge}55,
                                          0 6px 10px rgba(0,0,0,.35);
                               position:absolute;
                               bottom:{i * 11}px;
                               z-index:{i+1};
                               transform:rotate({(i%3-1)*0.8}deg)">
                        <span class="chip-lbl" style="color:{c.edge}">{c.label}</span>
                      </div>
                    {/each}
                  </div>
                  <span class="bet-pill">{tfBet}</span>
                  <button onclick={(e)=>{e.stopPropagation();clearBetField('tf');}} class="x-btn">✕</button>
                {:else}
                  <div class="spot-idle-content">
                    <span class="spot-name tf-name">21+3</span>
                    <span class="spot-odds">100:1</span>
                  </div>
                {/if}
              </button>
              <span class="spot-caption">21+3</span>
            </div>
          </div>

          <!-- Row 2: PP | MAIN | DB -->
          <div class="spots-row spots-row-main">

            <!-- Perfect Pairs -->
            <div class="spot-cell">
              <button onclick={() => placeBet('pp')}
                class="spot spot-sm pp-spot {chipDropTarget==='pp'?'chip-drop':''}"
                aria-label="Bet on Perfect Pairs">
                <svg class="spot-ring-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" class="outer-ring pp-ring"/>
                  <circle cx="50" cy="50" r="38" class="inner-ring pp-ring-i"/>
                </svg>
                {#if ppBet > 0}
                  <div class="chip-tower">
                    {#each chipStack(ppBet) as c, i}
                      <div class="chip-coin"
                        style="background:{c.color};
                               box-shadow:0 0 0 2px {c.edge}40,
                                          inset 0 2px 0 rgba(255,255,255,.18),
                                          0 3px 0 {c.edge}55,
                                          0 6px 10px rgba(0,0,0,.35);
                               position:absolute;
                               bottom:{i * 11}px;
                               z-index:{i+1};
                               transform:rotate({(i%3-1)*0.8}deg)">
                        <span class="chip-lbl" style="color:{c.edge}">{c.label}</span>
                      </div>
                    {/each}
                  </div>
                  <span class="bet-pill">{ppBet}</span>
                  <button onclick={(e)=>{e.stopPropagation();clearBetField('pp');}} class="x-btn">✕</button>
                {:else}
                  <div class="spot-idle-content">
                    <span class="spot-name pp-name">PP</span>
                    <span class="spot-odds">25:1</span>
                  </div>
                {/if}
              </button>
              <span class="spot-caption">Perfect Pairs</span>
            </div>

            <!-- MAIN BET -->
            <div class="spot-cell spot-cell-main">
              <button onclick={() => placeBet('main')}
                class="spot spot-lg main-spot {chipDropTarget==='main'?'chip-drop':''}"
                aria-label="Main Bet">
                <svg class="spot-ring-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" class="outer-ring main-ring"/>
                  <circle cx="50" cy="50" r="36" class="inner-ring main-ring-i"/>
                  <circle cx="50" cy="50" r="28" class="inner-ring2 main-ring-i2"/>
                </svg>
                {#if mainBet > 0}
                  <div class="chip-tower chip-tower-main">
                    {#each chipStack(mainBet, 6) as c, i}
                      <div class="chip-coin chip-coin-main"
                        style="background:{c.color};
                               box-shadow:0 0 0 3px {c.edge}50,
                                          inset 0 2px 0 rgba(255,255,255,.2),
                                          0 4px 0 {c.edge}60,
                                          0 8px 16px rgba(0,0,0,.45);
                               position:absolute;
                               bottom:{i * 14}px;
                               z-index:{i+1};
                               transform:rotate({(i%3-1)*0.8}deg)">
                        <span class="chip-lbl chip-lbl-main" style="color:{c.edge}">{c.label}</span>
                      </div>
                    {/each}
                  </div>
                  <span class="bet-pill bet-pill-main">{mainBet} CHF</span>
                  <button onclick={(e)=>{e.stopPropagation();clearBetField('main');}} class="x-btn x-btn-main">✕</button>
                {:else}
                  <div class="spot-idle-content">
                    <span class="spot-name main-name">MAIN BET</span>
                    <span class="spot-odds main-odds">Click to bet</span>
                  </div>
                {/if}
              </button>
              <span class="spot-caption main-caption">Main Bet</span>
            </div>

            <!-- Dealer Bust -->
            <div class="spot-cell">
              <button onclick={() => placeBet('db')}
                class="spot spot-sm db-spot {chipDropTarget==='db'?'chip-drop':''}"
                aria-label="Bet on Dealer Bust">
                <svg class="spot-ring-svg" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" class="outer-ring db-ring"/>
                  <circle cx="50" cy="50" r="38" class="inner-ring db-ring-i"/>
                </svg>
                {#if dbBet > 0}
                  <div class="chip-tower">
                    {#each chipStack(dbBet) as c, i}
                      <div class="chip-coin"
                        style="background:{c.color};
                               box-shadow:0 0 0 2px {c.edge}40,
                                          inset 0 2px 0 rgba(255,255,255,.18),
                                          0 3px 0 {c.edge}55,
                                          0 6px 10px rgba(0,0,0,.35);
                               position:absolute;
                               bottom:{i * 11}px;
                               z-index:{i+1};
                               transform:rotate({(i%3-1)*0.8}deg)">
                        <span class="chip-lbl" style="color:{c.edge}">{c.label}</span>
                      </div>
                    {/each}
                  </div>
                  <span class="bet-pill">{dbBet}</span>
                  <button onclick={(e)=>{e.stopPropagation();clearBetField('db');}} class="x-btn">✕</button>
                {:else}
                  <div class="spot-idle-content">
                    <span class="spot-name db-name">DB</span>
                    <span class="spot-odds">2:1</span>
                  </div>
                {/if}
              </button>
              <span class="spot-caption">Dealer Bust</span>
            </div>

          </div><!-- /spots-row-main -->
        </div><!-- /spots-grid -->

        <!-- Bet meta -->
        <div class="bet-meta">
          {#if betError}<p class="bet-err" transition:fade={{duration:150}}>{betError}</p>{/if}
          {#if totalBet > 0}
            <p class="bet-total">
              Total <strong>{totalBet}</strong> CHF
              {#if ppBet>0}<em class="tag-pp">PP·{ppBet}</em>{/if}
              {#if tfBet>0}<em class="tag-tf">21+3·{tfBet}</em>{/if}
              {#if dbBet>0}<em class="tag-db">DB·{dbBet}</em>{/if}
            </p>
          {/if}
        </div>

      </div><!-- /setup-layer -->

    <!-- ════ GAME ════════════════════════════════════════════ -->
    {:else}

      <!-- DEALER -->
      <div class="dealer-area">
        <p class="zone-lbl">Dealer</p>
        <div class="cards-fan">
          {#each dealerCards as card, i (i)}
            {@const di = dealerDealIndexes[i] ?? i}
            {@const isHole = i===1 && !holeRevealed}
            <div style="animation-delay:{dealDelay(di)}ms" class="card-enter {i>0?'card-ol':''}">
              {#if isHole}
                <div class="crd hole-crd"><div class="hole-pat"></div><span class="hole-ico">🂠</span></div>
              {:else if i===1 && holeRevealed}
                <div class="card-flip"><div class="crd {cardIsRed(card)?'crd-r':'crd-b'}">
                  <span class="cr-tl">{card.rank}</span><span class="cr-s">{card.suit}</span><span class="cr-br">{card.rank}</span>
                </div></div>
              {:else}
                <div class="crd {cardIsRed(card)?'crd-r':'crd-b'}">
                  <span class="cr-tl">{card.rank}</span><span class="cr-s">{card.suit}</span><span class="cr-br">{card.rank}</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        {#if dealerCards.length > 0}
          <div class="score-pill" transition:fade={{duration:200}}>
            {holeRevealed ? handScore(dealerCards) : `${handScore([dealerCards[0]])} + ?`}
          </div>
        {/if}
      </div>

      <!-- STATUS -->
      {#if statusMsg}
        <div class="status-wrap" transition:fade={{duration:180}}>
          <span class="status-pill">{statusMsg}</span>
        </div>
      {/if}

      <!-- SIDEBET BANNERS -->
      {#if tfBet>0 && tfResult!==null}
        <div class="sb-banner sb-gold" transition:fly={{y:-6,duration:250}}>
          {tfLabel(tfResult)}{#if tfPayout>0} <strong>+{tfPayout.toFixed(0)} CHF</strong>{/if}
        </div>
      {/if}
      {#if ppBet>0 && ppResult!==null}
        <div class="sb-banner sb-violet" transition:fly={{y:-6,duration:250}}>
          {ppLabel(ppResult)}{#if ppPayout>0} <strong>+{ppPayout.toFixed(0)} CHF</strong>{/if}
        </div>
      {/if}

      <!-- INSURANCE STATUS -->
      {#if insuranceOffered && phase !== 'insurance'}
        <div class="ins-status {insuranceResult==='won'?'ins-won':insuranceResult==='lost'?'ins-lost':'ins-nil'}">
          {#if insuranceResult==='won'}🛡️ Insurance won +{insurancePayout.toFixed(0)} CHF
          {:else if insuranceResult==='lost'}🛡️ Insurance lost –{insuranceBet.toFixed(0)} CHF
          {:else}🛡️ Insurance declined{/if}
        </div>
      {/if}

      <!-- INSURANCE PANEL -->
      {#if phase === 'insurance'}
        <div class="ins-panel" transition:fly={{y:10,duration:280}}>
          <div class="ins-row"><span class="text-xl">🛡️</span>
            <div><p class="ins-title">Dealer shows Ace</p><p class="ins-sub">Insurance against Blackjack?</p></div>
          </div>
          <div class="ins-cost"><span>Cost</span><strong>{insuranceCost} CHF</strong></div>
          {#if !canAffordInsurance && insuranceCost>0}<p class="ins-err">Nicht genügend Guthaben.</p>{/if}
          <div class="ins-btns">
            <button onclick={takeInsurance} disabled={!canAffordInsurance} class="ins-take">🛡️ Take –{insuranceCost} CHF</button>
            <button onclick={declineInsurance} class="ins-decline">Decline</button>
          </div>
        </div>
      {/if}

      <!-- PLAYER HANDS -->
      <div class="player-area">
        {#each hands as hand, hi}
          {@const isBust=hand.result==='bust'}
          {@const isBJ=hand.result==='blackjack'}
          <div class="hand-wrap {hands.length>1&&hi!==activeIdx?'hand-dim':''}">
            <div class="hand-badges">
              {#if hands.length>1}<span class="badge-hand">Hand {hi+1}</span>{/if}
              {#if hi===activeIdx&&phase==='player-turn'}<span class="badge-turn" transition:fade={{duration:180}}>Your turn</span>{/if}
              {#if hand.doubled}<span class="badge-dbl" transition:fade={{duration:180}}>2×</span>{/if}
              <div class="score-pill {isBust?'pill-bust':isBJ?'pill-bj':''}">{handScore(hand.cards)}</div>
            </div>
            <div class="cards-fan {isBust?'bust-shake':''} {isBJ?'bj-glow':''}">
              {#each hand.cards as card, ci (ci)}
                {@const di=hand.cardDealIndexes[ci]??ci}
                <div style="animation-delay:{dealDelay(di)}ms" class="card-enter {ci>0?'card-ol':''}">
                  <div class="crd {cardIsRed(card)?'crd-r':'crd-b'} {isBust?'crd-fade':''}">
                    <span class="cr-tl">{card.rank}</span><span class="cr-s">{card.suit}</span><span class="cr-br">{card.rank}</span>
                  </div>
                </div>
              {/each}
            </div>
            <div class="hand-meta">
              <span class="hand-bet">{hand.bet} CHF</span>
              {#if hand.result}<span class="hand-result {resultColor(hand.result)}" transition:fly={{y:4,duration:220}}>{resultLabel(hand.result)}</span>{/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- RESULT OVERLAY -->
      {#if phase === 'result'}
        <div class="result-overlay" transition:fly={{y:14,duration:300}}>
          {#each hands as hand, hi}
            <div class="result-row">
              <span class="result-lbl">{hands.length>1?`Hand ${hi+1}`:'Result'}</span>
              <div class="result-r">
                {#if hand.payout>0}<span class="result-pay">+{hand.payout.toFixed(0)}</span>{/if}
                <span class="result-val {resultColor(hand.result)}">{resultLabel(hand.result)}</span>
              </div>
            </div>
          {/each}
          {#if ppBet>0&&ppResult!==null}<div class="result-side"><span>Perfect Pairs</span><span class="{ppPayout>0?'text-violet-400':'dim'}">{ppPayout>0?`+${ppPayout.toFixed(0)}`:`–${ppBet}`}</span></div>{/if}
          {#if tfBet>0&&tfResult!==null}<div class="result-side"><span>21+3</span><span class="{tfPayout>0?'text-amber-400':'dim'}">{tfPayout>0?`+${tfPayout.toFixed(0)}`:`–${tfBet}`}</span></div>{/if}
          {#if dbBet>0&&dbResult!==null}<div class="result-side"><span>Dealer Bust</span><span class="{dbPayout>0?'text-red-400':'dim'}">{dbPayout>0?`+${dbPayout.toFixed(0)}`:`–${dbBet}`}</span></div>{/if}
          {#if insuranceTaken}<div class="result-side"><span>Insurance</span><span class="{insuranceResult==='won'?'text-emerald-400':'dim'}">{insuranceResult==='won'?`+${insurancePayout.toFixed(0)}`:`–${insuranceBet}`}</span></div>{/if}
          <div class="result-net">
            <span>Net</span>
            <span class="{displayNetResult>0?'green':displayNetResult<0?'red':'amber'}">
              {displayNetResult>0?'+':''}{displayNetResult.toFixed(2)} CHF
            </span>
          </div>
        </div>
      {/if}

    {/if}
  </section>

  <!-- CONTROLS ───────────────────────────────────────────── -->
  <footer class="bj-controls">

    {#if phase === 'setup'}
      <!-- CHIP RACK -->
      <div class="chip-rack">
        {#each CHIPS as chip}
          {@const isActive = selectedChip===chip.value}
          {@const cantAfford = (bankroll-totalBet) <= 0 && !isActive}
          <button
            onclick={()=>{selectedChip=chip.value;betError='';}}
            class="rack-chip {chip.bg} {chip.border} {chip.text}
              {isActive?'rack-active':'rack-idle'}
              {cantAfford?'rack-broke':''}"
            aria-label="Select {chip.label} CHF chip">
            <span class="pointer-events-none absolute inset-[4px] rounded-full border border-white/12"></span>
            {#if isActive}
              <span class="pointer-events-none absolute -inset-[5px] rounded-full border-2 border-white/30 animate-pulse-slow"></span>
            {/if}
            <span class="relative z-10 text-sm font-extrabold leading-none">{chip.label}</span>
            <span class="relative z-10 text-[8px] leading-none opacity-55">CHF</span>
          </button>
        {/each}
      </div>
      <!-- DEAL ROW -->
      <div class="deal-row">
        {#if totalBet>0}
          <button onclick={clearAllBets} class="clear-btn">✕ Clear</button>
        {/if}
        <button onclick={deal} disabled={mainBet<=0} class="deal-btn">🃏 Deal</button>
      </div>

    {:else if phase==='player-turn'}
      <div class="action-grid" transition:fly={{y:12,duration:220}}>
        <button onclick={hit}        disabled={!canHit()}    class="act hit-act"><span class="ai">+</span><span class="al">HIT</span></button>
        <button onclick={stand}      disabled={!canStand()}  class="act sta-act"><span class="ai">–</span><span class="al">STAND</span></button>
        <button onclick={doubleDown} disabled={!canDouble()} class="act dbl-act"><span class="ai">2×</span><span class="al">DOUBLE</span></button>
        <button onclick={split}      disabled={!canSplit()}  class="act spl-act"><span class="ai">⇌</span><span class="al">SPLIT</span></button>
      </div>
      {#if !canDouble()&&ch().cards.length===2&&ch().bet>bankroll}
        <p class="hint">Double: nicht genügend Guthaben</p>
      {/if}
      {#if !canSplit()&&ch().cards.length===2&&bjValue(ch().cards[0].rank)===bjValue(ch().cards[1].rank)&&mainBet>bankroll}
        <p class="hint">Split: nicht genügend Guthaben</p>
      {/if}

    {:else if phase==='result'}
      {#if replayError}<p class="replay-err">{replayError}</p>{/if}
      <div class="eor-col">
        {#if lastMainBet>0}
          <button onclick={playAgain} disabled={isBankrupt} class="eor-replay {isBankrupt?'eor-disabled':''}">
            🔁 Erneut <span class="eor-tag">{lastMainBet+lastPpBet+lastDbBet+lastTfBet} CHF</span>
          </button>
        {/if}
        <div class="eor-row">
          <button onclick={newBet} disabled={isBankrupt} class="eor-new {isBankrupt?'eor-disabled':''}">🎰 Neuer Einsatz</button>
          {#if isBankrupt}
            <span class="eor-menu eor-disabled">🏠 Menü</span>
          {:else}
            <a href="/" class="eor-menu">🏠 Menü</a>
          {/if}
        </div>
      </div>

    {:else}
      <div class="phase-hint">
        {phase==='insurance'?'Insurance decision…':phase==='dealer-turn'?'Dealer plays…':''}
      </div>
    {/if}

  </footer>
</main>

{#if gameOver}
  <!-- ── Full Game Over Modal ────────────────────────────── -->
  <div class="go-backdrop" transition:fade={{ duration: 350 }}>
    <div class="go-modal" transition:fly={{ y: 30, duration: 420 }}>
      <!-- Pulse ring -->
      <div class="go-pulse-ring"></div>

      <div class="go-icon">💸</div>
      <h2 class="go-title">Out of Money</h2>
      <p class="go-sub">Your bankroll has reached zero.</p>
      <p class="go-sub2">The house always wins — but you can try again.</p>

      <div class="go-divider"></div>

      <div class="go-actions">
        <!-- Hand ansehen: hide modal, keep hand visible -->
        <button onclick={() => { gameOver = false; showHand = true; }} class="go-btn go-btn-view">
          👁 Hand ansehen
        </button>
        <!-- Reset Bankroll -->
        <button onclick={handleGameOverReset} class="go-btn go-btn-reset">
          ↺ Reset Bankroll — 1000 CHF
        </button>
        <!-- Return Home -->
        <a href="/" class="go-btn go-btn-home">← Return to Home</a>
      </div>
    </div>
  </div>
{/if}

<!-- Countdown pill: shown during 5-second delay -->
{#if goCountdown > 0}
  <div class="go-countdown-wrap" transition:fade={{ duration: 300 }}>
    <span class="go-countdown-pill">
      💸 Bankrott — Letzte Hand
      <strong class="go-countdown-num">{goCountdown}</strong>
    </span>
  </div>
{/if}

<!-- Show-hand bar: modal dismissed, hand visible -->
{#if showHand}
  <div class="show-hand-bar" transition:fly={{ y: 16, duration: 250 }}>
    <span class="show-hand-label">Letzte Hand — kein Weiterspielen möglich</span>
    <button onclick={() => { showHand = false; gameOver = true; }} class="show-go-btn">
      ⚠ Game Over
    </button>
  </div>
{/if}

<style>
/* ══════════════════════════════════════════════════
   ROOT / LAYOUT
══════════════════════════════════════════════════ */
.bj-root {
  display: flex; flex-direction: column;
  height: 100dvh; max-height: 100dvh;
  background: #06090d; color: #fff;
  overflow: hidden;
}
/* util colours */
.green  { color: #4ade80; }
.amber  { color: #fbbf24; }
.red    { color: #f87171; }
.dim    { color: rgba(255,255,255,0.25); }

/* ── Header ────────────────────────────────────────── */
.bj-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px 6px;
  background: rgba(0,0,0,0.45);
  border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-shrink: 0; z-index: 20;
}
.header-link { font-size: 11px; color: rgba(74,222,128,0.7); text-decoration: none; letter-spacing:.05em; }
.header-link:hover { color:#4ade80; }
.bankroll-pill { display:flex; flex-direction:column; align-items:center; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:4px 12px; }
.bankroll-label { font-size:8px; letter-spacing:.15em; color:rgba(255,255,255,0.25); text-transform:uppercase; }
.bankroll-val   { font-size:14px; font-weight:800; line-height:1.1; }
.mute-btn { width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);font-size:13px;cursor:pointer;transition:background .15s;display:flex;align-items:center;justify-content:center; }
.mute-btn:hover { background:rgba(255,255,255,0.1); }

/* ── Table ─────────────────────────────────────────── */
.bj-table { flex:1; position:relative; overflow:hidden; }

.felt { position:absolute; inset:0; overflow:hidden; }
.felt-inner {
  position:absolute; inset:0;
  background: radial-gradient(ellipse 160% 110% at 50% -5%,
    #13562a 0%, #0b3d1c 30%, #072011 60%, #030f07 100%);
}
.felt-inner::after {
  content:''; position:absolute; inset:0; opacity:.055;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size:250px;
}
/* Gold border */
.felt::before { content:'';position:absolute;inset:0;box-shadow:inset 0 0 0 1px rgba(180,140,40,.12),inset 0 0 50px rgba(0,0,0,.3);pointer-events:none;z-index:3; }
/* Wood arc */
.felt::after { content:'';position:absolute;bottom:-55px;left:-12%;right:-12%;height:110px;background:linear-gradient(to bottom,#2c1a09,#190f05);border-radius:50% 50% 0 0/75px 75px 0 0;box-shadow:0 -3px 14px rgba(0,0,0,.55);z-index:4; }

.table-watermark { position:absolute;top:48%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;z-index:2;width:100%; }
.wm1 { font-size:11px;font-weight:800;letter-spacing:.22em;color:rgba(255,255,255,.055);text-transform:uppercase; }
.wm2 { font-size:7px;letter-spacing:.14em;color:rgba(255,255,255,.03);margin-top:4px; }

/* ══════════════════════════════════════════════════
   SETUP LAYER
══════════════════════════════════════════════════ */
.setup-layer {
  position:absolute; inset:0; z-index:10;
  display:flex; flex-direction:column; align-items:center; justify-content:flex-end;
  padding-bottom:6px;
}

/* Grid of spots */
.spots-grid { display:flex; flex-direction:column; align-items:center; gap:2px; width:100%; padding:0 12px; }

/* Rows */
.spots-row { display:flex; align-items:flex-end; justify-content:center; gap:10px; }
.spots-row-top  { margin-bottom:4px; }
.spots-row-main { align-items:center; }

/* Spot cell */
.spot-cell { display:flex; flex-direction:column; align-items:center; gap:3px; }
.spot-cell-main { }

/* ── The spot button ──────────────────────────────── */
.spot {
  position:relative; border-radius:50%; display:flex; flex-direction:column;
  align-items:center; justify-content:center; border:none; background:transparent;
  cursor:pointer; transition:transform .18s ease, filter .18s ease;
  overflow:visible;
}
.spot:hover  { transform:scale(1.06); filter:brightness(1.18); }
.spot:active { transform:scale(0.96); }
.spot-sm { width:78px;  height:78px; }
.spot-md { width:90px;  height:90px; }
.spot-lg { width:150px; height:150px; }

/* SVG rings drawn on felt */
.spot-ring-svg {
  position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:1;
}
.outer-ring { fill:none; stroke:rgba(255,255,255,.13); stroke-width:1.2; }
.inner-ring { fill:none; stroke:rgba(255,255,255,.07); stroke-width:.8; stroke-dasharray:4 3; }
.inner-ring2{ fill:none; stroke:rgba(255,255,255,.04); stroke-width:.6; }

/* Colour identity per spot */
.pp-ring   { stroke:rgba(139,92,246,.3); }
.pp-ring-i { stroke:rgba(139,92,246,.12); }
.tf-ring   { stroke:rgba(251,191,36,.3); }  /* reuse outer-ring for tf */
.db-ring   { stroke:rgba(239,68,68,.3); }
.db-ring-i { stroke:rgba(239,68,68,.12); }
.main-ring   { stroke:rgba(74,222,128,.35); }
.main-ring-i { stroke:rgba(74,222,128,.14); stroke-dasharray:none; }
.main-ring-i2{ stroke:rgba(74,222,128,.06); stroke-dasharray:6 4; }

/* Radial glow per spot */
.pp-spot   { background:radial-gradient(circle at 50% 60%,rgba(109,40,217,.18) 0%,transparent 65%); }
.tf-spot   { background:radial-gradient(circle at 50% 60%,rgba(180,130,20,.2) 0%,transparent 65%); }
.main-spot { background:radial-gradient(circle at 50% 60%,rgba(6,78,59,.38) 0%,rgba(6,78,59,.08) 55%,transparent 70%); }
.db-spot   { background:radial-gradient(circle at 50% 60%,rgba(153,27,27,.18) 0%,transparent 65%); }

/* Idle content (no bet) */
.spot-idle-content { position:relative;z-index:5; display:flex;flex-direction:column;align-items:center; }
.spot-name  { font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.22); }
.pp-name    { color:rgba(139,92,246,.5); }
.tf-name    { color:rgba(251,191,36,.5); }
.main-name  { font-size:11px;font-weight:900;letter-spacing:.15em;color:rgba(74,222,128,.3); }
.db-name    { color:rgba(239,68,68,.5); }
.spot-odds  { font-size:8px;color:rgba(255,255,255,.1);margin-top:1px; }
.main-odds  { font-size:9px;color:rgba(74,222,128,.15); }

/* Caption below spot */
.spot-caption { font-size:8px;letter-spacing:.1em;color:rgba(255,255,255,.14);text-transform:uppercase; }
.main-caption { color:rgba(74,222,128,.2); font-size:9px; }

/* ══════════════════════════════════════════════════
   CHIP TOWER (vertical stacked coins on spot)
══════════════════════════════════════════════════ */
.chip-tower {
  /* Container for absolute-positioned chips */
  position: absolute;
  /* Center horizontally on the spot */
  left: 50%;
  transform: translateX(-50%);
  /* Height accommodates up to 5 chips × 11px step + chip height (34px) */
  width: 34px;
  height: 90px;
  /* Bottom of container sits ~8px above spot bottom */
  bottom: 22px;
  z-index: 10;
}
.chip-tower-main {
  width: 46px;
  height: 110px;
  bottom: 26px;
}

.chip-coin {
  /* Echte runde Chips — width === height */
  width: 34px;
  height: 34px;
  border-radius: 50%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Äusserer weisser Rand-Ring wie echter Chip */
  border: 2px solid rgba(255,255,255,.18);
  /* Innerer Dekor-Ring via outline */
  outline: 2px solid rgba(0,0,0,.25);
  outline-offset: -5px;
  transition: transform .08s ease;
}
.chip-coin-main {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,.2);
  outline: 3px solid rgba(0,0,0,.25);
  outline-offset: -7px;
}
.chip-lbl {
  font-size: 7px;
  font-weight: 900;
  letter-spacing: .04em;
  opacity: .88;
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0,0,0,.6);
}
.chip-lbl-main { font-size: 8px; }

/* chips are absolute-positioned within .chip-tower, no flex margin needed */

/* Inner decorative ring on round chip (like real casino chips) */
.chip-coin::before {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.12);
  pointer-events: none;
  z-index: 1;
}
.chip-coin-main::before {
  inset: 5px;
  border: 2px solid rgba(255,255,255,0.12);
}
/* Top highlight shimmer */
.chip-coin::after {
  content: '';
  position: absolute;
  top: 3px; left: 20%; right: 20%;
  height: 40%;
  border-radius: 50%;
  background: linear-gradient(to bottom, rgba(255,255,255,.18), transparent);
  pointer-events: none;
  z-index: 3;
}

/* Amount pill below tower */
.bet-pill {
  position: absolute;
  bottom: 4px;
  left: 50%; transform: translateX(-50%);
  font-size: 10px; font-weight: 800;
  color: rgba(255,255,255,.9);
  background: rgba(0,0,0,.7);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
  z-index: 15;
  letter-spacing: .04em;
}
.bet-pill-main {
  font-size: 12px;
  bottom: 5px;
  padding: 2px 10px;
  background: rgba(0,0,0,.75);
}

/* X clear button */
.x-btn {
  position:absolute; top:2px; right:2px;
  width:14px; height:14px; border-radius:50%;
  background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.1);
  font-size:7px; color:rgba(255,255,255,.3);
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  transition:all .15s; z-index:20;
}
.x-btn:hover { background:rgba(153,27,27,.7); color:#fca5a5; }
.x-btn-main  { top:3px; right:3px; width:16px; height:16px; font-size:8px; }

/* Bet meta row */
.bet-meta { margin-top:4px; text-align:center; min-height:18px; }
.bet-err   { font-size:11px; color:#f87171; }
.bet-total { font-size:10px; color:rgba(255,255,255,.28); }
.bet-total strong { color:rgba(74,222,128,.7); }
em { font-style:normal; font-size:9px; margin-left:5px; }
.tag-pp { color:rgba(139,92,246,.6); }
.tag-tf { color:rgba(251,191,36,.6); }
.tag-db { color:rgba(239,68,68,.6); }

/* ══════════════════════════════════════════════════
   GAME AREA
══════════════════════════════════════════════════ */
.dealer-area { position:absolute;top:14px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:6px;z-index:10; }
.player-area { position:absolute;bottom:8px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:10; }
.zone-lbl    { font-size:8px;letter-spacing:.2em;color:rgba(255,255,255,.18);text-transform:uppercase; }

/* Cards */
.cards-fan { display:flex; align-items:flex-end; }
.card-ol   { margin-left:-16px; }

.crd {
  width:58px; height:84px; border-radius:7px;
  border:1px solid rgba(0,0,0,.2);
  box-shadow:0 6px 20px rgba(0,0,0,.6),0 1px 3px rgba(0,0,0,.4);
  background:#fff; position:relative;
  display:flex; align-items:center; justify-content:center;
}
.crd-r { color:#dc2626; }
.crd-b { color:#0f172a; }
.crd-fade { opacity:.5; }
.cr-tl { position:absolute;top:3px;left:5px;font-size:11px;font-weight:900;line-height:1; }
.cr-s  { font-size:20px;font-weight:700;line-height:1; }
.cr-br { position:absolute;bottom:3px;right:5px;font-size:11px;font-weight:900;line-height:1;transform:rotate(180deg); }
.hole-crd { background:#1a2744;overflow:hidden; }
.hole-pat { position:absolute;inset:4px;border-radius:4px;background:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,.04) 3px,rgba(255,255,255,.04) 6px); }
.hole-ico { position:relative;z-index:2;font-size:22px;color:rgba(255,255,255,.15); }

/* Score pill */
.score-pill { display:inline-flex;align-items:center;justify-content:center;min-width:36px;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.12);font-size:13px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.4); }
.pill-bust { background:rgba(127,29,29,.75);border-color:rgba(239,68,68,.4); }
.pill-bj   { background:rgba(6,78,59,.75);border-color:rgba(52,211,153,.4);color:#34d399; }

/* Hand */
.hand-wrap   { display:flex;flex-direction:column;align-items:center;gap:4px; }
.hand-dim    { opacity:.48; }
.hand-badges { display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center; }
.badge-hand  { font-size:8px;color:rgba(255,255,255,.25);letter-spacing:.1em;text-transform:uppercase; }
.badge-turn  { font-size:8px;font-weight:700;color:#34d399;background:rgba(6,78,59,.6);border:1px solid rgba(52,211,153,.25);border-radius:999px;padding:1px 6px; }
.badge-dbl   { font-size:8px;font-weight:700;color:#fbbf24;background:rgba(92,45,9,.6);border:1px solid rgba(251,191,36,.25);border-radius:999px;padding:1px 6px; }
.hand-meta   { display:flex;align-items:center;gap:8px; }
.hand-bet    { font-size:10px;color:rgba(255,255,255,.25); }
.hand-result { font-size:13px;font-weight:700; }

/* Status / overlays */
.status-wrap { position:absolute;inset-x:0;top:42%;display:flex;justify-content:center;z-index:15; }
.status-pill { background:rgba(0,0,0,.78);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:7px 22px;font-size:13px;font-weight:600;backdrop-filter:blur(4px); }

.sb-banner { position:absolute;left:14px;right:14px;border-radius:999px;padding:5px 16px;text-align:center;font-size:11px;font-weight:600;backdrop-filter:blur(4px);z-index:20;background:rgba(0,0,0,.68);border:1px solid rgba(255,255,255,.08); }
.sb-gold   { color:#fbbf24;border-color:rgba(251,191,36,.2);top:30%; }
.sb-violet { color:#a78bfa;border-color:rgba(167,139,250,.2);top:37%; }

.ins-status { position:absolute;top:20%;left:14px;right:14px;text-align:center;font-size:10px;font-weight:600;padding:3px 12px;border-radius:999px;z-index:20; }
.ins-won  { background:rgba(6,78,59,.55);color:#34d399;border:1px solid rgba(52,211,153,.2); }
.ins-lost { background:rgba(127,29,29,.55);color:#f87171;border:1px solid rgba(239,68,68,.2); }
.ins-nil  { background:rgba(20,20,30,.55);color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.07); }

.ins-panel { position:absolute;inset-x:12px;top:26%;background:rgba(10,6,1,.92);border:1px solid rgba(180,130,20,.28);border-radius:18px;padding:16px;z-index:25;backdrop-filter:blur(8px); }
.ins-row   { display:flex;align-items:flex-start;gap:10px;margin-bottom:12px; }
.ins-title { font-size:13px;font-weight:700;color:#fbbf24; }
.ins-sub   { font-size:10px;color:rgba(251,191,36,.45);margin-top:2px; }
.ins-cost  { display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,.35);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:rgba(255,255,255,.45); }
.ins-cost strong { color:#fbbf24;font-size:15px; }
.ins-err   { font-size:10px;color:#f87171;margin-bottom:8px; }
.ins-btns  { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.ins-take    { background:linear-gradient(135deg,#b45309,#78350f);color:#fff;border-radius:12px;padding:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;transition:filter .15s; }
.ins-take:hover:not(:disabled) { filter:brightness(1.15); }
.ins-take:disabled { opacity:.4;cursor:not-allowed; }
.ins-decline { background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);border-radius:12px;padding:10px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s; }
.ins-decline:hover { background:rgba(255,255,255,.1); }

.result-overlay {
  position: absolute;
  /* Hing oben am Tisch, nicht unten — Karten darunter bleiben sichtbar */
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(340px, 92%);
  background: rgba(4,8,14,0.82);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 18px;
  padding: 12px 16px 10px;
  z-index: 20;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
}
.result-row  { display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:4px; }
.result-lbl  { color:rgba(255,255,255,.4);font-size:11px; }
.result-r    { display:flex;align-items:center;gap:8px; }
.result-pay  { font-size:11px;color:#4ade80; }
.result-val  { font-size:13px;font-weight:700; }
.result-side { display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.28);margin-bottom:2px; }
.result-net  { display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.08);margin-top:6px;padding-top:6px; }
.result-net span:first-child { font-size:10px;color:rgba(255,255,255,.3); }
.result-net span:last-child  { font-size:16px;font-weight:800; }

/* ══════════════════════════════════════════════════
   CONTROLS
══════════════════════════════════════════════════ */
.bj-controls { flex-shrink:0;background:rgba(2,4,7,.96);border-top:1px solid rgba(255,255,255,.05);padding:10px 12px 12px;z-index:20; }

/* Chip rack */
.chip-rack { display:flex;justify-content:center;gap:10px;padding:8px 10px 6px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.05);border-radius:14px;margin-bottom:8px; }
.rack-chip { width:50px;height:50px;border-radius:50%;border-width:3px;border-style:solid;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;transition:all .15s ease;user-select:none;cursor:pointer; }
.rack-idle   { opacity:.52; }
.rack-idle:hover { opacity:.88;transform:scale(1.1) translateY(-2px); }
.rack-active {
  transform:scale(1.2) translateY(-3px) !important;
  box-shadow:0 0 0 2.5px rgba(255,255,255,.42),
             0 0 18px rgba(255,255,255,.14),
             0 6px 20px rgba(0,0,0,.6) !important;
  opacity:1 !important;
}
.rack-broke  { opacity:.18 !important; cursor:not-allowed; }

/* Deal row */
.deal-row { display:flex;gap:8px; }
.clear-btn { flex-shrink:0;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);padding:0 16px;font-size:11px;font-weight:600;color:rgba(255,255,255,.35);cursor:pointer;transition:all .15s; }
.clear-btn:hover { border-color:rgba(239,68,68,.4);color:#f87171; }
.deal-btn { flex:1;border-radius:14px;padding:13px;font-size:17px;font-weight:800;letter-spacing:.06em;background:linear-gradient(135deg,#166534,#14532d);border:1px solid rgba(74,222,128,.2);box-shadow:0 4px 18px rgba(74,222,128,.14),inset 0 1px 0 rgba(74,222,128,.1);color:#fff;cursor:pointer;transition:all .15s; }
.deal-btn:hover:not(:disabled) { filter:brightness(1.12);box-shadow:0 6px 24px rgba(74,222,128,.2); }
.deal-btn:active:not(:disabled) { transform:scale(.98); }
.deal-btn:disabled { opacity:.28;cursor:not-allowed; }

/* Action buttons */
.action-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:6px; }
.act { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:11px 6px;border-radius:13px;border:none;cursor:pointer;color:#fff;transition:all .14s ease;user-select:none; }
.act:active:not(:disabled) { transform:scale(.94); }
.act:disabled { opacity:.28;cursor:not-allowed; }
.ai { font-size:18px;font-weight:900;line-height:1; }
.al { font-size:9px;font-weight:800;letter-spacing:.12em;line-height:1; }
.hit-act { background:linear-gradient(160deg,#16a34a,#14532d);box-shadow:0 3px 12px rgba(22,163,74,.3); }
.sta-act { background:linear-gradient(160deg,#dc2626,#7f1d1d);box-shadow:0 3px 12px rgba(220,38,38,.3); }
.dbl-act { background:linear-gradient(160deg,#d97706,#78350f);box-shadow:0 3px 12px rgba(217,119,6,.3); }
.spl-act { background:linear-gradient(160deg,#7c3aed,#3b0764);box-shadow:0 3px 12px rgba(124,58,237,.3); }
.act:hover:not(:disabled) { filter:brightness(1.14); }
.hint { font-size:9px;color:rgba(251,191,36,.6);text-align:center;margin-top:4px; }

/* End of round */
.eor-col   { display:flex;flex-direction:column;gap:6px; }
.eor-replay { width:100%;border-radius:13px;padding:13px;background:linear-gradient(135deg,#166534,#14532d);border:1px solid rgba(74,222,128,.2);color:#fff;font-size:15px;font-weight:700;cursor:pointer;transition:filter .15s;display:flex;align-items:center;justify-content:center;gap:8px; }
.eor-replay:hover { filter:brightness(1.1); }
.eor-replay:active { transform:scale(.98); }
.eor-tag  { background:rgba(255,255,255,.1);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:500; }
.eor-row  { display:grid;grid-template-columns:1fr 1fr;gap:6px; }
.eor-new, .eor-menu { display:flex;align-items:center;justify-content:center;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);font-size:12px;font-weight:600;color:rgba(255,255,255,.55);cursor:pointer;text-decoration:none;transition:all .14s; }
.eor-new:hover, .eor-menu:hover { background:rgba(255,255,255,.08);color:rgba(255,255,255,.8); }
.phase-hint { text-align:center;font-size:10px;letter-spacing:.2em;color:rgba(255,255,255,.15);text-transform:uppercase;padding:12px; }
.replay-err { text-align:center;font-size:11px;color:#f87171;margin-bottom:6px; }

/* ══════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════ */
.toast {
  position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
  z-index: 999;
  background: rgba(10,12,18,0.92);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  padding: 8px 22px;
  font-size: 12px; font-weight: 600;
  color: rgba(255,255,255,0.88);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
  white-space: nowrap;
  pointer-events: none;
}

/* ══════════════════════════════════════════════════
   ANIMATIONS
══════════════════════════════════════════════════ */
@keyframes pulse-slow { 0%,100%{opacity:.45;} 50%{opacity:.12;} }
.animate-pulse-slow { animation:pulse-slow 1.8s ease-in-out infinite; }

.card-enter { animation:cardIn 270ms cubic-bezier(0.22,1,0.36,1) both; }
@keyframes cardIn { from{opacity:0;transform:translateY(-18px) scale(.9);} to{opacity:1;transform:translateY(0) scale(1);} }

.card-flip { animation:cardFlip 400ms cubic-bezier(0.4,0,0.2,1) both;transform-style:preserve-3d; }
@keyframes cardFlip { 0%{transform:rotateY(90deg) scale(.9);opacity:.3;} 60%{transform:rotateY(-8deg) scale(1.04);opacity:1;} 100%{transform:rotateY(0) scale(1);opacity:1;} }

.bj-glow { animation:bjGlow 700ms ease-out both; }
@keyframes bjGlow { 0%{filter:drop-shadow(0 0 0 rgba(52,211,153,0));} 35%{filter:drop-shadow(0 0 10px rgba(52,211,153,.8));} 100%{filter:drop-shadow(0 0 3px rgba(52,211,153,.2));} }

.bust-shake { animation:bustShake 400ms cubic-bezier(0.36,0.07,0.19,0.97) both; }
@keyframes bustShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)} }

.chip-drop { animation:chipDrop 350ms cubic-bezier(0.34,1.56,0.64,1) both; }
@keyframes chipDrop { 0%{transform:translateY(-12px) scale(.86);filter:brightness(1.7);} 60%{transform:translateY(2px) scale(1.03);} 100%{transform:translateY(0) scale(1);filter:brightness(1);} }

/* GameOver modal: reduce backdrop so cards remain visible */
:global(.game-over-backdrop) {
  background: rgba(0,0,0,0.6) !important;
  backdrop-filter: blur(3px) !important;
}
:global(.game-over-card) {
  max-width: 320px !important;
}


/* ══════════════════════════════════════════════════
   GAME OVER MODAL (inline, replaces GameOver component)
══════════════════════════════════════════════════ */
.go-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.go-modal {
  position: relative;
  width: min(320px, 100%);
  background: #050810;
  border: 1px solid rgba(220,38,38,0.35);
  border-radius: 24px;
  padding: 28px 24px 22px;
  text-align: center;
  box-shadow: 0 0 60px rgba(220,38,38,0.12), 0 20px 60px rgba(0,0,0,0.7);
}
.go-pulse-ring {
  position: absolute; inset: -1px; border-radius: 24px;
  animation: goPulse 2.4s ease-in-out infinite;
  pointer-events: none;
}
@keyframes goPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); }
  50%      { box-shadow: 0 0 20px 6px rgba(220,38,38,0.1); }
}
.go-icon  { font-size: 40px; margin-bottom: 12px; animation: goIconIn 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
@keyframes goIconIn { from{opacity:0;transform:scale(0.4) rotate(-15deg);} to{opacity:1;transform:scale(1) rotate(0);} }
.go-title { font-size: 24px; font-weight: 800; color: #f87171; letter-spacing: .02em; margin-bottom: 6px; }
.go-sub   { font-size: 12px; color: rgba(255,255,255,.45); margin-bottom: 2px; }
.go-sub2  { font-size: 10px; color: rgba(255,255,255,.22); margin-bottom: 16px; }
.go-divider { height: 1px; background: linear-gradient(to right, transparent, rgba(220,38,38,.25), transparent); margin-bottom: 16px; }
.go-actions { display: flex; flex-direction: column; gap: 8px; }
.go-btn {
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px; padding: 12px; font-size: 13px; font-weight: 700;
  cursor: pointer; text-decoration: none; transition: all 0.15s; border: none;
  color: #fff;
}
.go-btn-view  { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); color: rgba(255,255,255,.75); font-size: 12px; padding: 10px; }
.go-btn-view:hover  { background: rgba(255,255,255,.12); }
.go-btn-reset { background: linear-gradient(135deg,#7f1d1d,#991b1b); border: 1px solid rgba(239,68,68,.3); box-shadow: 0 0 16px rgba(220,38,38,.15); }
.go-btn-reset:hover { filter: brightness(1.15); box-shadow: 0 0 24px rgba(220,38,38,.25); }
.go-btn-home  { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.55); font-size: 13px; font-weight: 600; }
.go-btn-home:hover  { background: rgba(255,255,255,.09); color: rgba(255,255,255,.8); }

/* Countdown pill */
.go-countdown-wrap {
  position: fixed; top: 72px; left: 50%; transform: translateX(-50%);
  z-index: 9998; pointer-events: none;
}
.go-countdown-pill {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(127,29,29,0.88);
  border: 1px solid rgba(239,68,68,.35);
  border-radius: 999px;
  padding: 8px 20px;
  font-size: 12px; font-weight: 600; color: #fca5a5;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 20px rgba(0,0,0,.5);
}
.go-countdown-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 50%;
  background: rgba(220,38,38,.5); color: #fff;
  font-size: 13px; font-weight: 900;
}

/* Show-hand bar (bottom) */
.show-hand-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9998;
  background: rgba(5,8,14,0.95);
  border-top: 1px solid rgba(220,38,38,.25);
  padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  backdrop-filter: blur(8px);
}
.show-hand-label { font-size: 11px; color: rgba(255,255,255,.35); letter-spacing: .05em; }
.show-go-btn {
  flex-shrink: 0;
  background: rgba(127,29,29,.7);
  border: 1px solid rgba(239,68,68,.3);
  border-radius: 10px; padding: 8px 14px;
  font-size: 11px; font-weight: 700; color: #fca5a5;
  cursor: pointer; transition: all .15s;
}
.show-go-btn:hover { background: rgba(153,27,27,.85); }

/* EOR buttons disabled during bankrupt/countdown */
.eor-disabled {
  opacity: 0.28 !important;
  cursor: not-allowed !important;
  pointer-events: none !important;
  filter: grayscale(0.4);
}

</style>