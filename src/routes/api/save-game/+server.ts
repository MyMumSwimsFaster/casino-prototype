// src/routes/api/save-game/+server.ts
// Only saves to MongoDB for authenticated users.
// Guests handle their own history in sessionStorage on the client.

import { json } from '@sveltejs/kit';
import { db }  from '$lib/server/db';

export async function POST({ request, locals }) {
	// ── Guests: do NOT write to MongoDB ─────────────────────────────────────
	// Guest rounds would share a global userId:null pool — every guest would
	// see every other guest's history. Return success so the client can store
	// the round locally in sessionStorage instead.
	if (!locals.user) {
		return json({ success: true, guest: true });
	}

	const body   = await request.json();
	const userId = locals.user.id;

	if (body.game === 'baccarat') {
		await db.collection('games').insertOne({
			userId,
			game:           'baccarat',
			bet:            body.bet,
			selectedBet:    body.selectedBet,
			playerCards:    body.playerCards,
			bankerCards:    body.bankerCards,
			playerScore:    body.playerScore,
			bankerScore:    body.bankerScore,
			result:         body.result,
			playerWon:      body.playerWon,
			naturalHand:    body.naturalHand,
			payout:         body.payout        ?? null,
			bankrollBefore: body.bankrollBefore ?? null,
			bankrollAfter:  body.bankrollAfter  ?? null,
			netResult:      body.netResult      ?? null,
			createdAt:      new Date(),
		});
	} else {
		await db.collection('games').insertOne({
			userId,
			game:           'blackjack',
			bet:            body.bet,
			playerHands:    body.playerHands,
			dealerCards:    body.dealerCards,
			dealerScore:    body.dealerScore,
			result:         body.result,
			payout:         body.payout        ?? null,
			bankrollBefore: body.bankrollBefore ?? null,
			bankrollAfter:  body.bankrollAfter  ?? null,
			netResult:      body.netResult      ?? null,
			insuranceOffered: body.insuranceOffered ?? false,
			insuranceTaken:   body.insuranceTaken   ?? false,
			insuranceBet:     body.insuranceBet     ?? 0,
			insuranceResult:  body.insuranceResult  ?? null,
			insurancePayout:  body.insurancePayout  ?? 0,
			perfectPairsBet:    body.perfectPairsBet    ?? 0,
			perfectPairsResult: body.perfectPairsResult ?? null,
			perfectPairsPayout: body.perfectPairsPayout ?? 0,
			dealerBustBet:      body.dealerBustBet      ?? 0,
			dealerBustResult:   body.dealerBustResult   ?? null,
			dealerBustPayout:   body.dealerBustPayout   ?? 0,
			twentyOneThreeBet:    body.twentyOneThreeBet    ?? 0,
			twentyOneThreeResult: body.twentyOneThreeResult ?? null,
			twentyOneThreePayout: body.twentyOneThreePayout ?? 0,
			twentyOneThreeCards:  body.twentyOneThreeCards  ?? [],
			createdAt:      new Date(),
		});
	}

	// Keep bankroll in sync for logged-in users
	if (typeof body.bankrollAfter === 'number') {
		const { setUserBankroll } = await import('$lib/server/auth');
		await setUserBankroll(userId, body.bankrollAfter);
	}

	return json({ success: true });
}