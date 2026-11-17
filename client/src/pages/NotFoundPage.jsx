import { Link } from 'react-router-dom';
import { FiHome, FiCompass } from 'react-icons/fi';

export const NotFoundPage = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="relative mb-6">
        <span className="text-9xl font-extrabold text-slate-200 select-none">404</span>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-extrabold text-indigo-600 bg-white/80 px-4 py-1 rounded-xl shadow-sm border border-slate-100">
            Page Not Found
          </span>
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-3">
        Lost in the crowd?
      </h1>
      <p className="text-slate-500 max-w-md mb-8 text-sm sm:text-base leading-relaxed">
        The page you are looking for might have been moved, deleted, or does not exist.
        Explore upcoming events or head back to the main stage.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md shadow-indigo-200 transition-all text-sm"
        >
          <FiHome className="w-4 h-4" />
          Back to Home
        </Link>
        <Link
          to="/events"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-medium border border-slate-200 shadow-sm transition-all text-sm"
        >
          <FiCompass className="w-4 h-4" />
          Explore Events
        </Link>
      </div>
    </div>
  );
};
