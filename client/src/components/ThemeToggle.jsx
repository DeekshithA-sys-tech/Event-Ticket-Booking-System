import { useState, useEffect } from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';

export const ThemeToggle = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
    >
      {theme === 'light' ? <FiMoon className="w-4 h-4" /> : <FiSun className="w-4 h-4 text-amber-400" />}
    </button>
  );
};
