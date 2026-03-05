import React, { useEffect, useState } from 'react';
import { getFriendsReq, sendFriendReq, respondFriendReq } from '../services/api';

interface FriendsProps {
    token: string;
}

export const Friends: React.FC<FriendsProps> = ({ token }) => {
    const [friends, setFriends] = useState<any[]>([]);
    const [pendingReceived, setPendingReceived] = useState<any[]>([]);
    const [pendingSent, setPendingSent] = useState<any[]>([]);

    const [searchUsername, setSearchUsername] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);

    const loadFriends = async () => {
        const res = await getFriendsReq(token);
        if (!res.error) {
            setFriends(res.friends || []);
            setPendingReceived(res.pendingReceived || []);
            setPendingSent(res.pendingSent || []);
        }
    };

    useEffect(() => {
        loadFriends();
    }, [token]);

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

    return (
        <div style={{ padding: '2rem', background: '#111', borderRadius: '10px', color: '#fff', border: '1px solid var(--retro-blue)', maxWidth: '600px', margin: '2rem auto' }}>
            <h2 style={{ color: 'var(--retro-blue)', marginBottom: '1.5rem', textAlign: 'center' }}>👥 Amigos</h2>

            {message && (
                <div style={{ padding: '1rem', marginBottom: '1rem', background: message.type === 'error' ? 'var(--retro-red)' : 'var(--retro-green)', color: '#fff', textAlign: 'center', borderRadius: '5px' }}>
                    {message.text}
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
                        {friends.map(f => (
                            <li key={f.friendshipId} style={{ padding: '0.8rem', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center' }}>
                                <span style={{ color: 'var(--retro-blue)', marginRight: '1rem' }}>▶</span>
                                <span style={{ fontSize: '1.2rem' }}>{f.user.username}</span>
                            </li>
                        ))}
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
