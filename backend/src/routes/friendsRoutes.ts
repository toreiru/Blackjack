import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Send friend request
router.post('/request', authenticateToken, async (req: any, res: any) => {
    const { targetUsername } = req.body;
    try {
        const targetUser = await prisma.user.findUnique({ where: { username: targetUsername } });
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (targetUser.id === req.user.id) return res.status(400).json({ error: 'No puedes añadirte a ti mismo' });

        // Check if a relationship already exists
        const existingReq = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId: req.user.id, addresseeId: targetUser.id },
                    { requesterId: targetUser.id, addresseeId: req.user.id }
                ]
            }
        });

        if (existingReq) {
            if (existingReq.status === 'ACCEPTED') return res.status(400).json({ error: 'Ya son amigos' });
            return res.status(400).json({ error: 'Ya existe una solicitud pendiente o enviada' });
        }

        await prisma.friendship.create({
            data: {
                requesterId: req.user.id,
                addresseeId: targetUser.id,
                status: 'PENDING'
            }
        });
        res.json({ message: 'Solicitud enviada' });
    } catch (error) {
        res.status(500).json({ error: 'Error enviando solicitud' });
    }
});

// Accept or reject friend request
router.post('/respond', authenticateToken, async (req: any, res: any) => {
    const { friendshipId, action } = req.body; // action: 'ACCEPT' or 'REJECT'
    try {
        const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });

        if (!friendship || friendship.addresseeId !== req.user.id) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }

        if (action === 'ACCEPT') {
            await prisma.friendship.update({
                where: { id: friendshipId },
                data: { status: 'ACCEPTED' }
            });
            res.json({ message: 'Solicitud aceptada' });
        } else if (action === 'REJECT') {
            await prisma.friendship.delete({
                where: { id: friendshipId }
            });
            res.json({ message: 'Solicitud rechazada' });
        } else {
            res.status(400).json({ error: 'Acción inválida' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error respondiendo solicitud' });
    }
});

// List friends and pending requests
router.get('/list', authenticateToken, async (req: any, res: any) => {
    try {
        const userId = req.user.id;

        const friendsData = await prisma.friendship.findMany({
            where: {
                OR: [
                    { requesterId: userId },
                    { addresseeId: userId }
                ]
            },
            include: {
                requester: { select: { id: true, username: true } },
                addressee: { select: { id: true, username: true } }
            }
        });

        const pendingReceivedInfo = friendsData
            .filter((f: any) => f.addresseeId === userId && f.status === 'PENDING')
            .map((f: any) => ({ friendshipId: f.id, user: f.requester }));

        const pendingSentInfo = friendsData
            .filter((f: any) => f.requesterId === userId && f.status === 'PENDING')
            .map((f: any) => ({ friendshipId: f.id, user: f.addressee }));

        const acceptedFriends = friendsData
            .filter((f: any) => f.status === 'ACCEPTED')
            .map((f: any) => {
                const friend = f.requesterId === userId ? f.addressee : f.requester;
                return { friendshipId: f.id, user: friend };
            });

        res.json({
            friends: acceptedFriends,
            pendingReceived: pendingReceivedInfo,
            pendingSent: pendingSentInfo
        });
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo lista de amigos' });
    }
});

export default router;
