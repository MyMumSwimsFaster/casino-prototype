// src/routes/api/clear-history/+server.ts
// Guests: client handles deletion in sessionStorage (this endpoint is not called).
// Logged-in: delete only THIS user's games, never userId:null or other users.

import { json } from '@sveltejs/kit';
import { db }  from '$lib/server/db';

export async function POST({ locals }) {
	if (!locals.user) {
		// Guest history lives in sessionStorage — nothing to delete on server
		return json({ success: true, guest: true });
	}
	await db.collection('games').deleteMany({ userId: locals.user.id });
	return json({ success: true });
}