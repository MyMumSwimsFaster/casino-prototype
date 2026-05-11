import { db } from '$lib/server/db';

export async function load() {
	const games = await db
		.collection('games')
		.find({})
		.sort({ createdAt: -1 })
		.toArray();

	return {
		games: JSON.parse(JSON.stringify(games))
	};
}
