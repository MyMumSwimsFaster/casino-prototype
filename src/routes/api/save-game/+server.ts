import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST({ request }) {
	const body = await request.json();

	if (body.game === 'baccarat') {
		// Baccarat — unverändert
		await db.collection('games').insertOne({
			game: 'baccarat',
			bet: body.bet,
			selectedBet: body.selectedBet,
			playerCards: body.playerCards,
			bankerCards: body.bankerCards,
			playerScore: body.playerScore,
			bankerScore: body.bankerScore,
			result: body.result,
			playerWon: body.playerWon,
			naturalHand: body.naturalHand,
			createdAt: new Date()
		});
	} else {
		// Blackjack — neues Schema mit playerHands
		// dealerScore und result werden als Legacy-Felder mitgespeichert,
		// damit die History rückwärtskompatibel bleibt.
		await db.collection('games').insertOne({
			game: 'blackjack',
			bet: body.bet,
			playerHands: body.playerHands,   // Array von { cards, score, bet, doubled, result }
			dealerCards: body.dealerCards,    // string[], z.B. ["K♠", "7♥"]
			dealerScore: body.dealerScore,
			result: body.result,              // Ergebnis der ersten Hand (Legacy)
			createdAt: new Date()
		});
	}

	return json({ success: true });
}