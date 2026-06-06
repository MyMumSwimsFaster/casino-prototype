// src/routes/+layout.server.ts
// Makes locals.user available to all pages via data.user.
// This ensures the user state is fresh on every server-rendered navigation.
export async function load({ locals }) {
	return {
		user: locals.user ?? null,
	};
}