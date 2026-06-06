// src/routes/history/+page.server.ts
// Logged-in users: load their games from MongoDB.
// Guests: return empty array — their history lives in sessionStorage (client-only).

import { db } from '$lib/server/db';

export async function load({ locals }) {
	if (!locals.user) {
		// Never query userId:null — that would show ALL guests' shared history.
		// The client will hydrate guest history from sessionStorage in onMount.
		return { games: [], user: null };
	}

	const games = await db
		.collection('games')
		.find({ userId: locals.user.id })
		.sort({ createdAt: -1 })
		.toArray();

	return {
		games: JSON.parse(JSON.stringify(games)),
		user:  locals.user,
	};
}