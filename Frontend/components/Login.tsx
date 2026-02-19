import React, { useState } from 'react';
import Logo from './Logo';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
  onSwitchToSignUp: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onSwitchToSignUp }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/account/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important for cookies
        body: JSON.stringify(formData),
      });

      // Read response text once (can only read response body once)
      let responseText = '';
      try {
        responseText = await response.text();
      } catch (readError) {
        console.error('Failed to read response:', readError);
        throw new Error('Failed to read server response. Please check if the backend is running.');
      }
      
      let data: any = {};
      
      // Try to parse as JSON if there's content
      if (responseText && responseText.trim().length > 0) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse JSON:', parseError);
          console.error('Response text:', responseText);
          console.error('Response status:', response.status);
          console.error('Response headers:', Object.fromEntries(response.headers.entries()));
          
          // If it's not JSON but we got a response, show the text
          if (responseText.trim().length > 0) {
            throw new Error(`Server error: ${responseText.substring(0, 200)}`);
          } else {
            throw new Error('Server returned empty response');
          }
        }
      } else {
        // Empty response - try to provide helpful error
        console.error('Empty response from server');
        console.error('Response status:', response.status);
        console.error('Response URL:', response.url);
        
        if (response.status === 500) {
          throw new Error('Server error (500). Please check the backend console for details.');
        } else if (response.status === 503) {
          throw new Error('Database is locked. Please close Microsoft Access if it\'s open.');
        } else {
          throw new Error(`Server returned empty response (Status: ${response.status}). Please check if the backend is running.`);
        }
      }

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(data.message || 'Database is locked');
        }
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      if (data.success && data.user) {
        onLoginSuccess(data.user);
      } else {
        throw new Error(data.error || data.message || 'Invalid response from server');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Live animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated gradient orbs that move */}
        <div 
          className="absolute w-96 h-96 bg-rose-400/25 rounded-full blur-3xl"
          style={{
            top: '10%',
            left: '10%',
            animation: 'moveOrb1 20s ease-in-out infinite'
          }}
        ></div>
        <div 
          className="absolute w-96 h-96 bg-purple-400/25 rounded-full blur-3xl"
          style={{
            bottom: '10%',
            right: '10%',
            animation: 'moveOrb2 25s ease-in-out infinite'
          }}
        ></div>
        <div 
          className="absolute w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'moveOrb3 30s ease-in-out infinite'
          }}
        ></div>
        
        {/* Floating particles with complex movement */}
        {[...Array(25)].map((_, i) => {
          const randomX = Math.random() * 200 - 100;
          const randomY = Math.random() * 200 - 100;
          const duration = 8 + Math.random() * 12;
          return (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${Math.random() * 6 + 3}px`,
                height: `${Math.random() * 6 + 3}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: i % 3 === 0 ? 'rgba(251, 113, 133, 0.5)' : i % 3 === 1 ? 'rgba(168, 85, 247, 0.5)' : 'rgba(34, 211, 238, 0.5)',
                animation: `floatParticle ${duration}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 5}s`,
                filter: 'blur(1px)',
                boxShadow: `0 0 ${Math.random() * 10 + 5}px currentColor`
              }}
            />
          );
        })}
      </div>
      
      <style>{`
        @keyframes moveOrb1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(150px, -100px) scale(1.3); }
          50% { transform: translate(-100px, 150px) scale(0.9); }
          75% { transform: translate(100px, 100px) scale(1.2); }
        }
        @keyframes moveOrb2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-150px, -150px) scale(1.2); }
          66% { transform: translate(100px, -100px) scale(0.8); }
        }
        @keyframes moveOrb3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
          50% { transform: translate(-50%, -50%) scale(1.4) rotate(180deg); }
        }
        @keyframes floatParticle {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.4;
          }
          25% {
            transform: translate(${Math.random() * 80 - 40}px, ${Math.random() * 80 - 40}px) scale(1.8);
            opacity: 0.8;
          }
          50% {
            transform: translate(${Math.random() * 100 - 50}px, ${Math.random() * 100 - 50}px) scale(0.6);
            opacity: 0.3;
          }
          75% {
            transform: translate(${Math.random() * 60 - 30}px, ${Math.random() * 60 - 30}px) scale(1.4);
            opacity: 0.6;
          }
        }
      `}</style>
      
      <div className="max-w-md w-full relative z-10">
        {/* Logo with prominent Shiftly name */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <Logo size="large" showText={false} />
          </div>
          <h1 className="text-7xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-3 drop-shadow-lg animate-pulse">
            Shiftly
          </h1>
          <p className="text-slate-700 font-semibold text-xl">Smart Workforce Management</p>
        </div>

        {/* Login Form with soft glassmorphism */}
        <div className="relative bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-rose-500/20 border border-white/50 p-8 transform hover:scale-[1.01] transition-all duration-500">
          {/* Shimmer effect */}
          <div className="absolute inset-0 rounded-3xl shimmer opacity-20"></div>
          
          {/* Inner glow */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-rose-100/30 via-purple-100/30 to-cyan-100/30 opacity-60"></div>
          
          <div className="relative z-10">
            <h2 className="text-4xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-8">
              Sign In to <span className="text-5xl">Shiftly</span>
            </h2>

          {error && (
            <div className="mb-6 bg-red-50 backdrop-blur-sm border-2 border-red-200 rounded-xl p-4 flex items-center space-x-3 shadow-lg">
              <i className="fas fa-exclamation-circle text-red-500"></i>
              <span className="text-red-700 font-medium text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all hover:border-rose-300 hover:bg-white text-slate-800 placeholder-slate-400"
                placeholder="manager@store.com"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all hover:border-rose-300 hover:bg-white text-slate-800 placeholder-slate-400"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 hover:from-rose-400 hover:via-purple-400 hover:to-cyan-400 text-white px-6 py-4 rounded-xl font-black shadow-2xl shadow-rose-500/40 hover:shadow-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transform hover:scale-105 active:scale-95 relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
              <span className="relative z-10">
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-sign-in-alt"></i>
                  <span>Sign In</span>
                </>
              )}
              </span>
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToSignUp}
                className="text-rose-600 hover:text-rose-500 font-bold transition-colors underline decoration-2 underline-offset-2"
              >
                Sign Up
              </button>
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

