import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST({ request }) {
	const body = await request.json();

	await db.collection('games').insertOne({
		game: 'blackjack',
		bet: body.bet,
		playerScore: body.playerScore,
		dealerScore: body.dealerScore,
		result: body.result,
		createdAt: new Date()
	});

	return json({ success: true });
}