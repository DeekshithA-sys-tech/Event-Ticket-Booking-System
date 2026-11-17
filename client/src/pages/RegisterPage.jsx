import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser } from '../store/authSlice.js';
import { HiTicket } from 'react-icons/hi2';
import { FiUser, FiMail, FiLock, FiPhone, FiCheckCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';

export const RegisterPage = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('customer');

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector((state) => state.auth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const resultAction = await dispatch(
      registerUser({ name, email, password, phone, role })
    );

    if (registerUser.fulfilled.match(resultAction)) {
      if (resultAction.payload?.isPendingApproval) {
        toast.success(
          'Organizer registration submitted! Your account is pending admin approval before you can log in.',
          { duration: 6000 }
        );
        navigate('/login');
      } else {
        toast.success('Account created successfully!');
        navigate('/');
      }
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4">
      <div className="bg-white p-8 sm:p-10 rounded-3xl border border-slate-200 shadow-xl max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white mx-auto shadow-md shadow-indigo-500/20">
            <HiTicket className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Create an Account</h1>
          <p className="text-xs text-slate-500">Join EventPulse to book tickets and manage events</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role Selection Segment */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">I want to:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('customer')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  role === 'customer'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Book Tickets (Customer)
              </button>
              <button
                type="button"
                onClick={() => setRole('organizer')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  role === 'organizer'
                    ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Host Events (Organizer)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
            <div className="relative">
              <FiUser className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
            <div className="relative">
              <FiMail className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number</label>
            <div className="relative">
              <FiPhone className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
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
                placeholder="Minimum 8 characters"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            disabled={loading}
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? 'Registering Account...' : 'Register Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};
