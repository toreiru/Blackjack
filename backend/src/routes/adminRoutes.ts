import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Middleware inside the route to check for Admin/Promoter role
const requireDbRole = (roles: string[]) => {
    return async (req: any, res: any, next: any) => {
        try {
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user || !roles.includes(user.role)) {
                return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
            }
            req.dbUser = user; // Attach full user object
            next();
        } catch (error) {
            res.status(500).json({ error: 'Error verificando permisos' });
        }
    };
};

// ==========================================
// ADMIN ENDPOINTS
// ==========================================

// 1. Get all users (Search)
router.get('/users', authenticateToken, requireDbRole(['ADMIN']), async (req: any, res: any) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, username: true, role: true, coins: true, whatsapp: true, createdAt: true }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

// 2. Change User Role (Admin -> Promoters)
router.post('/change-role', authenticateToken, requireDbRole(['ADMIN']), async (req: any, res: any) => {
    const { targetUserId, newRole, whatsapp } = req.body;
    try {
        if (!['ADMIN', 'PROMOTER', 'PLAYER'].includes(newRole)) {
            return res.status(400).json({ error: 'Rol inválido' });
        }

        if (newRole === 'PROMOTER' && !whatsapp) {
            return res.status(400).json({ error: 'Se requiere número de WhatsApp para asignar rol de Promotor' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: targetUserId },
            data: {
                role: newRole,
                ...(whatsapp ? { whatsapp } : {})
            }
        });
        res.json({ message: `Rol actualizado a ${newRole} para ${updatedUser.username}` });
    } catch (error) {
        res.status(500).json({ error: 'Error cambiando rol' });
    }
});

// 3. Mint/Generate Coins (Admin only)
router.post('/mint', authenticateToken, requireDbRole(['ADMIN']), async (req: any, res: any) => {
    const { amount } = req.body;
    try {
        if (amount <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

        const updatedAdmin = await prisma.user.update({
            where: { id: req.dbUser.id },
            data: { coins: { increment: amount } }
        });

        await prisma.transaction.create({
            data: {
                amount,
                type: 'BONUS',
                receiverId: req.dbUser.id
            }
        });

        res.json({ message: `¡Se minaron ${amount} monedas exitosamente!`, newBalance: updatedAdmin.coins });
    } catch (error) {
        res.status(500).json({ error: 'Error minando monedas' });
    }
});


// ==========================================
// COMMON TRANSFER ENDPOINT (ADMIN & PROMOTERS)
// ==========================================

// Get active promoters for players to contact
router.get('/promoters', authenticateToken, async (req: any, res: any) => {
    try {
        const promoters = await prisma.user.findMany({
            where: { role: 'PROMOTER', whatsapp: { not: null } },
            select: { id: true, username: true, whatsapp: true }
        });
        res.json(promoters);
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo promotores' });
    }
});

// Transfer coins to another user
router.post('/transfer', authenticateToken, requireDbRole(['ADMIN', 'PROMOTER']), async (req: any, res: any) => {
    const { receiverUsername, amount } = req.body;
    try {
        if (amount <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

        const sender = req.dbUser;

        if (sender.coins < amount) {
            return res.status(400).json({ error: 'Saldo insuficiente' });
        }

        const receiver = await prisma.user.findUnique({
            where: { username: receiverUsername },
            include: { referredBy: true }
        });

        if (!receiver) {
            return res.status(404).json({ error: 'Usuario receptor no encontrado' });
        }

        const transactionOperations: any[] = [
            prisma.user.update({
                where: { id: sender.id },
                data: { coins: { decrement: amount } }
            }),
            prisma.user.update({
                where: { id: receiver.id },
                data: { coins: { increment: amount } }
            }),
            prisma.transaction.create({
                data: {
                    amount,
                    type: 'TRANSFER',
                    senderId: sender.id,
                    receiverId: receiver.id
                }
            })
        ];

        // Process 20% Referral Commission Bonus injected by the system (not deducted from sender/receiver)
        let bonusAmount = 0;
        if (receiver.referredBy) {
            bonusAmount = amount * 0.20;
            transactionOperations.push(
                prisma.user.update({
                    where: { id: receiver.referredBy.id },
                    data: { coins: { increment: bonusAmount } }
                })
            );
            transactionOperations.push(
                prisma.transaction.create({
                    data: {
                        amount: bonusAmount,
                        type: 'BONUS',
                        receiverId: receiver.referredBy.id
                    }
                })
            );
        }

        // Execute all database updates atomically
        await prisma.$transaction(transactionOperations);

        let msg = `Transferencia de ${amount} monedas a ${receiver.username} exitosa.`;
        if (bonusAmount > 0) {
            msg += ` El usuario ${receiver.referredBy!.username} recibió ${bonusAmount} monedas de bono por referido.`;
        }

        res.json({ message: msg });
    } catch (error) {
        res.status(500).json({ error: 'Error en la transferencia' });
    }
});

export default router;
