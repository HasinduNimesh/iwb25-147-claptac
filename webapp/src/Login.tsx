import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import appLogo from '../images/logo.png';
import type { AuthResponse, UserProfile } from './types';

interface LoginProps {
  onLogin: (user: UserProfile) => void;
  onSwitchToSignup: () => void;
}

type LoginErrors = Partial<Record<'email' | 'password' | 'general', string>>;

interface LoginFormState {
  email: string;
  password: string;
}

const Login: React.FC<LoginProps> = ({ onLogin, onSwitchToSignup }: LoginProps) => {
  const [formData, setFormData] = useState<LoginFormState>({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((previous: LoginFormState) => ({
      ...previous,
      [name]: value
    }));
    if (errors[name as keyof LoginErrors]) {
      setErrors((previous: LoginErrors) => ({
        ...previous,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors: LoginErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
    const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data: AuthResponse = await response.json();

      if (response.ok) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        onLogin(data.user);
      } else {
        setErrors({ general: data.error || 'Login failed' });
      }
    } catch (error) {
      console.error('Login failed:', error);
      setErrors({ general: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-900 to-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-white/5 backdrop-blur">
        <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-emerald-600 to-blue-600 text-white">
          <div>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-md">
                <img src={appLogo} alt="LankaWatteWise logo" className="w-7 h-7 rounded object-cover ring-1 ring-white/30" />
              </div>
              <span className="text-lg font-semibold">LankaWatteWise</span>
            </div>
            <h2 className="mt-6 text-3xl font-bold leading-tight">Welcome back</h2>
            <p className="mt-2 text-white/90">Sign in to manage your energy usage, bills, and savings insights.</p>
          </div>
          <ul className="space-y-3 mt-8">
            <li className="flex items-start gap-2 text-white/90"><span className="mt-1">•</span><span>Personalized advice based on your appliances and tariff</span></li>
            <li className="flex items-start gap-2 text-white/90"><span className="mt-1">•</span><span>Bill previews and monthly CO₂ projection</span></li>
            <li className="flex items-start gap-2 text-white/90"><span className="mt-1">•</span><span>Privacy‑first, you control your data</span></li>
          </ul>
        </div>

        <div className="p-8 bg-white/90 text-slate-900">
          <div className="md:hidden text-center mb-6">
            <img src={appLogo} alt="LankaWatteWise logo" className="mx-auto w-12 h-12 rounded-lg mb-2 object-cover ring-1 ring-emerald-200" />
            <h1 className="text-2xl font-bold">LankaWatteWise</h1>
            <p className="text-slate-600">Sign in to your account</p>
          </div>

          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md" role="alert">
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.email ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="you@example.com"
                  disabled={loading}
                  autoComplete="email"
                  required
                />
              </div>
              {errors.email && (<p className="mt-1 text-sm text-red-600">{errors.email}</p>)}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-10 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.password ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="Enter your password"
                  disabled={loading}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((state) => !state)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (<p className="mt-1 text-sm text-red-600">{errors.password}</p>)}
              <div className="mt-2 flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                  Remember me
                </label>
                <a href="#" className="text-sm text-emerald-700 hover:text-emerald-800">Forgot password?</a>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 px-4 rounded-md text-white font-medium transition-all shadow ${loading ? 'bg-slate-300 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-emerald-500'}`}
            >
              {loading ? 'Signing In…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToSignup}
                className="text-emerald-700 hover:text-emerald-800 font-medium"
                disabled={loading}
              >
                Sign up here
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
