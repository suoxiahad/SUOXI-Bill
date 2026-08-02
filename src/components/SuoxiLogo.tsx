import React from 'react';
import logoImg from '../assets/logo.png';

interface SuoxiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'compact' | 'light' | 'dark';
}

const FALLBACK_URL = '/api/logo';

export const SuoxiLogo: React.FC<SuoxiLogoProps> = ({ className = '', size = 'md' }) => {
  // Height scaling
  const heightMap = {
    sm: 'h-10',
    md: 'h-16',
    lg: 'h-24',
    xl: 'h-32'
  };

  const selectedHeight = heightMap[size] || 'h-20';

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      <img
        src={logoImg || FALLBACK_URL}
        alt="SUO XI Hospital (Acupuncture)"
        className={`${selectedHeight} w-auto object-contain max-w-full`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = FALLBACK_URL;
        }}
      />
    </div>
  );
};

