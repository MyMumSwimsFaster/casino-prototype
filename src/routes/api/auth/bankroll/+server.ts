// src/routes/api/auth/bankroll/+server.ts
import { json } from '@sveltejs/kit';
import { getUserBankroll, setUserBankroll } from '$lib/server/auth';

export async function GET({ locals }) {
	if (!locals.user) return json({ error: 'Not authenticated.' }, { status: 401 });
	const bankroll = await getUserBankroll(locals.user.id);
	return json({ bankroll });
}

export async function POST({ request, locals }) {
	if (!locals.user) return json({ error: 'Not authenticated.' }, { status: 401 });
	const { bankroll } = await request.json();
	if (typeof bankroll !== 'number') return json({ error: 'Invalid bankroll.' }, { status: 400 });
	await setUserBankroll(locals.user.id, bankroll);
	return json({ success: true });
}