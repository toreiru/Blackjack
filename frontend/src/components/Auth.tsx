import React, { useState } from 'react';
import { loginReq, registerReq } from '../services/api';

interface AuthProps {
    onLogin: (token: string, user: any) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMsg('');

        try {
            if (isLogin) {
                const res = await loginReq(username, password);
                if (res?.error) return setError(res.error);
                if (!res?.token) return setError('Error desconocido al iniciar sesión');
                onLogin(res.token, res.user);
            } else {
                const res = await registerReq(username, password, referralCode);
                if (res?.error) return setError(res.error);
                setMsg('Cuenta creada exitosamente. ¡Ahora puedes entrar!');
                setIsLogin(true);
            }
        } catch (err: any) {
            console.error('Connection error:', err);
            setError('Error de conexión con el servidor. Verifica que la API esté encendida (o la variable VITE_API_URL).');
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>{isLogin ? 'Entrar a 21Tilt' : 'Crear Cuenta'}</h2>
                {error && <div className="error-msg">{error}</div>}
                {msg && <div className="success-msg">{msg}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Usuario</label>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label>Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    {!isLogin && (
                        <div className="form-group">
                            <label>Código de Referido (Opcional)</label>
                            <input
                                type="text"
                                value={referralCode}
                                onChange={e => setReferralCode(e.target.value)}
                                placeholder="Ej: A1B2C3D4"
                            />
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary auth-submit">
                        {isLogin ? 'Jugar Ahora' : 'Registrarse'}
                    </button>
                </form>

                <p className="auth-toggle">
                    {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
                    <span onClick={() => setIsLogin(!isLogin)}>
                        {isLogin ? "Regístrate aquí" : "Inicia sesión"}
                    </span>
                </p>
            </div>
        </div>
    );
};
