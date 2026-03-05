import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret'; // In production, never fallback

export const register = async (req: Request, res: Response) => {
    const { username, password, referralCode } = req.body;

    try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken.' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate unique referral code for this new user
        const newReferralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

        // Check if player used a referral code
        let referredById = null;
        if (referralCode) {
            const referrer = await prisma.user.findUnique({ where: { referralCode } });
            if (referrer) {
                referredById = referrer.id;
            }
        }

        // Role is PLAYER by default
        const user = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                referralCode: newReferralCode,
                referredById
            }
        });

        res.status(201).json({ message: 'User created successfully', userId: user.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creating user' });
    }
};

export const login = async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { username } });

        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

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
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, username: true, role: true, coins: true, referralCode: true, createdAt: true }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching profile' });
    }
};
