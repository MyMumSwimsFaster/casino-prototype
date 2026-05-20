import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function POST() {
	await db.collection('games').deleteMany({});

	return json({
		success: true
	});
}