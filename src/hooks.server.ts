// src/hooks.server.ts
// Reads the session cookie on every request and populates locals.user.

import { getSessionUser, ensureAuthIndexes } from '$lib/server/auth';

let indexesEnsured = false;

export async function handle({ event, resolve }) {
	// Ensure MongoDB indexes once on first request
	if (!indexesEnsured) {
		try { await ensureAuthIndexes(); indexesEnsured = true; } catch {}
	}

	// Read session token from httpOnly cookie
	const token = event.cookies.get('session');
	event.locals.user = token ? await getSessionUser(token) : null;

	return resolve(event);
}