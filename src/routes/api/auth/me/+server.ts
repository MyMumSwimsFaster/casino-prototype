// src/routes/api/auth/me/+server.ts
import { json } from '@sveltejs/kit';
import { getUserBankroll } from '$lib/server/auth';

export async function GET({ locals }) {
	if (!locals.user) return json({ user: null });
	const bankroll = await getUserBankroll(locals.user.id);
	// Return user WITH bankroll so lobby can sync
	return json({ user: { ...locals.user, bankroll } });
}