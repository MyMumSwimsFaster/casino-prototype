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
			// Bankroll-Felder
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
			// Bankroll-Felder
			payout:         body.payout         ?? null,
			bankrollBefore: body.bankrollBefore  ?? null,
			bankrollAfter:  body.bankrollAfter   ?? null,
			netResult:      body.netResult       ?? null,
			createdAt:      new Date()
		});
	}

	return json({ success: true });
}