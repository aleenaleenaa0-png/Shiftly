import React, { useState } from 'react';
import Logo from './Logo';

interface SignUpProps {
  onSignUpSuccess: () => void;
  onSwitchToLogin: () => void;
}

const SignUp: React.FC<SignUpProps> = ({ onSignUpSuccess, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = {
      email: formData.email.trim(),
      password: formData.password.trim(),
      confirmPassword: formData.confirmPassword.trim(),
      username: formData.username.trim(),
    };

    if (!trimmed.username) { setError('Username is required'); return; }
    if (!trimmed.email) { setError('Email is required'); return; }
    if (!trimmed.password) { setError('Password is required'); return; }
    if (trimmed.password !== trimmed.confirmPassword) { setError('Passwords do not match'); return; }
    if (trimmed.password.length < 3) { setError('Password must be at least 3 characters'); return; }

    setLoading(true);
    try {
      const response = await fetch('/api/account/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: trimmed.email,
          password: trimmed.password,
          username: trimmed.username,
        }),
      });

      let responseText = '';
      try {
        responseText = await response.text();
      } catch {
        throw new Error('Failed to read server response. Please check if the backend is running.');
      }

      let data: any = {};
      if (responseText?.trim()) {
        try {
          data = JSON.parse(responseText);
        } catch {
          if (!response.ok) throw new Error(`Server error: ${responseText.substring(0, 200)}`);
          data = { success: true };
        }
      } else if (response.ok) {
        data = { success: true };
      } else if (response.status === 503) {
        throw new Error('Database is locked. Please close Microsoft Access if it\'s open.');
      } else {
        throw new Error(`Server returned empty response (Status: ${response.status})`);
      }

      if (!response.ok) {
        if (response.status === 503) throw new Error(data.message || 'Database is locked');
        if (response.status === 409) throw new Error(data.error || 'Email already registered');
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      if (data.success) {
        alert('Account created successfully! Please login with your credentials.');
        onSignUpSuccess();
      } else {
        throw new Error(data.error || 'Invalid response from server');
      }
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <Logo size="large" showText={false} />
          </div>
          <h1 className="text-7xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-3 drop-shadow-lg animate-pulse">
            Shiftly
          </h1>
          <p className="text-slate-700 font-semibold text-xl">Create Your Account</p>
        </div>

        <div className="relative bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-rose-500/20 border border-white/50 p-8">
          <div className="relative z-10">
            <h2 className="text-4xl font-black bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent mb-8">
              Sign Up
            </h2>

            {error && (
              <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center space-x-3">
                <i className="fas fa-exclamation-circle text-red-500"></i>
                <span className="text-red-700 font-medium text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Username *</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 text-slate-800"
                  placeholder="johndoe"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 text-slate-800"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Password *</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  minLength={3}
                  className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 text-slate-800"
                  placeholder="At least 3 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Confirm Password *</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-white/90 backdrop-blur-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 text-slate-800"
                  placeholder="Re-enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 hover:from-rose-400 hover:via-purple-400 hover:to-cyan-400 text-white px-6 py-4 rounded-xl font-black shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
                <button type="button" onClick={onSwitchToLogin} className="text-rose-600 hover:text-rose-500 font-bold underline">
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
