import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST({ request }) {
	const body = await request.json();

	if (body.game === 'baccarat') {
		await db.collection('games').insertOne({
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
			payout:         body.payout         ?? null,
			bankrollBefore: body.bankrollBefore  ?? null,
			bankrollAfter:  body.bankrollAfter   ?? null,
			netResult:      body.netResult       ?? null,
			createdAt:      new Date()
		});
	} else {
		// Blackjack
		await db.collection('games').insertOne({
			game:           'blackjack',
			bet:            body.bet,
			playerHands:    body.playerHands,
			dealerCards:    body.dealerCards,
			dealerScore:    body.dealerScore,
			result:         body.result,
			payout:         body.payout         ?? null,
			bankrollBefore: body.bankrollBefore  ?? null,
			bankrollAfter:  body.bankrollAfter   ?? null,
			netResult:      body.netResult       ?? null,
			// Insurance
			insuranceOffered: body.insuranceOffered ?? false,
			insuranceTaken:   body.insuranceTaken   ?? false,
			insuranceBet:     body.insuranceBet     ?? 0,
			insuranceResult:  body.insuranceResult  ?? null,
			insurancePayout:  body.insurancePayout  ?? 0,
			// Sidebets
			perfectPairsBet:    body.perfectPairsBet    ?? 0,
			perfectPairsResult: body.perfectPairsResult ?? null,
			perfectPairsPayout: body.perfectPairsPayout ?? 0,
			dealerBustBet:      body.dealerBustBet      ?? 0,
			dealerBustResult:   body.dealerBustResult   ?? null,
			dealerBustPayout:   body.dealerBustPayout   ?? 0,
			// 21+3
			twentyOneThreeBet:    body.twentyOneThreeBet    ?? 0,
			twentyOneThreeResult: body.twentyOneThreeResult ?? null,
			twentyOneThreePayout: body.twentyOneThreePayout ?? 0,
			twentyOneThreeCards:  body.twentyOneThreeCards  ?? [],
			createdAt:      new Date()
		});
	}

	return json({ success: true });
}