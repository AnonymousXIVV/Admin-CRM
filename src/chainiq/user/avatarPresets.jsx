import React, { useState } from 'react';

export const AVATAR_PRESETS = [
  {
    id: 'preset:moon',
    bg: '#1e3a8a',
    label: 'Moon',
    icon: (
      <path fillRule="evenodd" fill="white" d="M50,26 A24,24,0,1,0,50,74 A24,24,0,1,0,50,26 Z M58,32 A18,18,0,1,0,58,68 A18,18,0,1,0,58,32 Z"/>
    ),
  },
  {
    id: 'preset:star',
    bg: '#7c3aed',
    label: 'Star',
    icon: <polygon fill="white" points="50,26 56,42 73,43 61,55 65,72 50,62 35,72 39,55 27,43 44,42"/>,
  },
  {
    id: 'preset:lightning',
    bg: '#c2410c',
    label: 'Lightning',
    icon: <polygon fill="white" points="57,20 41,52 54,52 43,80 64,46 51,46"/>,
  },
  {
    id: 'preset:wave',
    bg: '#0f766e',
    label: 'Wave',
    icon: (
      <g fill="white">
        <path d="M15,40 Q28,27,40,40 Q52,53,65,40 Q78,27,85,40 L85,52 Q78,39,65,52 Q52,65,40,52 Q28,39,15,52 Z"/>
        <path d="M15,60 Q28,47,40,60 Q52,73,65,60 Q78,47,85,60 L85,70 Q78,57,65,70 Q52,83,40,70 Q28,57,15,70 Z"/>
      </g>
    ),
  },
  {
    id: 'preset:shield',
    bg: '#b91c1c',
    label: 'Shield',
    icon: <path fill="white" d="M50,18 L76,30 L76,55 C76,68,50,82,50,82 C50,82,24,68,24,55 L24,30 Z"/>,
  },
  {
    id: 'preset:leaf',
    bg: '#15803d',
    label: 'Leaf',
    icon: (
      <g fill="white">
        <path d="M50,20 C72,20,80,50,50,80 C20,50,28,20,50,20 Z"/>
        <rect x="48" y="72" width="4" height="10" rx="2"/>
      </g>
    ),
  },
  {
    id: 'preset:heart',
    bg: '#be185d',
    label: 'Heart',
    icon: <path fill="white" d="M50,72 C50,72,20,52,20,34 A17,17,0,0,1,50,28 A17,17,0,0,1,80,34 C80,52,50,72,50,72 Z"/>,
  },
  {
    id: 'preset:crown',
    bg: '#b45309',
    label: 'Crown',
    icon: <polygon fill="white" points="18,68 18,42 32,58 50,20 68,58 82,42 82,68"/>,
  },
  {
    id: 'preset:ring',
    bg: '#3730a3',
    label: 'Ring',
    icon: <circle cx="50" cy="50" r="24" fill="none" stroke="white" strokeWidth="9"/>,
  },
  {
    id: 'preset:paw',
    bg: '#4d7c0f',
    label: 'Paw',
    icon: (
      <g fill="white">
        <ellipse cx="50" cy="62" rx="15" ry="12"/>
        <circle cx="30" cy="42" r="8"/>
        <circle cx="42" cy="33" r="7"/>
        <circle cx="58" cy="33" r="7"/>
        <circle cx="70" cy="42" r="8"/>
      </g>
    ),
  },
  {
    id: 'preset:rocket',
    bg: '#0e7490',
    label: 'Rocket',
    icon: (
      <g fill="white">
        <path d="M50,18 C63,18,72,32,72,52 L72,68 L28,68 L28,52 C28,32,37,18,50,18 Z"/>
        <path d="M28,58 L14,72 L28,72 Z"/>
        <path d="M72,58 L86,72 L72,72 Z"/>
        <path d="M38,68 L42,80 L50,74 L58,80 L62,68 Z"/>
      </g>
    ),
  },
  {
    id: 'preset:flower',
    bg: '#9d174d',
    label: 'Flower',
    icon: (
      <g fill="white">
        <ellipse cx="50" cy="32" rx="8" ry="14"/>
        <ellipse cx="50" cy="32" rx="8" ry="14" transform="rotate(72 50 50)"/>
        <ellipse cx="50" cy="32" rx="8" ry="14" transform="rotate(144 50 50)"/>
        <ellipse cx="50" cy="32" rx="8" ry="14" transform="rotate(216 50 50)"/>
        <ellipse cx="50" cy="32" rx="8" ry="14" transform="rotate(288 50 50)"/>
        <circle cx="50" cy="50" r="10"/>
      </g>
    ),
  },
  {
    id: 'preset:flame',
    bg: '#92400e',
    label: 'Flame',
    icon: <path fill="white" d="M50,22 C58,34,66,46,60,58 C68,44,60,30,54,40 C60,52,56,64,50,76 C44,64,40,52,46,40 C40,30,32,44,40,58 C34,46,42,34,50,22 Z"/>,
  },
  {
    id: 'preset:tree',
    bg: '#14532d',
    label: 'Tree',
    icon: (
      <g fill="white">
        <polygon points="50,18 76,62 24,62"/>
        <rect x="44" y="62" width="12" height="18" rx="2"/>
      </g>
    ),
  },
  {
    id: 'preset:cloud',
    bg: '#0369a1',
    label: 'Cloud',
    icon: (
      <g fill="white">
        <circle cx="36" cy="56" r="14"/>
        <circle cx="52" cy="46" r="18"/>
        <circle cx="66" cy="56" r="14"/>
        <rect x="22" y="56" width="56" height="16"/>
      </g>
    ),
  },
  {
    id: 'preset:diamond',
    bg: '#6d28d9',
    label: 'Diamond',
    icon: <polygon fill="white" points="50,18 78,50 50,82 22,50"/>,
  },
];

export const isPresetAvatar = (url) =>
  typeof url === 'string' && url.startsWith('preset:');

export const AvatarSvg = ({ presetId, size = 40 }) => {
  const preset = AVATAR_PRESETS.find(p => p.id === presetId);
  if (!preset) return null;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }}
      aria-label={preset.label}
    >
      <circle cx="50" cy="50" r="50" fill={preset.bg}/>
      {preset.icon}
    </svg>
  );
};

export const AvatarDisplay = ({ avatarUrl, name, size = 40, className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (isPresetAvatar(avatarUrl)) {
    return <AvatarSvg presetId={avatarUrl} size={size}/>;
  }

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name || ''}
        onError={() => setImgFailed(true)}
        className={className}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }}
      />
    );
  }

  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#374151',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
};
