import React, { useState, useEffect } from 'react';

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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4 rounded-2xl shadow-2xl shadow-purple-200/50">
                <div className="flex items-center justify-center">
                  <i className="fas fa-calendar-check text-white text-3xl"></i>
                  <i className="fas fa-clock text-white text-sm absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1.5 shadow-lg"></i>
                </div>
              </div>
              <div className="absolute -inset-2 bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 rounded-2xl blur opacity-30 animate-pulse"></div>
            </div>
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Shiftly
          </h1>
          <p className="text-slate-600 font-medium">Create Your Account</p>
        </div>

        {/* Sign Up Form */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Sign Up</h2>

          {error && (
            <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center space-x-3">
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
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all"
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
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || loadingStores}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
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
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-indigo-600 hover:text-indigo-700 font-bold transition-colors"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;

