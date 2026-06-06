<!-- src/routes/register/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { loadUserSession } from '$lib/bankroll';

	let username        = $state('');
	let email           = $state('');
	let password        = $state('');
	let confirmPassword = $state('');
	let error   = $state('');
	let loading = $state(false);

	async function handleRegister() {
		error = '';
		if (!username || !email || !password || !confirmPassword) {
			error = 'Please fill in all fields.'; return;
		}
		loading = true;
		try {
			const res  = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, email, password, confirmPassword }),
			});
			const data = await res.json();
			if (!res.ok) { error = data.error ?? 'Registration failed.'; return; }

			// ← KEY: cache user + fresh 2000 CHF bankroll before redirecting
			await loadUserSession(data.user, data.bankroll);
			goto('/');
		} catch {
			error = 'Network error. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="auth-root">
	<div class="auth-bg" aria-hidden="true">
		<div class="abg-r1"></div><div class="abg-r2"></div>
		<div class="abg-noise"></div>
	</div>
	<div class="auth-card">
		<a href="/" class="auth-back">← Lobby</a>
		<div class="auth-logo">♦</div>
		<h1 class="auth-title">CREATE ACCOUNT</h1>
		<p class="auth-sub">Join the table</p>

		{#if error}<div class="auth-error">{error}</div>{/if}

		<div class="auth-form">
			<div class="field">
				<label class="field-label" for="un">Username</label>
				<input id="un" type="text" bind:value={username} class="field-input" placeholder="highroller99"/>
			</div>
			<div class="field">
				<label class="field-label" for="em">Email</label>
				<input id="em" type="email" bind:value={email} class="field-input" placeholder="you@example.com"/>
			</div>
			<div class="field">
				<label class="field-label" for="pw">Password</label>
				<input id="pw" type="password" bind:value={password} class="field-input" placeholder="Min. 8 characters"/>
			</div>
			<div class="field">
				<label class="field-label" for="pw2">Confirm Password</label>
				<input id="pw2" type="password" bind:value={confirmPassword} class="field-input" placeholder="••••••••"
					onkeydown={(e) => e.key === 'Enter' && handleRegister()}/>
			</div>
			<button onclick={handleRegister} disabled={loading} class="auth-btn">
				{loading ? 'Creating account…' : 'Create Account →'}
			</button>
		</div>

		<p class="auth-switch">
			Already have an account? <a href="/login" class="auth-link">Sign in</a>
		</p>
	</div>
</div>

<style>
:global(body){margin:0;background:#05080d;}
.auth-root{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;position:relative;}
.auth-bg{position:fixed;inset:0;pointer-events:none;}
.abg-r1{position:absolute;top:-10%;left:-10%;width:60%;height:60%;background:radial-gradient(ellipse,rgba(80,40,10,.2) 0%,transparent 65%);}
.abg-r2{position:absolute;bottom:-10%;right:-5%;width:50%;height:50%;background:radial-gradient(ellipse,rgba(6,78,59,.15) 0%,transparent 65%);}
.abg-noise{position:absolute;inset:0;opacity:.03;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)'/%3E%3C/svg%3E");background-size:250px;}
.auth-card{position:relative;z-index:1;width:100%;max-width:380px;background:rgba(8,14,20,.92);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:32px 28px;box-shadow:0 20px 60px rgba(0,0,0,.6);}
.auth-back{display:inline-block;font-size:11px;color:rgba(220,120,30,.7);text-decoration:none;letter-spacing:.08em;margin-bottom:20px;transition:color .15s;}
.auth-back:hover{color:rgba(220,150,50,.9);}
.auth-logo{font-size:36px;text-align:center;color:rgba(220,120,30,.8);text-shadow:0 0 20px rgba(220,120,30,.3);margin-bottom:12px;}
.auth-title{font-size:20px;font-weight:900;letter-spacing:.2em;text-align:center;color:#fff;margin:0 0 6px;}
.auth-sub{font-size:11px;color:rgba(255,255,255,.25);text-align:center;letter-spacing:.12em;text-transform:uppercase;margin:0 0 24px;}
.auth-error{background:rgba(127,29,29,.4);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:10px 14px;font-size:12px;color:#f87171;margin-bottom:16px;text-align:center;}
.auth-form{display:flex;flex-direction:column;gap:14px;}
.field{display:flex;flex-direction:column;gap:6px;}
.field-label{font-size:9px;font-weight:700;letter-spacing:.18em;color:rgba(255,255,255,.3);text-transform:uppercase;}
.field-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 14px;font-size:14px;color:#fff;outline:none;transition:border-color .15s;}
.field-input::placeholder{color:rgba(255,255,255,.2);}
.field-input:focus{border-color:rgba(220,120,30,.4);}
.auth-btn{background:linear-gradient(135deg,#7c2d12,#9a3412);border:1px solid rgba(220,120,30,.3);border-radius:12px;padding:13px;font-size:14px;font-weight:800;letter-spacing:.06em;color:#fff;cursor:pointer;transition:all .15s;margin-top:4px;}
.auth-btn:hover:not(:disabled){filter:brightness(1.12);}
.auth-btn:disabled{opacity:.5;cursor:not-allowed;}
.auth-switch{text-align:center;font-size:12px;color:rgba(255,255,255,.3);margin-top:20px;}
.auth-link{color:rgba(220,120,30,.7);text-decoration:none;transition:color .15s;}
.auth-link:hover{color:rgba(220,150,50,.9);}
</style>