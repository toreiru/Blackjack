import React from 'react';

export const VolumeIcon = ({ isMuted }: { isMuted: boolean }) => (
    <svg
        width="1.2em"
        height="1.2em"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ verticalAlign: 'middle' }}
    >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        {!isMuted && (
            <>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </>
        )}
        {isMuted && (
            <line x1="23" y1="1" x2="1" y2="23"></line>
        )}
    </svg>
);
