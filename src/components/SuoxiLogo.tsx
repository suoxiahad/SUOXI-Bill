import React, { useState } from 'react';
import logoImg from '../assets/logo.png';

interface SuoxiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'compact' | 'light' | 'dark';
}

const ONLINE_URL = 'https://suoxigroup.com/wp-content/uploads/2026/08/AI-Logo.png';
const FALLBACK_URL = '/api/logo';

export const SuoxiLogo: React.FC<SuoxiLogoProps> = ({ className = '', size = 'md' }) => {
  const [source, setSource] = useState(logoImg || ONLINE_URL);
  const [fallbackStage, setFallbackStage] = useState(0);
  const [hasError, setHasError] = useState(false);

  const heightMap = {
    sm: 'h-10',
    md: 'h-16',
    lg: 'h-24',
    xl: 'h-32'
  };

  const selectedHeight = heightMap[size] || 'h-20';

  if (hasError) {
    return (
      <div className={`inline-flex items-center justify-center font-bold text-emerald-800 tracking-wide select-none ${className}`}>
        <span className="text-xl font-serif">SUO XI HOSPITAL</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      <img
        src={source}
        alt="SUO XI Hospital (Acupuncture)"
        className={`${selectedHeight} w-auto object-contain max-w-full`}
        onError={() => {
          if (fallbackStage === 0) {
            setFallbackStage(1);
            setSource(ONLINE_URL);
          } else if (fallbackStage === 1) {
            setFallbackStage(2);
            setSource(FALLBACK_URL);
          } else {
            setHasError(true);
          }
        }}
      />
    </div>
  );
};

