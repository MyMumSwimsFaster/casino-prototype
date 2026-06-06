// src/routes/account/+page.server.ts
import { redirect }        from '@sveltejs/kit';
import { db }              from '$lib/server/db';
import { getUserBankroll } from '$lib/server/auth';

export async function load({ locals }) {
	if (!locals.user) throw redirect(302, '/login');

	const userId   = locals.user.id;
	const bankroll = await getUserBankroll(userId);

	// Calculate all-time stats from games collection
	const games = await db.collection('games').find({ userId }).toArray();
	const stats = { hands:0, wins:0, losses:0, pushes:0, winRate:0, bestWin:0, totalPnL:0 };

	for (const g of games) {
		stats.hands++;
		const net: number = typeof g.netResult === 'number' ? g.netResult
			: (typeof g.bankrollBefore === 'number' && typeof g.bankrollAfter === 'number')
			  ? Math.round((g.bankrollAfter - g.bankrollBefore) * 100) / 100 : 0;
		stats.totalPnL += net;
		if      (net > 0) { stats.wins++;   if (net > stats.bestWin) stats.bestWin = net; }
		else if (net < 0)   stats.losses++;
		else                stats.pushes++;
	}

	const finished = stats.wins + stats.losses + stats.pushes;
	stats.winRate  = finished > 0 ? Math.round((stats.wins / finished) * 1000) / 10 : 0;
	stats.totalPnL = Math.round(stats.totalPnL * 100) / 100;
	stats.bestWin  = Math.round(stats.bestWin * 100) / 100;

	return { user: locals.user, bankroll, stats };
}