// src/routes/api/auth/register/+server.ts
import { json } from '@sveltejs/kit';
import { createUser, createSession, getUserBankroll } from '$lib/server/auth';

export async function POST({ request, cookies }) {
	const { username, email, password, confirmPassword } = await request.json();

	if (!username?.trim())    return json({ error: 'Username required.' },          { status: 400 });
	if (!email?.trim())       return json({ error: 'Email required.' },             { status: 400 });
	if (!password)            return json({ error: 'Password required.' },          { status: 400 });
	if (password.length < 8)  return json({ error: 'Password min 8 characters.' }, { status: 400 });
	if (password !== confirmPassword) return json({ error: 'Passwords do not match.' }, { status: 400 });
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email.' }, { status: 400 });

	try {
		const userId   = await createUser(username.trim(), email.trim(), password);
		const token    = await createSession(userId);
		const bankroll = await getUserBankroll(userId.toString());

		cookies.set('session', token, {
			httpOnly: true, path: '/', maxAge: 30 * 24 * 60 * 60, sameSite: 'lax', secure: false,
		});

		// Return user + bankroll so client can cache immediately
		return json({
			success:  true,
			user:     { id: userId.toString(), username: username.trim(), email: email.toLowerCase().trim() },
			bankroll,
		});
	} catch (err: any) {
		return json({ error: err.message ?? 'Registration failed.' }, { status: 400 });
	}
}