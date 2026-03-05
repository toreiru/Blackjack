import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getFriendsReq, sendFriendReq, respondFriendReq } from '../services/api';

interface FriendsProps {
    token: string;
    socket: Socket | null;
    table: any;
    invites: { senderName: string, tableCode: string }[];
    onJoinPrivateMatch: (code: string) => void;
}

export const Friends: React.FC<FriendsProps> = ({ token, socket, table, invites, onJoinPrivateMatch }) => {
    const [friends, setFriends] = useState<any[]>([]);
    const [pendingReceived, setPendingReceived] = useState<any[]>([]);
    const [pendingSent, setPendingSent] = useState<any[]>([]);
    const [friendsStatus, setFriendsStatus] = useState<Record<number, boolean>>({});

    const [searchUsername, setSearchUsername] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const loadFriends = async () => {
        const res = await getFriendsReq(token);
        if (!res.error) {
            setFriends(res.friends || []);
            setPendingReceived(res.pendingReceived || []);
            setPendingSent(res.pendingSent || []);

            // Ask server for their online status
            if (socket && res.friends && res.friends.length > 0) {
                const friendIds = res.friends.map((f: any) => f.user.id);
                socket.emit('check_friends_status', friendIds);
            }
        }
    };

    useEffect(() => {
        loadFriends();
    }, [token]);

    useEffect(() => {
        if (!socket) return;

        socket.on('friends_status_update', (statuses: { id: number, isOnline: boolean }[]) => {
            const statusMap: Record<number, boolean> = {};
            statuses.forEach(s => statusMap[s.id] = s.isOnline);
            setFriendsStatus(statusMap);
        });

        // Set up an interval to poll status every 10 seconds while this tab is open
        const interval = setInterval(() => {
            if (friends.length > 0) {
                const friendIds = friends.map(f => f.user.id);
                socket.emit('check_friends_status', friendIds);
            }
        }, 10000);

        return () => {
            socket.off('friends_status_update');
            clearInterval(interval);
        };
    }, [socket, friends]);

    const handleSendRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        if (!searchUsername.trim()) return;

        const res = await sendFriendReq(token, searchUsername.trim());
        if (res.error) {
            setMessage({ text: res.error, type: 'error' });
        } else {
            setMessage({ text: res.message, type: 'success' });
            setSearchUsername('');
            loadFriends();
        }
    };

    const handleRespond = async (friendshipId: number, action: 'ACCEPT' | 'REJECT') => {
        setMessage(null);
        const res = await respondFriendReq(token, friendshipId, action);
        if (res.error) {
            setMessage({ text: res.error, type: 'error' });
        } else {
            setMessage({ text: res.message, type: 'success' });
            loadFriends();
        }
    };

    const handleInvite = (friendId: number) => {
        if (socket && table && !table.id.startsWith('PUBLIC_')) {
            socket.emit('send_invite', { friendId, tableCode: table.id });
        }
    };

    return (
        <div style={{ padding: '2rem', background: '#111', borderRadius: '10px', color: '#fff', border: '1px solid var(--retro-blue)', maxWidth: '600px', margin: '2rem auto' }}>
            <h2 style={{ color: 'var(--retro-blue)', marginBottom: '1.5rem', textAlign: 'center' }}>👥 Amigos</h2>

            {message && (
                <div style={{ padding: '1rem', marginBottom: '1rem', background: message.type === 'error' ? 'var(--retro-red)' : 'var(--retro-green)', color: '#fff', textAlign: 'center', borderRadius: '5px' }}>
                    {message.text}
                </div>
            )}

            {/* Received Invites Section */}
            {invites.length > 0 && (
                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#002200', borderRadius: '8px', border: '2px solid var(--retro-green)' }}>
                    <h3 style={{ color: 'var(--retro-green)', marginTop: 0, animation: 'blink 2s infinite' }}>! Invitaciones de Juego !</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {invites.map((invite, idx) => (
                            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #004400' }}>
                                <span><span style={{ color: 'var(--retro-green)' }}>{invite.senderName}</span> te invita a la mesa <span style={{ color: 'var(--gold)' }}>{invite.tableCode}</span></span>
                                <button className="btn" style={{ background: 'var(--gold)', color: '#000', padding: '5px 10px', fontSize: '0.7rem' }} onClick={() => onJoinPrivateMatch(invite.tableCode)}>Unirse</button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                <h3 style={{ color: 'var(--white)', marginTop: 0 }}>Añadir Amigo</h3>
                <form onSubmit={handleSendRequest} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                        type="text"
                        value={searchUsername}
                        onChange={(e) => setSearchUsername(e.target.value)}
                        placeholder="Nombre de usuario"
                        className="input-field"
                        style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn-primary">Enviar Solicitud</button>
                </form>
            </div>

            {pendingReceived.length > 0 && (
                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#2B2B11', borderRadius: '8px', border: '1px solid var(--gold)' }}>
                    <h3 style={{ color: 'var(--gold)', marginTop: 0 }}>Solicitudes Pendientes</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {pendingReceived.map(req => (
                            <li key={req.friendshipId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #444' }}>
                                <span>{req.user.username}</span>
                                <div>
                                    <button onClick={() => handleRespond(req.friendshipId, 'ACCEPT')} className="btn" style={{ background: 'var(--retro-green)', borderColor: 'var(--retro-green)', padding: '0.3rem 0.6rem', fontSize: '0.8rem', marginRight: '0.5rem' }}>Aceptar</button>
                                    <button onClick={() => handleRespond(req.friendshipId, 'REJECT')} className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Rechazar</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ padding: '1.5rem', background: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                <h3 style={{ color: 'var(--white)', marginTop: 0 }}>Lista de Amigos ({friends.length})</h3>
                {friends.length === 0 ? (
                    <p style={{ color: '#aaa', fontStyle: 'italic', textAlign: 'center' }}>Aún no tienes amigos añadidos.</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {friends.map(f => {
                            const isOnline = friendsStatus[f.user.id];
                            return (
                                <li key={f.friendshipId} style={{ padding: '0.8rem', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div style={{
                                            width: '12px',
                                            height: '12px',
                                            borderRadius: '50%',
                                            background: isOnline ? 'var(--retro-green)' : 'var(--retro-red)',
                                            marginRight: '1rem',
                                            boxShadow: isOnline ? '0 0 8px var(--retro-green)' : 'none'
                                        }}></div>
                                        <span style={{ fontSize: '1.2rem', color: isOnline ? '#fff' : '#aaa' }}>{f.user.username}</span>
                                    </div>

                                    {isOnline && table && !table.id.startsWith('PUBLIC_') && (
                                        <button
                                            onClick={() => handleInvite(f.user.id)}
                                            className="btn"
                                            style={{ background: 'var(--retro-blue)', borderColor: 'var(--retro-blue)', padding: '5px 10px', fontSize: '0.6rem' }}
                                        >
                                            Invitar
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {pendingSent.length > 0 && (
                <div style={{ marginTop: '2rem', color: '#aaa', fontSize: '0.9rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>Solicitudes enviadas ({pendingSent.length}):</h4>
                    {pendingSent.map(req => req.user.username).join(', ')}
                </div>
            )}
        </div>
    );
};
