import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import db, { initializeDatabase } from './db';

dotenv.config();

import authRoutes from './routes/authRoutes';

import { BlackjackTable } from './game/BlackjackTable';

const app = express();
const server = http.createServer(app);
// Keep track of connected users { userId -> socketId }
const activeUsers = new Map<number, Set<string>>();

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// Routes
import adminRoutes from './routes/adminRoutes';
import friendsRoutes from './routes/friendsRoutes';

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);

app.get('/', (req, res) => {
    res.send('Blackjack API is running');
});

// Active tables map
const activeTables = new Map<string, BlackjackTable>();

const broadcastTableState = (tableId: string) => {
    const table = activeTables.get(tableId);
    if (!table) return;
    const tableState = {
        id: table.id,
        state: table.state, // waiting, betting, playing, dealerTurn, gameOver
        dealerHand: table.dealerHand,
        currentPlayerTurnIndex: table.currentPlayerTurnIndex,
        playerTurnOrder: table.playerTurnOrder,
        remainingCards: table.deck.getRemainingCards(),
        players: Object.fromEntries(table.players)
    };
    io.to(tableId).emit('table_update', tableState);
};

const createTable = (id: string) => {
    const table = new BlackjackTable(id);
    table.onRoundEnded = async (results) => {
        for (const res of results) {
            try {
                const updateRes = await db.query(
                    'UPDATE "User" SET coins = coins + $1 WHERE id = $2 RETURNING coins',
                    [res.payout, res.userId]
                );
                if (updateRes.rows.length > 0) {
                    table.players.forEach(p => {
                        if (p.userId === res.userId) p.coins = updateRes.rows[0].coins;
                    });
                }
            } catch (e) { console.error('Error updating payout:', e); }
        }
        broadcastTableState(id);
    };
    activeTables.set(id, table);
    return table;
};

// Create an initial public table
createTable('PUBLIC_1');

const getTableForSocket = (socketId: string) => {
    return Array.from(activeTables.values()).find(t => t.players.has(socketId));
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    let currentUserId: number | null = null;

    // Register user as online globally
    socket.on('authenticate', (data: { userId: number }) => {
        currentUserId = data.userId;
        if (!activeUsers.has(currentUserId)) {
            activeUsers.set(currentUserId, new Set());
        }
        activeUsers.get(currentUserId)!.add(socket.id);
    });

    // Helper to prevent multiple active sessions
    const kickExistingSession = (userId: number) => {
        for (const t of activeTables.values()) {
            const oldSession = Array.from(t.players.entries()).find(([_, p]) => p.userId === userId);
            if (oldSession) {
                const [oldSocketId] = oldSession;
                io.to(oldSocketId).emit('server_message', { message: 'Sesión iniciada en otro dispositivo. Desconectando...' });
                io.in(oldSocketId).disconnectSockets(true);
                t.removePlayer(oldSocketId, () => broadcastTableState(t.id));
                broadcastTableState(t.id);
            }
        }
    };

    // Join quick public match
    socket.on('join_quick_match', async (data: { userId: number }) => {
        try {
            const userRes = await db.query('SELECT * FROM "User" WHERE id = $1', [data.userId]);
            if (userRes.rows.length === 0) return;
            const user = userRes.rows[0];

            kickExistingSession(user.id);

            let targetTable = Array.from(activeTables.values()).find(t => t.id.startsWith('PUBLIC_') && t.players.size < 5 && t.state === 'waiting');
            if (!targetTable) {
                targetTable = createTable(`PUBLIC_${activeTables.size + 1}`);
            }

            if (targetTable.addPlayer(socket.id, user.id, user.username, user.coins)) {
                socket.join(targetTable.id);
                socket.emit('server_message', { message: `Te uniste a la partida rápida ${targetTable.id}` });
                broadcastTableState(targetTable.id);
            }
        } catch (e) { console.error(e) }
    });

    // Create private match
    socket.on('create_private_match', async (data: { userId: number }) => {
        try {
            const userRes = await db.query('SELECT * FROM "User" WHERE id = $1', [data.userId]);
            if (userRes.rows.length === 0) return;
            const user = userRes.rows[0];

            kickExistingSession(user.id);

            const code = Math.random().toString(36).substring(2, 8).toUpperCase();
            const targetTable = createTable(code);

            if (targetTable.addPlayer(socket.id, user.id, user.username, user.coins)) {
                socket.join(targetTable.id);
                socket.emit('private_match_created', { tableId: targetTable.id });
                socket.emit('server_message', { message: `Mesa privada creada: ${targetTable.id}` });
                broadcastTableState(targetTable.id);
            }
        } catch (e) { console.error(e) }
    });

    // Join private match
    socket.on('join_private_match', async (data: { userId: number, tableId: string }) => {
        try {
            const userRes = await db.query('SELECT * FROM "User" WHERE id = $1', [data.userId]);
            if (userRes.rows.length === 0) return;
            const user = userRes.rows[0];

            kickExistingSession(user.id);

            const targetTable = activeTables.get(data.tableId.toUpperCase());
            if (!targetTable) {
                socket.emit('server_message', { message: 'Mesa privada no encontrada' });
                return;
            }

            if (targetTable.addPlayer(socket.id, user.id, user.username, user.coins)) {
                socket.join(targetTable.id);
                socket.emit('server_message', { message: `Te uniste a la mesa privada ${targetTable.id}` });
                broadcastTableState(targetTable.id);
            } else {
                socket.emit('server_message', { message: 'La mesa está llena o ya en juego' });
            }
        } catch (e) { console.error(e) }
    });

    socket.on('start_game', () => {
        const table = getTableForSocket(socket.id);
        if (table && table.state === 'waiting' && table.players.size > 0) {
            table.startBettingPhase();
            io.to(table.id).emit('server_message', { message: '¡Hagan sus apuestas!' });
            broadcastTableState(table.id);
        }
    });

    socket.on('next_round', () => {
        const table = getTableForSocket(socket.id);
        if (table && table.state === 'gameOver') {
            table.resetTable();
            table.startBettingPhase();
            io.to(table.id).emit('server_message', { message: '¡Nueva ronda! Hagan sus apuestas.' });
            broadcastTableState(table.id);
        }
    });

    socket.on('place_bet', async (data: { amount: number }) => {
        const table = getTableForSocket(socket.id);
        if (!table) return;
        const player = table.players.get(socket.id);
        if (!player) return;

        try {
            const userRes = await db.query('SELECT * FROM "User" WHERE id = $1', [player.userId]);
            if (userRes.rows.length === 0 || userRes.rows[0].coins < data.amount) {
                socket.emit('server_message', { message: 'Saldo insuficiente' });
                return;
            }

            await db.query('UPDATE "User" SET coins = coins - $1 WHERE id = $2', [data.amount, player.userId]);
            player.coins -= data.amount;

            if (table.placeBet(socket.id, data.amount)) {
                if (table.allBetsPlaced()) {
                    table.dealInitialCards(() => broadcastTableState(table.id));
                }
                broadcastTableState(table.id);
            } else {
                socket.emit('server_message', { message: 'No puedes apostar ahora' });
                await db.query('UPDATE "User" SET coins = coins + $1 WHERE id = $2', [data.amount, player.userId]);
                player.coins += data.amount;
            }
        } catch (e) { console.error(e); }
    });

    socket.on('hit', () => {
        const table = getTableForSocket(socket.id);
        if (table && table.hit(socket.id, () => broadcastTableState(table.id))) {
            broadcastTableState(table.id);
        }
    });

    socket.on('stand', () => {
        const table = getTableForSocket(socket.id);
        if (table && table.stand(socket.id, () => broadcastTableState(table.id))) {
            broadcastTableState(table.id);
        }
    });

    socket.on('leave_table', () => {
        const table = getTableForSocket(socket.id);
        if (table) {
            table.removePlayer(socket.id, () => broadcastTableState(table.id));
            socket.leave(table.id);
            socket.emit('server_message', { message: 'Has salido de la mesa.' });
            broadcastTableState(table.id);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
        if (currentUserId) {
            const userSockets = activeUsers.get(currentUserId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) activeUsers.delete(currentUserId);
            }
        }

        const table = getTableForSocket(socket.id);
        if (table) {
            table.removePlayer(socket.id, () => broadcastTableState(table.id));
            broadcastTableState(table.id);
        }
    });

    // --- Real-Time Friends Features ---

    socket.on('check_friends_status', (friendIds: number[]) => {
        const statuses = friendIds.map(id => ({
            id,
            isOnline: activeUsers.has(id)
        }));
        socket.emit('friends_status_update', statuses);
    });

    socket.on('send_invite', async (data: { friendId: number, tableCode: string }) => {
        if (!currentUserId) return;
        const friendSockets = activeUsers.get(data.friendId);

        if (friendSockets && friendSockets.size > 0) {
            try {
                const res = await db.query('SELECT username FROM "User" WHERE id = $1', [currentUserId]);
                if (res.rows.length > 0) {
                    const senderName = res.rows[0].username;
                    friendSockets.forEach(sId => {
                        io.to(sId).emit('receive_invite', {
                            senderName,
                            tableCode: data.tableCode
                        });
                    });
                    socket.emit('server_message', { message: 'Invitación enviada al jugador.' });
                }
            } catch (e) {
                console.error(e);
            }
        } else {
            socket.emit('server_message', { message: 'El jugador no está en línea.' });
        }
    });
});


import bcrypt from 'bcrypt';
import crypto from 'crypto';

const PORT = process.env.PORT || 3001;

server.listen(Number(PORT), '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT} across all local networks`);

    // Initialize PostgreSQL Database Tables
    try {
        await initializeDatabase();
    } catch (err) {
        console.error('Failed to initialize database, terminating...', err);
        process.exit(1);
    }

    // Auto-create Admin User if it doesn't exist
    try {
        const username = 'vonToreiru';
        const password = 'Molin@gt27!';

        const existingAdminRes = await db.query('SELECT id, role FROM "User" WHERE username = $1', [username]);

        if (existingAdminRes.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(password, 10);
            const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

            await db.query(`
                INSERT INTO "User" (username, password, role, coins, "referralCode") 
                VALUES ($1, $2, 'ADMIN', 1000000, $3)`,
                [username, hashedPassword, referralCode]
            );
            console.log(`[Auto-Config] Admin user ${username} created successfully.`);
        } else if (existingAdminRes.rows[0].role !== 'ADMIN') {
            // In case it exists but lost admin privileges
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                `UPDATE "User" SET role = 'ADMIN', password = $1 WHERE id = $2`,
                [hashedPassword, existingAdminRes.rows[0].id]
            );
            console.log(`[Auto-Config] User ${username} updated to ADMIN role.`);
        } else {
            console.log(`[Auto-Config] Admin user already exists.`);
        }
    } catch (error) {
        console.error(`[Auto-Config] Error setting up admin user:`, error);
    }
});
