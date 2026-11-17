import { Link } from 'react-router-dom';

export const DashboardSidebar = ({ title, role, items, activeTab, onSelectTab }) => {
  return (
    <aside className="w-full md:w-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-6 shadow-sm self-start">
      {/* Sidebar Header */}
      <div className="px-2 pt-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full">
          {role}
        </span>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-2 truncate">
          {title}
        </h2>
      </div>

      {/* Navigation Links */}
      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {Icon && <Icon className="w-4 h-4" />}
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Link to Browse */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 px-2">
        <Link
          to="/events"
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
        >
          <span>← Back to Public Events</span>
        </Link>
      </div>
    </aside>
  );
};
