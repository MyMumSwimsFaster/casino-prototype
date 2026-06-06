// src/routes/+page.server.ts
// Pass current user to the lobby so it can show login/profile buttons.
export async function load({ locals }) {
	return { user: locals.user ?? null };
}