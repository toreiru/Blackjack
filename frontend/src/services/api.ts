// Use VITE_API_URL from environment for production, fallback to dynamic hostname for local sync
export const BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;
export const API_URL = `${BASE_URL}/api`;

export const loginReq = async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    return res.json();
};

export const registerReq = async (username: string, password: string, referralCode?: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, referralCode })
    });
    return res.json();
};

export const getProfileReq = async (token: string) => {
    const res = await fetch(`${API_URL}/auth/profile`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return res.json();
};

export const getUsersReq = async (token: string) => {
    const res = await fetch(`${API_URL}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};

export const changeRoleReq = async (token: string, targetUserId: number, newRole: string, whatsapp?: string) => {
    const res = await fetch(`${API_URL}/admin/change-role`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId, newRole, whatsapp })
    });
    return res.json();
};

export const getPromotersReq = async (token: string) => {
    const res = await fetch(`${API_URL}/admin/promoters`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};

export const mintCoinsReq = async (token: string, amount: number) => {
    const res = await fetch(`${API_URL}/admin/mint`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
    });
    return res.json();
};

export const transferCoinsReq = async (token: string, receiverUsername: string, amount: number) => {
    const res = await fetch(`${API_URL}/admin/transfer`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ receiverUsername, amount })
    });
    return res.json();
};

export const getFriendsReq = async (token: string) => {
    const res = await fetch(`${API_URL}/friends/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
};

export const sendFriendReq = async (token: string, targetUsername: string) => {
    const res = await fetch(`${API_URL}/friends/request`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUsername })
    });
    return res.json();
};

export const respondFriendReq = async (token: string, friendshipId: number, action: 'ACCEPT' | 'REJECT') => {
    const res = await fetch(`${API_URL}/friends/respond`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendshipId, action })
    });
    return res.json();
};
