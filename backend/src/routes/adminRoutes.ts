import express from 'express';
import db from '../db';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Middleware inside the route to check for Admin/Promoter role
const requireDbRole = (roles: string[]) => {
    return async (req: any, res: any, next: any) => {
        try {
            const userRes = await db.query('SELECT * FROM "User" WHERE id = $1', [req.user.id]);
            if (userRes.rows.length === 0 || !roles.includes(userRes.rows[0].role)) {
                return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes.' });
            }
            req.dbUser = userRes.rows[0]; // Attach full user object
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
        const usersRes = await db.query('SELECT id, username, role, coins, whatsapp, "createdAt" FROM "User"');
        res.json(usersRes.rows);
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

        let queryStr = 'UPDATE "User" SET role = $1';
        let params: any[] = [newRole];

        if (whatsapp) {
            queryStr += ', whatsapp = $2';
            params.push(whatsapp);
        }

        queryStr += ` WHERE id = $${params.length + 1} RETURNING username`;
        params.push(targetUserId);

        const updateRes = await db.query(queryStr, params);

        if (updateRes.rows.length > 0) {
            res.json({ message: `Rol actualizado a ${newRole} para ${updateRes.rows[0].username}` });
        } else {
            res.status(404).json({ error: 'Usuario no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error cambiando rol' });
    }
});

// 3. Mint/Generate Coins (Admin only)
router.post('/mint', authenticateToken, requireDbRole(['ADMIN']), async (req: any, res: any) => {
    const { amount } = req.body;
    try {
        if (amount <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const adminUpdate = await client.query(
                'UPDATE "User" SET coins = coins + $1 WHERE id = $2 RETURNING coins',
                [amount, req.dbUser.id]
            );

            await client.query(
                'INSERT INTO "Transaction" (amount, type, "receiverId") VALUES ($1, $2, $3)',
                [amount, 'BONUS', req.dbUser.id]
            );

            await client.query('COMMIT');
            res.json({ message: `¡Se minaron ${amount} monedas exitosamente!`, newBalance: adminUpdate.rows[0].coins });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
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
        const promotersRes = await db.query('SELECT id, username, whatsapp FROM "User" WHERE role = $1 AND whatsapp IS NOT NULL', ['PROMOTER']);
        res.json(promotersRes.rows);
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

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const receiverRes = await client.query('SELECT id, username, "referredById" FROM "User" WHERE username = $1', [receiverUsername]);

            if (receiverRes.rows.length === 0) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(404).json({ error: 'Usuario receptor no encontrado' });
            }

            const receiver = receiverRes.rows[0];

            // Update balances
            await client.query('UPDATE "User" SET coins = coins - $1 WHERE id = $2', [amount, sender.id]);
            await client.query('UPDATE "User" SET coins = coins + $1 WHERE id = $2', [amount, receiver.id]);

            // Create transfer transaction
            await client.query(
                'INSERT INTO "Transaction" (amount, type, "senderId", "receiverId") VALUES ($1, $2, $3, $4)',
                [amount, 'TRANSFER', sender.id, receiver.id]
            );

            // Process 20% Referral Commission Bonus
            let bonusAmount = 0;
            let referredByUsername = null;
            if (receiver.referredById) {
                bonusAmount = amount * 0.20;

                const bonusReceiverRes = await client.query(
                    'UPDATE "User" SET coins = coins + $1 WHERE id = $2 RETURNING username',
                    [bonusAmount, receiver.referredById]
                );

                if (bonusReceiverRes.rows.length > 0) {
                    referredByUsername = bonusReceiverRes.rows[0].username;
                    await client.query(
                        'INSERT INTO "Transaction" (amount, type, "receiverId") VALUES ($1, $2, $3)',
                        [bonusAmount, 'BONUS', receiver.referredById]
                    );
                }
            }

            await client.query('COMMIT');

            let msg = `Transferencia de ${amount} monedas a ${receiver.username} exitosa.`;
            if (bonusAmount > 0 && referredByUsername) {
                msg += ` El usuario ${referredByUsername} recibió ${bonusAmount} monedas de bono por referido.`;
            }

            res.json({ message: msg });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: 'Error en la transferencia' });
    }
});

export default router;
