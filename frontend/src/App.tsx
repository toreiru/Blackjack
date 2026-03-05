import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Friends } from './components/Friends';
import { Lobby } from './components/Lobby';
import { CoinIcon } from './components/CoinIcon';
import { VolumeIcon } from './components/VolumeIcon';
import { getProfileReq, getPromotersReq } from './services/api';

const stateMap: Record<string, string> = {
    'waiting': 'ESPERANDO',
    'betting': 'APOSTANDO',
    'playing': 'JUGANDO',
    'dealerTurn': 'TURNO DE LA CASA',
    'gameOver': 'FIN DE RONDA'
};

const statusMap: Record<string, string> = {
    'playing': 'JUGANDO',
    'stood': 'SE PLANTÓ',
    'busted': 'VOLÓ',
    'blackjack': 'BLACKJACK',
    'won': 'GANÓ',
    'lost': 'PERDIÓ',
    'push': 'EMPATE'
};

function App() {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [user, setUser] = useState<any>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [messages, setMessages] = useState<string[]>([]);
    const [table, setTable] = useState<any>(null);
    const [currentView, setCurrentView] = useState<'lobby' | 'table' | 'dashboard' | 'recharge' | 'friends'>('lobby');
    const [isMuted, setIsMuted] = useState(true);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [promoters, setPromoters] = useState<any[]>([]);

    // Authenticate user on load if token exists
    useEffect(() => {
        if (token) {
            getProfileReq(token).then(res => {
                if (res.error) {
                    handleLogout();
                } else {
                    setUser(res);
                }
            });
        }
    }, [token]);

    // Connect socket only when logged in
    useEffect(() => {
        let currentSocket: Socket | null = null;
        if (user?.id) {
            import('./services/api').then(({ BASE_URL }) => {
                const newSocket = io(BASE_URL);
                currentSocket = newSocket;
                setSocket(newSocket);

                newSocket.on('connect', () => {
                    setMessages(prev => [...prev.slice(-4), 'Conectado al servidor']);
                });

                newSocket.on('server_message', (data) => {
                    setMessages(prev => [...prev.slice(-4), data.message]);
                });

                newSocket.on('table_update', (newTableState) => {
                    setTable(newTableState);
                    setCurrentView(prev => prev === 'lobby' ? 'table' : prev);
                    const socketId = newSocket.id;
                    if (typeof socketId === 'string' && newTableState.players[socketId]) {
                        setUser((prev: any) => prev ? { ...prev, coins: newTableState.players[socketId].coins } : prev);
                    }
                });
            });

            return () => {
                if (currentSocket) currentSocket.disconnect();
            };
        }
    }, [user?.id]);

    // Load Promoters when opening recharge view
    useEffect(() => {
        if (currentView === 'recharge' && token) {
            getPromotersReq(token).then(res => {
                if (!res.error) setPromoters(res);
            });
        }
    }, [currentView, token]);

    const handleLogin = (jwtToken: string, userData: any) => {
        localStorage.setItem('token', jwtToken);
        setToken(jwtToken);
        setUser(userData);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
        if (socket) socket.disconnect();
    };

    const toggleMute = () => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted;
            if (isMuted) {
                audioRef.current.play().catch(e => console.log('Autoplay blocked:', e));
            }
            setIsMuted(!isMuted);
        }
    };

    const placeBet = () => socket?.emit('place_bet', { amount: betAmount });
    const hit = () => socket?.emit('hit');
    const stand = () => socket?.emit('stand');
    const startGame = () => {
        socket?.emit('start_game');
    }

    const handleJoinQuickMatch = () => socket?.emit('join_quick_match', { userId: user.id });
    const handleCreatePrivateMatch = () => socket?.emit('create_private_match', { userId: user.id });
    const handleJoinPrivateMatch = (code: string) => {
        if (code.trim()) {
            socket?.emit('join_private_match', { userId: user.id, tableId: code.trim() });
        }
    };
    const handleLeaveTable = () => {
        socket?.emit('leave_table');
        setTable(null);
        setCurrentView('lobby');
    };

    const [betAmount, setBetAmount] = useState<number>(1);

    if (!token || !user) {
        return <Auth onLogin={handleLogin} />
    }

    const renderCard = (c: any, index: number, isNew: boolean) => {
        if (c.isHidden) {
            return <div key={index} className={`card hidden-card ${isNew ? 'dealt-card' : ''}`} style={{ borderRight: '6px solid #111', borderBottom: '6px solid #222' }}></div>;
        }
        const color = (c.suit === 'hearts' || c.suit === 'diamonds') ? 'var(--retro-red)' : 'var(--white)';
        return (
            <div key={index} className={`card ${isNew ? 'dealt-card' : ''}`} style={{ color, borderColor: color }}>
                {c.rank}
                <div style={{ fontSize: '0.6rem', marginTop: '5px' }}>{c.suit.charAt(0).toUpperCase()}</div>
            </div>
        );
    };

    // Find current user player state
    let me = null;
    let isMyTurn = false;
    let otherPlayers: any[] = [];

    if (table && socket?.id) {
        me = table.players[socket.id];
        isMyTurn = table.state === 'playing' && table.playerTurnOrder[table.currentPlayerTurnIndex] === socket.id;

        // Extract other players to array for rendering
        otherPlayers = Object.entries(table.players)
            .filter(([id, _]) => id !== socket.id)
            .map(([_, player]) => player);
    }

    return (
        <div className="casino-container">
            <header className="header">
                <h1>21Tilt</h1>
                <div className="user-info">
                    <span className="welcome">Hola, {user.username}</span>
                    <div className="balance">
                        <span><CoinIcon /> {user.coins} Monedas</span>
                    </div>
                    <button onClick={() => setCurrentView(currentView === 'friends' ? 'table' : 'friends')} className="btn" style={{ background: '#444' }}>
                        {currentView === 'friends' ? 'Volver a Mesa' : 'Amigos'}
                    </button>
                    <button onClick={() => setCurrentView(currentView === 'recharge' ? 'table' : 'recharge')} className="btn" style={{ background: 'var(--retro-green)', borderColor: 'var(--retro-green)' }}>
                        {currentView === 'recharge' ? 'Volver a Mesa' : 'Recargas / Retiros'}
                    </button>
                    {(user.role === 'ADMIN' || user.role === 'PROMOTER') && (
                        <button onClick={() => setCurrentView(currentView === 'dashboard' ? 'table' : 'dashboard')} className="btn" style={{ background: '#333' }}>
                            {currentView === 'dashboard' ? 'Volver a Mesa' : 'Panel de Control'}
                        </button>
                    )}
                    <button onClick={toggleMute} className="btn" style={{ padding: '0.4rem 0.8rem', background: '#222', borderColor: '#444' }} title="Música de Fondo">
                        <VolumeIcon isMuted={isMuted} />
                    </button>
                    {currentView === 'table' && table ? (
                        <button onClick={handleLeaveTable} className="btn" style={{ background: 'var(--retro-red)', color: 'white', borderColor: 'var(--retro-red)' }}>Volver al Lobby</button>
                    ) : (
                        <button onClick={handleLogout} className="btn-logout">Salir</button>
                    )}
                </div>
            </header>

            <audio ref={audioRef} src="/casino-music.mp3" loop autoPlay muted={isMuted} />

            {currentView === 'recharge' ? (
                <div style={{ padding: '2rem', background: '#111', borderRadius: '10px', color: '#fff', border: '1px solid var(--retro-green)', maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
                    <h2 style={{ color: 'var(--gold)', marginBottom: '1.5rem' }}>Banca 21Tilt</h2>

                    <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                        <h3 style={{ color: 'var(--retro-green)', marginTop: 0 }}>Comprar Monedas</h3>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Precio: 1 USD / <CoinIcon /></p>
                        <p style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '1rem' }}>Selecciona uno de nuestros cajeros oficiales para procesar tu recarga.</p>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                            {promoters.length > 0 ? (
                                promoters.map(p => (
                                    <a
                                        key={p.id}
                                        href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-primary"
                                        style={{ background: '#25D366', borderColor: '#25D366' }}
                                    >
                                        💬 Cajero {p.username}
                                    </a>
                                ))
                            ) : (
                                <p style={{ color: 'var(--retro-red)' }}>No hay cajeros disponibles en este momento.</p>
                            )}
                        </div>
                    </div>

                    <div style={{ padding: '1.5rem', background: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                        <h3 style={{ color: 'var(--retro-blue)', marginTop: 0 }}>Retirar Monedas (Vender)</h3>
                        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Precio: 0.80 USD / <CoinIcon /></p>
                        <p style={{ fontSize: '0.9rem', color: 'var(--retro-red)' }}>⚠️ Mínimo de retiro: 20 Monedas</p>
                        <button className="btn" style={{ marginTop: '1rem' }}>Solicitar Retiro</button>
                    </div>
                </div>
            ) : currentView === 'friends' ? (
                <Friends token={token} />
            ) : currentView === 'lobby' ? (
                <Lobby
                    onJoinQuickMatch={handleJoinQuickMatch}
                    onCreatePrivateMatch={handleCreatePrivateMatch}
                    onJoinPrivateMatch={handleJoinPrivateMatch}
                    referralCode={user.referralCode}
                />
            ) : currentView === 'dashboard' ? (
                <Dashboard
                    token={token}
                    user={user}
                    onBack={() => setCurrentView('table')}
                    onUpdateCoins={(newBalance) => setUser({ ...user, coins: newBalance })}
                />
            ) : (
                <main className="table" style={{ position: 'relative' }}>
                    {table ? (
                        <>
                            {/* Dealer Area + Shoe */}
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: '2rem' }}>
                                {/* Shoe */}
                                <div className="shoe-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div className="card hidden-card" style={{ width: '40px', height: '60px', borderRight: '6px solid #111', borderBottom: '6px solid #222' }}></div>
                                    <span style={{ fontSize: '0.6rem', marginTop: '10px', color: 'var(--retro-green)' }}>
                                        {table.remainingCards} cartas
                                    </span>
                                </div>

                                <div className="dealer-area">
                                    <h2>Casa / Crupier
                                        {table.state === 'gameOver' && ` [${table.dealerHand.status === 'busted' ? '¡Voló!' : table.dealerHand.cards.reduce((acc: number, c: any) => acc + (c.isHidden ? 0 : c.value), 0)}]`}
                                    </h2>
                                    <div className="cards-container">
                                        {table.dealerHand.cards.length > 0 ? (
                                            table.dealerHand.cards.map((c: any, i: number) => renderCard(c, i, true))
                                        ) : (
                                            <div className="cards-placeholder">Esperando cartas...</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Middle Info */}
                            <div style={{ textAlign: 'center', margin: '1rem 0', padding: '1rem', background: 'rgba(0,0,0,0.5)', borderRadius: '10px' }}>
                                <h3 style={{ margin: 0, color: table.state === 'gameOver' ? 'var(--retro-red)' : 'var(--gold)' }}>
                                    {table.state === 'gameOver' ? 'FIN DE LA RONDA' : `Estado: ${stateMap[table.state] || table.state.toUpperCase()}`}
                                </h3>
                            </div>

                            {/* Other Players Area */}
                            {otherPlayers.length > 0 && (
                                <div className="other-players-area">
                                    {otherPlayers.map((p, idx) => (
                                        <div key={idx} className={`other-player-seat ${table.playerTurnOrder && table.playerTurnOrder[table.currentPlayerTurnIndex] === p.userId ? 'active-turn' : ''}`}>
                                            <div className="seat-name">
                                                {p.username}
                                                {p.hand.betSize > 0 && <span className="seat-bet"> <CoinIcon /> {p.hand.betSize}</span>}
                                            </div>

                                            {/* Status overlay for other players at end of game */}
                                            {table.state === 'gameOver' && p.hand.status && (
                                                <div className="seat-status" style={{ color: p.hand.status === 'won' ? 'var(--retro-green)' : p.hand.status === 'blackjack' ? 'var(--gold)' : p.hand.status === 'push' ? 'var(--retro-blue)' : 'var(--retro-red)' }}>
                                                    {statusMap[p.hand.status] || p.hand.status.toUpperCase()}
                                                </div>
                                            )}

                                            <div className="cards-container mini-cards">
                                                {p.hand.cards.length > 0 ? (
                                                    p.hand.cards.map((c: any, i: number) => {
                                                        // In real blackjack, other players' cards are visible.
                                                        // However, if the user requested only the 1st card to be visible (like a dealer hole card style for opponents):
                                                        const isHidden = table.state !== 'gameOver' && i > 0;
                                                        return renderCard(isHidden ? { ...c, isHidden: true } : c, i, false);
                                                    })
                                                ) : (
                                                    <div className="cards-placeholder" style={{ padding: '0.5rem', fontSize: '0.6rem' }}>Esperando</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Player Area */}
                            <div className="player-area">
                                {me ? (
                                    <>
                                        <h2>Tus Cartas {me.hand.status && `[${statusMap[me.hand.status] || me.hand.status.toUpperCase()}]`}</h2>

                                        {table.state === 'gameOver' && me.hand.status === 'won' && (
                                            <div style={{ animation: 'glitch 1s infinite alternate', color: 'var(--retro-green)', fontSize: '1.5rem', marginBottom: '1rem', textShadow: '0 0 10px var(--retro-green)' }}>
                                                ¡GANASTE! +{me.hand.betSize * 2} <CoinIcon />
                                            </div>
                                        )}
                                        {table.state === 'gameOver' && me.hand.status === 'blackjack' && (
                                            <div style={{ animation: 'glitch 1s infinite alternate', color: 'var(--gold)', fontSize: '1.5rem', marginBottom: '1rem', textShadow: '0 0 10px var(--gold)' }}>
                                                ¡BLACKJACK! +{me.hand.betSize * 2.5} <CoinIcon />
                                            </div>
                                        )}
                                        {table.state === 'gameOver' && me.hand.status === 'lost' && (
                                            <div style={{ color: 'var(--retro-red)', fontSize: '1.2rem', marginBottom: '1rem' }}>
                                                Has perdido esta mano.
                                            </div>
                                        )}
                                        {table.state === 'gameOver' && me.hand.status === 'push' && (
                                            <div style={{ color: 'var(--retro-blue)', fontSize: '1.2rem', marginBottom: '1rem' }}>
                                                Empate. Apuesta devuelta.
                                            </div>
                                        )}

                                        <div className="cards-container">
                                            {me.hand.cards.length > 0 ? (
                                                me.hand.cards.map((c: any, i: number) => renderCard(c, i, true))
                                            ) : (
                                                <div className="cards-placeholder">No hay cartas</div>
                                            )}
                                        </div>

                                        <div className="controls">
                                            {table.state === 'waiting' && <button className="btn btn-primary" onClick={startGame}>Unirse a Ronda</button>}
                                            {table.state === 'betting' && !me.hand.betSize && (
                                                <div className="bet-controls-wrapper">
                                                    <div className="bet-row">
                                                        <button className="btn-chip red" onClick={() => setBetAmount(Math.max(1, betAmount - 5))}>-5</button>
                                                        <input
                                                            type="number"
                                                            value={betAmount}
                                                            onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
                                                            className="input-bet"
                                                            min="1"
                                                        />
                                                        <button className="btn-chip" onClick={() => setBetAmount(betAmount + 5)}>+5</button>
                                                        <button className="btn-chip" onClick={() => setBetAmount(betAmount + 25)}>+25</button>
                                                    </div>
                                                    <button className="btn btn-primary" style={{ width: '100%', fontSize: '1rem', padding: '1rem' }} onClick={placeBet}>APOSTAR <CoinIcon /> {betAmount}</button>
                                                </div>
                                            )}
                                            {table.state === 'playing' && isMyTurn && (
                                                <>
                                                    <button className="btn btn-secondary" onClick={hit}>Pedir</button>
                                                    <button className="btn btn-danger" onClick={stand}>Plantarse</button>
                                                </>
                                            )}
                                            {table.state === 'gameOver' && (
                                                <button className="btn btn-primary" onClick={() => socket?.emit('next_round')}>Próxima Mano</button>
                                            )}
                                        </div>
                                        <div style={{ marginTop: '2rem' }}>
                                            <button className="btn-logout" onClick={handleLeaveTable}>Volver al Lobby</button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="controls" style={{ flexDirection: 'column', marginTop: '3rem' }}>
                                        <div style={{ color: 'var(--retro-blue)', marginBottom: '1rem', textAlign: 'center' }}>
                                            Estás visualizando la mesa.<br />
                                            Los asientos pueden estar llenos o no has entrado aún.
                                        </div>
                                        <button className="btn-logout" onClick={handleLeaveTable} style={{ marginTop: '1rem' }}>Volver al Lobby</button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="cards-placeholder" style={{ margin: 'auto' }}>CONECTANDO A LA MESA...</div>
                    )}
                </main>
            )}

            <div className="server-logs">
                <h3>Consola:</h3>
                <ul>
                    {messages.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
            </div>
        </div>
    );
}

export default App;
