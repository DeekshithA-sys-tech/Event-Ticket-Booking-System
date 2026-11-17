import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

export const BackButton = ({ label = 'Back', className = '' }) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(-1)}
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-semibold shadow-md transition-all hover:scale-[1.02] cursor-pointer ${className}`}
      title="Navigate to previous page"
    >
      <FiArrowLeft className="w-4 h-4 text-indigo-400" />
      <span>{label}</span>
    </button>
  );
};
