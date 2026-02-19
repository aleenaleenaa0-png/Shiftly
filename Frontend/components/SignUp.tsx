import React, { useState, useEffect } from 'react';
import Logo from './Logo';

interface SignUpProps {
  onSignUpSuccess: () => void;
  onSwitchToLogin: () => void;
}

interface Store {
  storeId: number;
  name: string;
  location?: string;
  hourlySalesTarget?: number;
  hourlyLaborBudget?: number;
}

const SignUp: React.FC<SignUpProps> = ({ onSignUpSuccess, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    storeId: 0
  });
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStores, setLoadingStores] = useState(true);

  // Fetch stores for dropdown
  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoadingStores(true);
        const res = await fetch('/api/stores', {
          credentials: 'include'
        });
        
        // Read response text first to handle both JSON and non-JSON responses
        const responseText = await res.text();
        let data: any = [];
        
        // Try to parse as JSON
        if (responseText && responseText.trim().length > 0) {
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.error('Failed to parse JSON:', parseError);
            console.error('Response text:', responseText);
            // If it's not JSON, treat as empty array
            data = [];
          }
        }
        
        if (!res.ok) {
          if (res.status === 503) {
            // Database locked
            if (typeof data === 'object' && data.message) {
              setError(data.message);
            } else {
              setError('Database is locked. Please close Microsoft Access if it\'s open.');
            }
            return;
          } else if (res.status === 500) {
            // Server error - but we got a response, so try to use it
            if (Array.isArray(data)) {
              // If it's an array, use it (empty array is fine)
              // Continue processing below
            } else {
              setError('Server error occurred. Please try again or click "Seed Stores" to create stores.');
              return;
            }
          } else {
            setError(`Failed to load stores (HTTP ${res.status}). Please try again.`);
            return;
          }
        }
        console.log('Fetched stores response:', data);
        console.log('Is array?', Array.isArray(data));
        console.log('Data length:', Array.isArray(data) ? data.length : 'N/A');
        
        if (Array.isArray(data)) {
          if (data.length > 0) {
            // Map backend response (capitalized) to frontend format
            const mappedStores = data.map((s: any) => {
              const store = {
                storeId: s.StoreId || s.storeId || 0,
                name: s.Name || s.name || 'Unknown Store',
                location: s.Location || s.location,
                hourlySalesTarget: s.HourlySalesTarget || s.hourlySalesTarget,
                hourlyLaborBudget: s.HourlyLaborBudget || s.hourlyLaborBudget
              };
              console.log('Mapped store:', store);
              return store;
            });
            
            console.log('Setting stores:', mappedStores);
            setStores(mappedStores);
            if (mappedStores.length > 0 && mappedStores[0].storeId > 0) {
              setFormData(prev => ({ ...prev, storeId: mappedStores[0].storeId }));
            }
            setError(null);
          } else {
            // Empty array - show helpful message
            setError('No stores available. Please click "Seed Stores" button below to create stores.');
            console.warn('Stores array is empty');
            setStores([]); // Set empty array so UI doesn't break
          }
        } else {
          // Not an array - treat as empty
          setError('No stores available. Please click "Seed Stores" button below to create stores.');
          console.warn('Response is not an array:', data);
          setStores([]);
        }
      } catch (err: any) {
        console.error('Error fetching stores:', err);
        console.error('Error details:', {
          message: err.message,
          stack: err.stack,
          name: err.name
        });
        // On network error, show helpful message
        setError('Failed to connect to backend. Please ensure the backend server is running on http://localhost:5224');
        setStores([]); // Set empty array to prevent UI errors
      } finally {
        setLoadingStores(false);
      }
    };

    fetchStores();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'storeId' ? parseInt(value) || 0 : value
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Trim all string fields
    const trimmedData = {
      email: formData.email.trim(),
      password: formData.password.trim(),
      confirmPassword: formData.confirmPassword.trim(),
      fullName: formData.fullName.trim(),
      storeId: formData.storeId
    };

    // Validation
    if (!trimmedData.fullName) {
      setError('Full name is required');
      return;
    }

    if (!trimmedData.email) {
      setError('Email is required');
      return;
    }

    if (!trimmedData.password) {
      setError('Password is required');
      return;
    }

    if (trimmedData.password !== trimmedData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (trimmedData.password.length < 3) {
      setError('Password must be at least 3 characters');
      return;
    }

    if (trimmedData.storeId === 0 || !trimmedData.storeId) {
      setError('Please select a store');
      return;
    }

    // Prepare request payload
    const payload = {
      email: trimmedData.email,
      password: trimmedData.password,
      fullName: trimmedData.fullName,
      storeId: Number(trimmedData.storeId) // Ensure it's a number
    };

    // Log what we're sending for debugging
    console.log('Sign up payload:', payload);
    console.log('Store ID type:', typeof payload.storeId, 'Value:', payload.storeId);

    setLoading(true);

    try {
      const response = await fetch('/api/account/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(data.message || 'Database is locked');
        }
        if (response.status === 409) {
          throw new Error(data.error || 'Email already registered');
        }
        if (response.status === 400) {
          throw new Error(data.error || 'Invalid input. Please check your information.');
        }
        // Show the actual error message from backend
        const errorMsg = data.message || data.error || `Sign up failed (HTTP ${response.status})`;
        console.error('Sign up error details:', data);
        throw new Error(errorMsg);
      }

      if (data.success) {
        alert('Account created successfully! Please login with your credentials.');
        onSignUpSuccess();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.');
      console.error('Sign up error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Stunning animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-rose-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-400/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        {/* Floating particles */}
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full blur-sm"
            style={{
              backgroundColor: i % 3 === 0 ? 'rgba(244, 63, 94, 0.3)' : i % 3 === 1 ? 'rgba(168, 85, 247, 0.3)' : 'rgba(34, 211, 238, 0.3)',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${5 + Math.random() * 5}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`
            }}
          />
        ))}
      </div>
      
      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          50% { transform: translate(${Math.random() * 50 - 25}px, ${Math.random() * 50 - 25}px) scale(1.5); opacity: 0.6; }
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
          <p className="text-slate-700 font-semibold text-xl">Create Your Account</p>
        </div>

        {/* Sign Up Form with glassmorphism */}
        <div className="relative bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-rose-500/20 border border-white/50 p-8 transform hover:scale-[1.01] transition-all duration-500">
          {/* Shimmer effect */}
          <div className="absolute inset-0 rounded-3xl shimmer opacity-20"></div>
          
          {/* Inner glow */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-rose-100/30 via-purple-100/30 to-cyan-100/30 opacity-60"></div>
          
          <div className="relative z-10">
            <h2 className="text-4xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-8">
              Sign Up
            </h2>

          {error && (
            <div className="mb-6 bg-red-50 backdrop-blur-sm border-2 border-red-200 rounded-xl p-4 flex items-center space-x-3 shadow-lg">
              <i className="fas fa-exclamation-circle text-red-500"></i>
              <span className="text-red-700 font-medium text-sm">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all hover:border-rose-300 hover:bg-white text-slate-800 placeholder-slate-400"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Email Address *
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
                Store *
              </label>
              {loadingStores ? (
                <div className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl bg-slate-50 flex items-center">
                  <i className="fas fa-spinner fa-spin text-slate-400 mr-2"></i>
                  <span className="text-slate-500">Loading stores...</span>
                </div>
              ) : stores.length === 0 ? (
                <div className="w-full px-4 py-3 border-2 border-yellow-300 rounded-xl bg-yellow-50">
                  <p className="text-sm text-yellow-700 mb-3">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    No stores available. Click below to seed stores.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setLoadingStores(true);
                        const res = await fetch('/api/stores/seed', {
                          method: 'POST',
                          credentials: 'include'
                        });
                        const data = await res.json();
                        if (res.ok) {
                          alert('Stores seeded successfully! Refreshing...');
                          // Refresh stores
                          const storesRes = await fetch('/api/stores', { credentials: 'include' });
                          if (storesRes.ok) {
                            const storesData = await storesRes.json();
                            const mappedStores = storesData.map((s: any) => ({
                              storeId: s.StoreId || s.storeId,
                              name: s.Name || s.name,
                              location: s.Location || s.location
                            }));
                            setStores(mappedStores);
                            if (mappedStores.length > 0) {
                              setFormData(prev => ({ ...prev, storeId: mappedStores[0].storeId }));
                            }
                          }
                        } else {
                          alert(`Error: ${data.message || data.error || 'Failed to seed stores'}`);
                        }
                      } catch (err: any) {
                        alert(`Error: ${err.message}`);
                      } finally {
                        setLoadingStores(false);
                      }
                    }}
                    className="w-full bg-gradient-to-r from-rose-500 to-purple-500 hover:from-rose-400 hover:to-purple-400 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all shadow-md shadow-rose-500/30"
                  >
                    <i className="fas fa-seedling mr-2"></i>
                    Seed Stores
                  </button>
                </div>
              ) : (
                <select
                  name="storeId"
                  value={formData.storeId}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all hover:border-rose-300 hover:bg-white text-slate-800 placeholder-slate-400"
                >
                  <option value="0">Select a store...</option>
                  {stores.map(store => (
                    <option key={store.storeId} value={store.storeId}>
                      {store.name} {store.location ? `- ${store.location}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                minLength={3}
                className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all hover:border-rose-300 hover:bg-white text-slate-800 placeholder-slate-400"
                placeholder="At least 3 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-all hover:border-rose-300 hover:bg-white text-slate-800 placeholder-slate-400"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || loadingStores}
              className="w-full bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 hover:from-rose-400 hover:via-purple-400 hover:to-cyan-400 text-white px-6 py-4 rounded-xl font-black shadow-xl shadow-rose-500/40 hover:shadow-rose-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transform hover:scale-105 active:scale-95 relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
              <span className="relative z-10">
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-user-plus"></i>
                  <span>Create Account</span>
                </>
              )}
              </span>
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-rose-600 hover:text-rose-500 font-bold transition-colors underline decoration-2 underline-offset-2"
              >
                Sign In
              </button>
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;

