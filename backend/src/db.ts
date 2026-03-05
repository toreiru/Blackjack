import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: any[]) => {
    return pool.query(text, params);
};

export const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Users Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" SERIAL PRIMARY KEY,
        "username" TEXT UNIQUE NOT NULL,
        "password" TEXT NOT NULL,
        "role" TEXT DEFAULT 'PLAYER' NOT NULL,
        "whatsapp" TEXT,
        "coins" DOUBLE PRECISION DEFAULT 0 NOT NULL,
        "referralCode" TEXT UNIQUE NOT NULL,
        "referredById" INTEGER REFERENCES "User"("id"),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // Friendships Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS "Friendship" (
        "id" SERIAL PRIMARY KEY,
        "requesterId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "addresseeId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "status" TEXT DEFAULT 'PENDING' NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("requesterId", "addresseeId")
      );
    `);

        // Transactions Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS "Transaction" (
        "id" SERIAL PRIMARY KEY,
        "amount" DOUBLE PRECISION NOT NULL,
        "type" TEXT NOT NULL,
        "senderId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
        "receiverId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

        await client.query('COMMIT');
        console.log('Database tables initialized successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing database tables:', error);
        throw error;
    } finally {
        client.release();
    }
};

export default {
    query,
    pool,
    initializeDatabase,
};
