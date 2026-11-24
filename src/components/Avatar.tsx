import { useState } from 'react';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[11px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const TONES = [
  'bg-[#2B2B2B] text-white',
  'bg-[#006E53] text-white',
  'bg-[#EC6E3C] text-[#2B2B2B]',
  'bg-white text-[#2B2B2B]',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pickTone(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) {
    sum += name.charCodeAt(i);
  }
  return TONES[sum % TONES.length];
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} rounded-lg object-cover border border-[#2B2B2B]/20 shrink-0 bg-white`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${sizeClass} ${pickTone(name)} rounded-lg font-display font-semibold tracking-tight flex items-center justify-center shrink-0 select-none border border-[#2B2B2B]/20`}
    >
      {getInitials(name)}
    </div>
  );
}
