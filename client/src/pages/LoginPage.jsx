import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser } from '../store/authSlice.js';
import { HiTicket } from 'react-icons/hi2';
import { FiMail, FiLock, FiArrowRight } from 'react-icons/fi';
import toast from 'react-hot-toast';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { loading } = useSelector((state) => state.auth);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const resultAction = await dispatch(loginUser({ email, password }));

    if (loginUser.fulfilled.match(resultAction)) {
      toast.success('Logged in successfully!');
      navigate(from, { replace: true });
    }
  };

  const handleDemoFill = (role) => {
    if (role === 'customer') {
      setEmail('customer@example.com');
      setPassword('Password123!');
    } else if (role === 'organizer') {
      setEmail('organizer@example.com');
      setPassword('Password123!');
    } else if (role === 'admin') {
      setEmail('admin@example.com');
      setPassword('Password123!');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4">
      <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white mx-auto shadow-md shadow-indigo-500/20">
            <HiTicket className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="text-xs text-slate-500">Sign in to your EventPulse account to manage bookings</p>
        </div>

        {/* Demo Login Quick Options */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <span className="text-[10px] uppercase font-bold text-slate-500 block text-center">
            Demo Credentials Quick Select
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleDemoFill('customer')}
              className="py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-semibold transition-colors"
            >
              Customer
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('organizer')}
              className="py-1 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-[11px] font-semibold transition-colors"
            >
              Organizer
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('admin')}
              className="py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 text-[11px] font-semibold transition-colors"
            >
              Admin
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
            <div className="relative">
              <FiMail className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
            <div className="relative">
              <FiLock className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
            <FiArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-600 font-semibold hover:underline">
            Register Account
          </Link>
        </p>
      </div>
    </div>
  );
};
