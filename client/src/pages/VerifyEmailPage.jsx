import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FiCheckCircle, FiAlertCircle, FiLoader, FiMail, FiArrowRight } from 'react-icons/fi';
import axios from 'axios';

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token. Please check the link from your email.');
      return;
    }

    const verify = async () => {
      try {
        const res = await axios.get(`/api/v1/auth/verify-email?token=${token}`);
        setStatus('success');
        setMessage(res.data.message || 'Your email address has been verified successfully!');
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification token is invalid or has expired.');
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-xl space-y-6">
        {status === 'verifying' && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mx-auto text-indigo-600 animate-spin">
              <FiLoader className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Verifying Email...</h1>
            <p className="text-xs text-slate-500">Please wait while we confirm your email token.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center mx-auto text-emerald-600 border border-emerald-200 dark:border-emerald-800">
              <FiCheckCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Email Verified!</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
            <div className="pt-4">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 transition-all"
              >
                <span>Continue to Sign In</span>
                <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center mx-auto text-rose-600 border border-rose-200 dark:border-rose-800">
              <FiAlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Verification Failed</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
            <div className="pt-4 space-y-3">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-all"
              >
                <span>Back to Login</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
