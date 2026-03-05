import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret'; // In production, never fallback

export const register = async (req: Request, res: Response) => {
    const { username, password, referralCode } = req.body;

    try {
        // Check if user exists
        const existingUserRes = await db.query('SELECT username FROM "User" WHERE username = $1', [username]);
        if (existingUserRes.rows.length > 0) {
            return res.status(400).json({ error: 'Username already taken.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate unique referral code for this new user
        const newReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

        // Check if player used a referral code
        let referredById = null;
        if (referralCode) {
            const referrerRes = await db.query('SELECT id FROM "User" WHERE "referralCode" = $1', [referralCode]);
            if (referrerRes.rows.length > 0) {
                referredById = referrerRes.rows[0].id;
            }
        }

        // Role is PLAYER by default
        const insertUserRes = await db.query(
            'INSERT INTO "User" (username, password, "referralCode", "referredById") VALUES ($1, $2, $3, $4) RETURNING id',
            [username, hashedPassword, newReferralCode, referredById]
        );
        const userId = insertUserRes.rows[0].id;

        res.status(201).json({ message: 'User created successfully', userId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating user' });
    }
};

export const login = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const userRes = await db.query('SELECT * FROM "User" WHERE username = $1', [username]);

        if (userRes.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = userRes.rows[0];

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                coins: user.coins,
                referralCode: user.referralCode
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error logging in' });
    }
};

export const getProfile = async (req: any, res: Response) => {
    try {
        const userRes = await db.query(
            'SELECT id, username, role, coins, "referralCode", "createdAt" FROM "User" WHERE id = $1',
            [req.user.id]
        );
        res.json(userRes.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching profile' });
    }
};
