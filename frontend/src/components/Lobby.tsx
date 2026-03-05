import React, { useState } from 'react';

interface LobbyProps {
    onJoinQuickMatch: () => void;
    onCreatePrivateMatch: () => void;
    onJoinPrivateMatch: (code: string) => void;
    referralCode?: string;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoinQuickMatch, onCreatePrivateMatch, onJoinPrivateMatch, referralCode }) => {
    const [joinCode, setJoinCode] = useState('');

    return (
        <div style={{ position: 'relative', padding: '2rem', background: '#111', borderRadius: '10px', color: '#fff', border: '1px solid var(--retro-green)', maxWidth: '500px', margin: '2rem auto', textAlign: 'center' }}>
            {referralCode && (
                <div style={{ position: 'absolute', top: '1rem', left: '1rem', color: 'var(--retro-green)', fontSize: '0.9rem', opacity: 0.8, textAlign: 'left' }}>
                    Ref:<br />
                    <span style={{ userSelect: 'all', cursor: 'copy', fontWeight: 'bold', fontSize: '1.2rem' }} title="Puntúa al invitar a este código">{referralCode}</span>
                </div>
            )}
            <h2 style={{ color: 'var(--gold)', marginBottom: '2rem' }}>Salón Principal</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <button
                    onClick={onJoinQuickMatch}
                    className="btn"
                    style={{ background: 'var(--retro-green)', borderColor: 'var(--retro-green)', fontSize: '1.2rem', padding: '1rem' }}
                >
                    🎲 Partida Rápida
                </button>

                <div style={{ borderTop: '1px dashed #444', borderBottom: '1px dashed #444', padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 style={{ margin: 0, color: 'var(--retro-blue)' }}>Mesas Privadas</h3>

                    <button
                        onClick={onCreatePrivateMatch}
                        className="btn"
                        style={{ background: '#333', borderColor: '#555' }}
                    >
                        ➕ Crear Mesa Privada
                    </button>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Código de mesa"
                            value={joinCode}
                            onChange={e => setJoinCode(e.target.value.toUpperCase())}
                            style={{ flex: 1, textTransform: 'uppercase' }}
                            maxLength={8}
                        />
                        <button
                            onClick={() => onJoinPrivateMatch(joinCode)}
                            className="btn btn-primary"
                        >
                            Unirse
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
