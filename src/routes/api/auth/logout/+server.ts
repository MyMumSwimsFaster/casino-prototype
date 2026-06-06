// src/routes/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/auth';

export async function POST({ cookies }) {
	const token = cookies.get('session');
	if (token) {
		await deleteSession(token);
	}
	// Always delete cookie regardless of whether token was found
	cookies.delete('session', { path: '/' });
	return json({ success: true });
}