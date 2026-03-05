import React from 'react';

export const CoinIcon = () => (
    <svg
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        fill="none"
        style={{ verticalAlign: 'middle', marginRight: '4px', filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))' }}
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="12" cy="12" r="10" fill="#FFD700" stroke="#DAA520" strokeWidth="2" />
        <circle cx="12" cy="12" r="7" fill="none" stroke="#DAA520" strokeWidth="1" strokeDasharray="2 2" />
        <path d="M10 9h2c1.1 0 2 .9 2 2s-.9 2-2 2h-1v2h-1v-5z" fill="#B8860B" />
        <path d="M12 7v10" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);
