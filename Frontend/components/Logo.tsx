import React from 'react';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ size = 'medium', showText = true, className = '' }) => {
  const sizeClasses = {
    small: 'w-10 h-10',
    medium: 'w-16 h-16',
    large: 'w-32 h-32'
  };

  const textSizes = {
    small: 'text-xl',
    medium: 'text-3xl',
    large: 'text-7xl'
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className="relative group">
        {/* Animated glow rings - soft warm colors */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-rose-300 via-purple-300 to-cyan-300 opacity-60 blur-xl animate-pulse group-hover:opacity-80 transition-opacity duration-300"></div>
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-300 via-rose-300 to-cyan-300 opacity-40 blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        
        {/* Main logo container with 3D effect */}
        <div className={`${sizeClasses[size]} relative transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
          <svg
            viewBox="0 0 140 140"
            className="w-full h-full drop-shadow-2xl"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Animated gradient - soft warm colors */}
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fb7185">
                  <animate attributeName="stop-color" values="#fb7185;#c084fc;#fb7185" dur="4s" repeatCount="indefinite" />
                </stop>
                <stop offset="50%" stopColor="#c084fc">
                  <animate attributeName="stop-color" values="#c084fc;#67e8f9;#c084fc" dur="4s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#67e8f9">
                  <animate attributeName="stop-color" values="#67e8f9;#fb7185;#67e8f9" dur="4s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
              
              {/* Radial gradient for depth */}
              <radialGradient id="radialGradient" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
              </radialGradient>
              
              {/* Clock gradient */}
              <linearGradient id="clockGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#fef3e7" />
              </linearGradient>
              
              {/* Shadow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {/* Outer glow ring */}
            <circle cx="70" cy="70" r="65" fill="url(#logoGradient)" opacity="0.2" className="animate-pulse" />
            
            {/* Main circle with 3D effect */}
            <circle cx="70" cy="70" r="58" fill="url(#logoGradient)" filter="url(#glow)" />
            <circle cx="70" cy="70" r="58" fill="url(#radialGradient)" />
            
            {/* Calendar base with shadow */}
            <rect x="30" y="35" width="80" height="55" rx="5" fill="white" opacity="0.98" />
            <rect x="30" y="35" width="80" height="20" rx="5" fill="url(#logoGradient)" opacity="0.9" />
            
            {/* Calendar grid lines */}
            <line x1="52" y1="55" x2="52" y2="90" stroke="#f3e8ff" strokeWidth="2" />
            <line x1="70" y1="55" x2="70" y2="90" stroke="#f3e8ff" strokeWidth="2" />
            <line x1="88" y1="55" x2="88" y2="90" stroke="#f3e8ff" strokeWidth="2" />
            <line x1="35" y1="65" x2="105" y2="65" stroke="#f3e8ff" strokeWidth="2" />
            <line x1="35" y1="75" x2="105" y2="75" stroke="#f3e8ff" strokeWidth="2" />
            
            {/* Animated clock overlay */}
            <g transform="translate(95, 85)">
              <circle r="22" fill="url(#clockGradient)" stroke="#fb7185" strokeWidth="3" filter="url(#glow)" />
              <circle r="2.5" fill="#fb7185" />
              
              {/* Animated clock hands */}
              <g transform="rotate(0 0 0)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="0 0 0;360 0 0"
                  dur="20s"
                  repeatCount="indefinite"
                />
                <line x1="0" y1="0" x2="0" y2="-14" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" />
              </g>
              <g transform="rotate(45 0 0)">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="45 0 0;405 0 0"
                  dur="15s"
                  repeatCount="indefinite"
                />
                <line x1="0" y1="0" x2="12" y2="0" stroke="#c084fc" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
            
            {/* Animated decorative elements */}
            <circle cx="42" cy="58" r="2.5" fill="#fb7185" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="61" cy="68" r="2.5" fill="#c084fc" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="0.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="79" cy="78" r="2.5" fill="#67e8f9" opacity="0.8">
              <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" begin="1s" repeatCount="indefinite" />
            </circle>
            
            {/* Sparkle effects */}
            <circle cx="35" cy="45" r="1.5" fill="#ffffff" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx="105" cy="50" r="1.5" fill="#ffffff" opacity="0.9">
              <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.5s" begin="0.7s" repeatCount="indefinite" />
            </circle>
          </svg>
          
          {/* Additional 3D shadow effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-rose-400/30 to-purple-400/30 blur-2xl -z-10 transform group-hover:scale-125 transition-transform duration-500"></div>
        </div>
      </div>
      
      {showText && (
        <div className="flex flex-col">
          <h1 className={`${textSizes[size]} font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent tracking-tight relative group-hover:scale-105 transition-transform duration-300`}>
            <span className="relative z-10">Shiftly</span>
            {/* Text glow effect */}
            <span className="absolute inset-0 bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></span>
          </h1>
          {size !== 'small' && (
            <span className="text-[12px] font-bold text-slate-600 uppercase tracking-[0.2em] mt-1">
              Smart Scheduling
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default Logo;
