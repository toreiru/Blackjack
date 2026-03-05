import React, { useEffect, useState } from 'react';
import { getUsersReq, changeRoleReq, mintCoinsReq, transferCoinsReq } from '../services/api';
import { CoinIcon } from './CoinIcon';

interface DashboardProps {
    token: string;
    user: any;
    onBack: () => void;
    onUpdateCoins: (newBalance: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ token, user, onBack, onUpdateCoins }) => {
    const [users, setUsers] = useState<any[]>([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [mintAmount, setMintAmount] = useState<number>(0);
    const [transferUsername, setTransferUsername] = useState('');
    const [transferAmount, setTransferAmount] = useState<number>(0);

    const [roleTargetId, setRoleTargetId] = useState<number>(0);
    const [roleNewValue, setRoleNewValue] = useState<string>('PLAYER');
    const [whatsappInput, setWhatsappInput] = useState<string>('');

    const isAdmin = user.role === 'ADMIN';

    const loadUsers = async () => {
        if (!isAdmin) return;
        try {
            const data = await getUsersReq(token);
            if (!data.error) {
                setUsers(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadUsers();
    }, [isAdmin]);

    const handleMint = async () => {
        setError(''); setSuccess('');
        if (mintAmount <= 0) return setError('Monto inválido');
        const res = await mintCoinsReq(token, mintAmount);
        if (res.error) return setError(res.error);
        setSuccess(res.message);
        onUpdateCoins(res.newBalance);
        loadUsers();
    };

    const handleTransfer = async () => {
        setError(''); setSuccess('');
        if (transferAmount <= 0 || !transferUsername) return setError('Datos inválidos');
        const res = await transferCoinsReq(token, transferUsername, transferAmount);
        if (res.error) return setError(res.error);
        setSuccess(res.message);
        onUpdateCoins(user.coins - transferAmount); // roughly update local UI immediately
        loadUsers();
    };

    const handleChangeRole = async () => {
        setError(''); setSuccess('');
        if (roleTargetId === 0) return setError('Selecciona un usuario');

        if (roleNewValue === 'PROMOTER' && !whatsappInput.trim()) {
            return setError('El número de WhatsApp es obligatorio para los Promotores');
        }

        const res = await changeRoleReq(token, roleTargetId, roleNewValue, whatsappInput);
        if (res.error) return setError(res.error);
        setSuccess(res.message);
        loadUsers();
    };

    return (
        <div style={{ padding: '2rem', background: '#111', borderRadius: '10px', color: '#fff', border: '1px solid var(--retro-blue)', maxWidth: '800px', margin: '2rem auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: 'var(--gold)', margin: 0 }}>Panel de Control ({user.role})</h2>
                <button className="btn" onClick={onBack}>Volver a la Mesa</button>
            </div>

            {error && <div style={{ color: 'var(--retro-red)', padding: '0.5rem', background: 'rgba(255,0,0,0.1)', marginBottom: '1rem' }}>{error}</div>}
            {success && <div style={{ color: 'var(--retro-green)', padding: '0.5rem', background: 'rgba(0,255,0,0.1)', marginBottom: '1rem' }}>{success}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr)', gap: '2rem' }}>
                {/* ADMIN ONLY ACTIONS */}
                {isAdmin && (
                    <div style={{ border: '1px solid #333', padding: '1rem', borderRadius: '8px' }}>
                        <h3 style={{ marginTop: 0 }}>Minar / Crear Monedas</h3>
                        <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Crea monedas de la nada hacia tu cuenta</p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            <input type="number" className="input-field" value={mintAmount} onChange={(e) => setMintAmount(parseInt(e.target.value) || 0)} style={{ flex: 1 }} />
                            <button className="btn btn-primary" onClick={handleMint}>Minar</button>
                        </div>

                        <h3>Asignar Rol a Usuario</h3>
                        <select className="input-field" style={{ width: '100%', marginBottom: '0.5rem' }} value={roleTargetId} onChange={(e) => setRoleTargetId(Number(e.target.value))}>
                            <option value={0}>-- Seleccionar Usuario --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                            ))}
                        </select>
                        <select className="input-field" style={{ width: '100%', marginBottom: '0.5rem' }} value={roleNewValue} onChange={(e) => setRoleNewValue(e.target.value)}>
                            <option value="PLAYER">Jugador</option>
                            <option value="PROMOTER">Promotor</option>
                            <option value="ADMIN">Administrador</option>
                        </select>
                        {roleNewValue === 'PROMOTER' && (
                            <input
                                type="text"
                                className="input-field"
                                placeholder="WhatsApp Ej: +123456789"
                                value={whatsappInput}
                                onChange={(e) => setWhatsappInput(e.target.value)}
                                style={{ width: '100%', marginBottom: '0.5rem' }}
                            />
                        )}
                        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleChangeRole}>Cambiar Rol</button>
                    </div>
                )}

                {/* TRANSFER (Promoters and Admins) */}
                <div style={{ border: '1px solid #333', padding: '1rem', borderRadius: '8px' }}>
                    <h3 style={{ marginTop: 0, color: 'var(--retro-blue)' }}>Transferir Monedas</h3>
                    <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Envía monedas desde tu saldo a cualquier usuario</p>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem' }}>Usuario Receptor</label>
                        <input type="text" className="input-field" placeholder="Username" value={transferUsername} onChange={(e) => setTransferUsername(e.target.value)} style={{ width: '100%' }} />
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.2rem' }}>Cantidad</label>
                        <input type="number" className="input-field" value={transferAmount} onChange={(e) => setTransferAmount(parseInt(e.target.value) || 0)} style={{ width: '100%' }} />
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%', background: 'var(--retro-blue)', borderColor: 'var(--retro-blue)' }} onClick={handleTransfer}>
                        Enviar Monedas
                    </button>
                </div>
            </div>

            {isAdmin && (
                <div style={{ marginTop: '2rem' }}>
                    <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Directorio de Usuarios</h3>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', textAlign: 'left', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>ID</th>
                                    <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>Usuario</th>
                                    <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>Rol</th>
                                    <th style={{ padding: '0.5rem', borderBottom: '1px solid #444' }}>Billetera</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #222' }}>{u.id}</td>
                                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #222' }}>{u.username}</td>
                                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #222' }}>{u.role}</td>
                                        <td style={{ padding: '0.5rem', borderBottom: '1px solid #222', color: 'var(--gold)' }}>{u.coins} <CoinIcon /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
