import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Smartphone, IdCard, Hash } from 'lucide-react';
import appLogo from '../images/logo.png';

const Signup = ({ onSignup, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    mobile: '',
    nic: '',
    cebAccountNo: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
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
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    if (formData.mobile && !/^[0-9]{10}$/.test(formData.mobile.replace(/[^\d]/g, ''))) {
      newErrors.mobile = 'Mobile number must be 10 digits';
    }
    
    if (formData.nic && !/^([0-9]{9}[vVxX]|[0-9]{12})$/.test(formData.nic)) {
      newErrors.nic = 'NIC must be 9 digits followed by V/X or 12 digits';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    
    try {
      const signupData = {
        email: formData.email,
        password: formData.password,
        mobile: formData.mobile || null,
        nic: formData.nic || null,
        cebAccountNo: formData.cebAccountNo || null
      };

  const response = await fetch('/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData),
      });

      const data = await response.json();

      if (response.ok) {
        // Store tokens in localStorage
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Call parent component's signup handler
        onSignup(data.user);
      } else {
        setErrors({ general: data.error || 'Signup failed' });
      }
    } catch (error) {
      setErrors({ general: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-900 to-slate-950 text-slate-100 flex items-center justify-center p-4">
  <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-white/5 backdrop-blur">
    {/* Brand / Feature side */}
        <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-blue-600 to-emerald-600 text-white">
          <div>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-md">
                <img src={appLogo} alt="LankaWatteWise logo" className="w-7 h-7 rounded object-cover ring-1 ring-white/30" />
              </div>
              <span className="text-lg font-semibold">LankaWatteWise</span>
            </div>
            <h2 className="mt-6 text-3xl font-bold leading-tight">Create your account</h2>
            <p className="mt-2 text-white/90">Join us to track bills, reduce usage, and cut CO₂.</p>
          </div>
          <ul className="space-y-3 mt-8">
            <li className="flex items-start gap-2 text-white/90"><span className="mt-1">•</span><span>Fast setup with the HomeEnergy Coach</span></li>
            <li className="flex items-start gap-2 text-white/90"><span className="mt-1">•</span><span>See savings estimates and clear explanations</span></li>
          </ul>
        </div>
  {/* Form side */}
        <div className="p-8 bg-white/90 text-slate-900">
          <div className="md:hidden text-center mb-6">
            <img src={appLogo} alt="LankaWatteWise logo" className="mx-auto w-12 h-12 rounded-lg mb-2 object-cover ring-1 ring-emerald-200" />
            <h1 className="text-2xl font-bold">LankaWatteWise</h1>
            <p className="text-slate-600">Create your account</p>
          </div>

          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md" role="alert">
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input type="email" id="email" name="email" value={formData.email} onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.email ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="you@example.com" disabled={loading} required autoComplete="email" />
              </div>
              {errors.email && (<p className="mt-1 text-sm text-red-600">{errors.email}</p>)}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input type={showPassword ? 'text' : 'password'} id="password" name="password" value={formData.password} onChange={handleChange}
                  className={`w-full pl-10 pr-10 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.password ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="At least 8 characters" disabled={loading} required autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (<p className="mt-1 text-sm text-red-600">{errors.password}</p>)}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">Confirm Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input type={showConfirm ? 'text' : 'password'} id="confirmPassword" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange}
                  className={`w-full pl-10 pr-10 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.confirmPassword ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="Confirm your password" disabled={loading} required autoComplete="new-password" />
                <button type="button" onClick={() => setShowConfirm(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700" aria-label={showConfirm ? 'Hide confirmation' : 'Show confirmation'}>
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (<p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>)}
            </div>

            <div>
              <label htmlFor="mobile" className="block text-sm font-medium text-slate-700 mb-1">Mobile Number</label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input type="tel" id="mobile" name="mobile" value={formData.mobile} onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.mobile ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="0771234567" disabled={loading} autoComplete="tel" />
              </div>
              {errors.mobile && (<p className="mt-1 text-sm text-red-600">{errors.mobile}</p>)}
            </div>

            <div>
              <label htmlFor="nic" className="block text-sm font-medium text-slate-700 mb-1">NIC Number</label>
              <div className="relative">
                <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input type="text" id="nic" name="nic" value={formData.nic} onChange={handleChange}
                  className={`w-full pl-10 pr-3 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${errors.nic ? 'border-red-400' : 'border-slate-300'}`}
                  placeholder="123456789V or 200012345678" disabled={loading} />
              </div>
              {errors.nic && (<p className="mt-1 text-sm text-red-600">{errors.nic}</p>)}
            </div>

            <div>
              <label htmlFor="cebAccountNo" className="block text-sm font-medium text-slate-700 mb-1">CEB Account Number</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" aria-hidden="true" />
                <input type="text" id="cebAccountNo" name="cebAccountNo" value={formData.cebAccountNo} onChange={handleChange}
                  className="w-full pl-10 pr-3 py-2 rounded-md border shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 border-slate-300"
                  placeholder="Your electricity bill account number" disabled={loading} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Optional: Link your electricity account for bill management</p>
            </div>

            <button type="submit" disabled={loading}
              className={`w-full py-2.5 px-4 rounded-md text-white font-medium transition-all shadow ${loading ? 'bg-slate-300 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-emerald-500'}`}>
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">Already have an account?{' '}
              <button onClick={onSwitchToLogin} className="text-emerald-700 hover:text-emerald-800 font-medium" disabled={loading}>Sign in here</button>
            </p>
          </div>

          <div className="mt-4 text-xs text-slate-500 text-center">By creating an account, you agree to our Terms of Service and Privacy Policy</div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
