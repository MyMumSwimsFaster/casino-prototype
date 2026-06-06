// src/lib/server/auth.ts

import bcrypt from 'bcryptjs';
import { db }  from './db';
import type { Collection, ObjectId } from 'mongodb';

export interface UserDoc {
	_id:                 ObjectId;
	username:            string;
	email:               string;
	passwordHash:        string;
	bankroll:            number;   // persisted bankroll
	welcomeBonusGranted: boolean;  // true once, set at registration
	createdAt:           Date;
}

interface SessionDoc {
	_id:       ObjectId;
	userId:    ObjectId;
	token:     string;
	createdAt: Date;
	expiresAt: Date;
}

function users():    Collection<UserDoc>    { return db.collection<UserDoc>('users'); }
function sessions(): Collection<SessionDoc> { return db.collection<SessionDoc>('sessions'); }

const SALT_ROUNDS = 12;
export async function hashPassword(plain: string)               { return bcrypt.hash(plain, SALT_ROUNDS); }
export async function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash); }

function randomToken(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── User CRUD ─────────────────────────────────────────────────────────────────

export async function createUser(username: string, email: string, password: string) {
	const col = users();
	if (await col.findOne({ email:    email.toLowerCase()  })) throw new Error('Email already registered.');
	if (await col.findOne({ username: username.trim()       })) throw new Error('Username already taken.');

	const passwordHash = await hashPassword(password);
	const result = await col.insertOne({
		username:            username.trim(),
		email:               email.toLowerCase().trim(),
		passwordHash,
		bankroll:            2000,  // 1000 base + 1000 welcome bonus (granted once)
		welcomeBonusGranted: true,  // never re-granted on subsequent logins
		createdAt:           new Date(),
	} as UserDoc);
	return result.insertedId;
}

export async function findUserByEmail(email: string) {
	return users().findOne({ email: email.toLowerCase().trim() });
}

export async function findUserById(id: string) {
	const { ObjectId } = await import('mongodb');
	return users().findOne({ _id: new ObjectId(id) });
}

export async function getUserBankroll(userId: string): Promise<number> {
	const user = await findUserById(userId);
	return user?.bankroll ?? 2000;
}

export async function setUserBankroll(userId: string, amount: number): Promise<void> {
	const { ObjectId } = await import('mongodb');
	await users().updateOne(
		{ _id: new ObjectId(userId) },
		{ $set: { bankroll: amount } }
	);
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const SESSION_TTL_DAYS = 30;

export async function createSession(userId: ObjectId): Promise<string> {
	const token     = randomToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
	await sessions().insertOne({ userId, token, createdAt: new Date(), expiresAt } as SessionDoc);
	return token;
}

export async function getSessionUser(token: string) {
	if (!token) return null;
	const session = await sessions().findOne({ token, expiresAt: { $gt: new Date() } });
	if (!session) return null;
	const user = await users().findOne({ _id: session.userId });
	if (!user) return null;
	return { id: user._id.toString(), username: user.username, email: user.email, bankroll: user.bankroll };
}

export async function deleteSession(token: string): Promise<void> {
	await sessions().deleteOne({ token });
}

export async function ensureAuthIndexes() {
	await users().createIndex({ email:    1 }, { unique: true });
	await users().createIndex({ username: 1 }, { unique: true });
	await sessions().createIndex({ token:     1 }, { unique: true });
	await sessions().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}