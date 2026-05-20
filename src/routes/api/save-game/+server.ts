import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST({ request }) {
	const body = await request.json();

	if (body.game === 'baccarat') {
		await db.collection('games').insertOne({
			game: 'baccarat',
			bet: body.bet,
			selectedBet: body.selectedBet,
			playerCards: body.playerCards,   // string[], e.g. ["A♠", "7♥"]
			bankerCards: body.bankerCards,   // string[], e.g. ["K♣", "3♦", "6♠"]
			playerScore: body.playerScore,
			bankerScore: body.bankerScore,
			result: body.result,
			playerWon: body.playerWon,
			naturalHand: body.naturalHand,
			createdAt: new Date()
		});
	} else {
		// Blackjack — bestehende Logik unverändert
		await db.collection('games').insertOne({
			game: 'blackjack',
			bet: body.bet,
			playerScore: body.playerScore,
			dealerScore: body.dealerScore,
			result: body.result,
			createdAt: new Date()
		});
	}

	return json({ success: true });
}