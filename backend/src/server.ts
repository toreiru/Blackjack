import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

import authRoutes from './routes/authRoutes';

import { BlackjackTable } from './game/BlackjackTable';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

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
                const updatedUser = await prisma.user.update({
                    where: { id: res.userId },
                    data: { coins: { increment: res.payout } }
                });
                table.players.forEach(p => {
                    if (p.userId === res.userId) p.coins = updatedUser.coins;
                });
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

    // Helper to prevent multiple active sessions
    const kickExistingSession = (userId: number) => {
        for (const t of activeTables.values()) {
            const oldSession = Array.from(t.players.entries()).find(([_, p]) => p.userId === userId);
            if (oldSession) {
                const [oldSocketId] = oldSession;
                io.to(oldSocketId).emit('server_message', { message: 'Sesión iniciada en otro dispositivo. Desconectando...' });
                io.in(oldSocketId).disconnectSockets(true);
                t.removePlayer(oldSocketId);
                broadcastTableState(t.id);
            }
        }
    };

    // Join quick public match
    socket.on('join_quick_match', async (data: { userId: number }) => {
        try {
            const user = await prisma.user.findUnique({ where: { id: data.userId } });
            if (!user) return;

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
            const user = await prisma.user.findUnique({ where: { id: data.userId } });
            if (!user) return;

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
            const user = await prisma.user.findUnique({ where: { id: data.userId } });
            if (!user) return;

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
            const user = await prisma.user.findUnique({ where: { id: player.userId } });
            if (!user || user.coins < data.amount) {
                socket.emit('server_message', { message: 'Saldo insuficiente' });
                return;
            }

            await prisma.user.update({
                where: { id: player.userId },
                data: { coins: { decrement: data.amount } }
            });
            player.coins -= data.amount;

            if (table.placeBet(socket.id, data.amount)) {
                if (table.allBetsPlaced()) {
                    table.dealInitialCards(() => broadcastTableState(table.id));
                }
                broadcastTableState(table.id);
            } else {
                socket.emit('server_message', { message: 'No puedes apostar ahora' });
                await prisma.user.update({
                    where: { id: player.userId },
                    data: { coins: { increment: data.amount } }
                });
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
            table.removePlayer(socket.id);
            socket.leave(table.id);
            socket.emit('server_message', { message: 'Has salido de la mesa.' });
            broadcastTableState(table.id);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
        const table = getTableForSocket(socket.id);
        if (table) {
            table.removePlayer(socket.id);
            broadcastTableState(table.id);
        }
    });
});


const PORT = process.env.PORT || 3001;

server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} across all local networks`);
});
