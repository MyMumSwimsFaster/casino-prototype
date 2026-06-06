// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			user: {
				id:       string;
				username: string;
				email:    string;
			} | null;
		}
	}
}

export {};