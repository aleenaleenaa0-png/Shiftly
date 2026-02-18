import React, { useState } from 'react';

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
          <p className="text-slate-600 font-medium">Smart Workforce Management</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Sign In</h2>

          {error && (
            <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center space-x-3">
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
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
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
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-sm text-slate-600 text-center">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToSignUp}
                className="text-indigo-600 hover:text-indigo-700 font-bold transition-colors"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

