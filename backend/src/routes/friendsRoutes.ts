import express from 'express';
import db from '../db';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Send friend request
router.post('/request', authenticateToken, async (req: any, res: any) => {
    const { targetUsername } = req.body;
    try {
        const targetUserRes = await db.query('SELECT id FROM "User" WHERE username = $1', [targetUsername]);
        if (targetUserRes.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        const targetUserId = targetUserRes.rows[0].id;

        if (targetUserId === req.user.id) return res.status(400).json({ error: 'No puedes añadirte a ti mismo' });

        // Check if a relationship already exists
        const existingReqRes = await db.query(`
            SELECT status FROM "Friendship" 
            WHERE ("requesterId" = $1 AND "addresseeId" = $2) 
               OR ("requesterId" = $2 AND "addresseeId" = $1)
            LIMIT 1`,
            [req.user.id, targetUserId]
        );

        if (existingReqRes.rows.length > 0) {
            const existingReq = existingReqRes.rows[0];
            if (existingReq.status === 'ACCEPTED') return res.status(400).json({ error: 'Ya son amigos' });
            return res.status(400).json({ error: 'Ya existe una solicitud pendiente o enviada' });
        }

        await db.query(`
            INSERT INTO "Friendship" ("requesterId", "addresseeId", "status") 
            VALUES ($1, $2, 'PENDING')`,
            [req.user.id, targetUserId]
        );
        res.json({ message: 'Solicitud enviada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error enviando solicitud' });
    }
});

// Accept or reject friend request
router.post('/respond', authenticateToken, async (req: any, res: any) => {
    const { friendshipId, action } = req.body; // action: 'ACCEPT' or 'REJECT'
    try {
        const friendshipRes = await db.query('SELECT "addresseeId" FROM "Friendship" WHERE id = $1', [friendshipId]);

        if (friendshipRes.rows.length === 0 || friendshipRes.rows[0].addresseeId !== req.user.id) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }

        if (action === 'ACCEPT') {
            await db.query('UPDATE "Friendship" SET status = $1 WHERE id = $2', ['ACCEPTED', friendshipId]);
            res.json({ message: 'Solicitud aceptada' });
        } else if (action === 'REJECT') {
            await db.query('DELETE FROM "Friendship" WHERE id = $1', [friendshipId]);
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

        const friendsDataRes = await db.query(`
            SELECT f.id, f."requesterId", f."addresseeId", f.status,
                   r.username as requester_username, a.username as addressee_username
            FROM "Friendship" f
            JOIN "User" r ON f."requesterId" = r.id
            JOIN "User" a ON f."addresseeId" = a.id
            WHERE f."requesterId" = $1 OR f."addresseeId" = $1
        `, [userId]);

        const pendingReceivedInfo: any[] = [];
        const pendingSentInfo: any[] = [];
        const acceptedFriends: any[] = [];

        for (const row of friendsDataRes.rows) {
            if (row.status === 'PENDING') {
                if (row.addresseeId === userId) {
                    pendingReceivedInfo.push({
                        friendshipId: row.id,
                        user: { id: row.requesterId, username: row.requester_username }
                    });
                } else if (row.requesterId === userId) {
                    pendingSentInfo.push({
                        friendshipId: row.id,
                        user: { id: row.addresseeId, username: row.addressee_username }
                    });
                }
            } else if (row.status === 'ACCEPTED') {
                const friendId = row.requesterId === userId ? row.addresseeId : row.requesterId;
                const friendUsername = row.requesterId === userId ? row.addressee_username : row.requester_username;
                acceptedFriends.push({
                    friendshipId: row.id,
                    user: { id: friendId, username: friendUsername }
                });
            }
        }

        res.json({
            friends: acceptedFriends,
            pendingReceived: pendingReceivedInfo,
            pendingSent: pendingSentInfo
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error obteniendo lista de amigos' });
    }
});

export default router;
