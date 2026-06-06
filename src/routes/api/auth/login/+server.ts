// src/routes/api/auth/login/+server.ts
import { json } from '@sveltejs/kit';
import { findUserByEmail, verifyPassword, createSession } from '$lib/server/auth';

export async function POST({ request, cookies }) {
	const { email, password } = await request.json();

	if (!email || !password) return json({ error: 'Email and password required.' }, { status: 400 });

	const user = await findUserByEmail(email);
	if (!user) return json({ error: 'Invalid email or password.' }, { status: 401 });

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid)  return json({ error: 'Invalid email or password.' }, { status: 401 });

	const token = await createSession(user._id);
	cookies.set('session', token, {
		httpOnly: true, path: '/', maxAge: 30 * 24 * 60 * 60, sameSite: 'lax', secure: false,
	});

	// Return user + bankroll so client can sync localStorage immediately
	return json({
		success:  true,
		user:     { id: user._id.toString(), username: user.username, email: user.email },
		bankroll: user.bankroll,
	});
}