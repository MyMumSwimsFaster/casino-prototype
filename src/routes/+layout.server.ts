// src/routes/+layout.server.ts
// Exposes locals.user to ALL pages via data.user on every navigation.
// This ensures the session stays fresh after login/logout/invalidateAll().
export async function load({ locals }) {
	return {
		user: locals.user ?? null,
	};
}