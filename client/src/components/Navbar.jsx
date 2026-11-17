import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { HiTicket } from 'react-icons/hi2';
import {
  FiSearch,
  FiUser,
  FiLogOut,
  FiCalendar,
  FiGrid,
  FiShield,
  FiMapPin,
  FiMenu,
  FiX,
  FiPlusCircle,
} from 'react-icons/fi';
import { logoutUser } from '../store/authSlice.js';
import { BackButton } from './BackButton.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';
import { NotificationBell } from './NotificationBell.jsx';

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState('All Cities');
  const [searchQuery, setSearchQuery] = useState('');

  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const cities = ['All Cities', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune'];

  // Sync search input with URL params when on /search page
  useEffect(() => {
    if (location.pathname === '/search') {
      const searchParams = new URLSearchParams(location.search);
      const q = searchParams.get('q') || searchParams.get('search') || '';
      const city = searchParams.get('city') || 'All Cities';
      setSearchQuery(q);
      if (city) setSelectedCity(city);
    }
  }, [location.pathname, location.search]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    if (selectedCity && selectedCity !== 'All Cities') {
      params.set('city', selectedCity);
    }
    
    const queryString = params.toString();
    navigate(queryString ? `/search?${queryString}` : '/search');
    setMobileMenuOpen(false);
  };

  const handleCityChange = (newCity) => {
    setSelectedCity(newCity);
    if (location.pathname === '/search') {
      const params = new URLSearchParams(location.search);
      if (newCity && newCity !== 'All Cities') {
        params.set('city', newCity);
      } else {
        params.delete('city');
      }
      const queryString = params.toString();
      navigate(queryString ? `/search?${queryString}` : '/search');
    }
  };

  const handleLogout = () => {
    dispatch(logoutUser());
    setUserDropdownOpen(false);
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Back Button */}
          <div className="flex items-center gap-3">
            {location.pathname !== '/' && (
              <BackButton label="Back" className="hidden sm:inline-flex" />
            )}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <HiTicket className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-slate-900 bg-clip-text text-transparent">
                EventPulse
              </span>
            </Link>
          </div>

          {/* Active Search Bar & City Selector (Desktop) */}
          <div className="hidden md:flex items-center gap-3 flex-1 max-w-lg mx-6">
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex-1 flex items-center group"
            >
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 pointer-events-none transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search concerts, sports, theater..."
                className="w-full pl-10 pr-9 py-2 rounded-xl bg-slate-100/90 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                  title="Clear search"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* City Dropdown */}
            <div className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100/90 border border-slate-200 text-xs font-medium text-slate-700 hover:border-slate-300 transition-colors">
              <FiMapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <select
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                className="bg-transparent text-slate-800 focus:outline-none cursor-pointer pr-1 text-xs font-medium"
              >
                {cities.map((city) => (
                  <option key={city} value={city} className="bg-white text-slate-800">
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              to="/events"
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/events'
                  ? 'text-indigo-600 font-semibold'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              Explore Events
            </Link>

            {/* Organizer & Admin Quick Actions */}
            {(user?.role === 'organizer' || user?.role === 'admin') && (
              <>
                <Link
                  to="/organizer/dashboard"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02]"
                >
                  <FiPlusCircle className="w-4 h-4" />
                  <span>+ Create Event</span>
                </Link>
                {user?.role === 'organizer' && (
                  <Link
                    to="/organizer/dashboard"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-all"
                  >
                    <FiGrid className="w-4 h-4" />
                    <span>Organizer Hub</span>
                  </Link>
                )}
              </>
            )}

            {/* Admin Quick Action */}
            {user?.role === 'admin' && (
              <Link
                to="/admin/dashboard"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 text-xs font-semibold transition-all"
              >
                <FiShield className="w-4 h-4" />
                <span>Admin Console</span>
              </Link>
            )}

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* In-App Notifications */}
            {isAuthenticated && <NotificationBell />}

            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 p-1.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 transition-all focus:outline-none shadow-sm"
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-8 h-8 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold text-slate-800 max-w-[100px] truncate">
                    {user?.name}
                  </span>
                </button>

                {/* User Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl py-2 z-50 border border-slate-200 divide-y divide-slate-100">
                    <div className="px-4 py-2.5">
                      <p className="text-xs text-slate-500">Signed in as</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{user?.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {user?.role}
                      </span>
                    </div>

                    <div className="py-1">
                      <Link
                        to="/my-bookings"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-50"
                      >
                        <FiCalendar className="w-4 h-4 text-indigo-500" />
                        My Bookings
                      </Link>
                      <Link
                        to="/profile"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-700 hover:text-indigo-600 hover:bg-slate-50"
                      >
                        <FiUser className="w-4 h-4 text-indigo-500" />
                        Account Settings
                      </Link>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 text-left transition-colors"
                      >
                        <FiLogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02]"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-200 px-4 pt-3 pb-6 space-y-3 shadow-lg">
          {/* Mobile Active Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events, artists, venues..."
                className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:bg-white focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <FiX className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
            >
              Search
            </button>
          </form>

          <Link
            to="/events"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-slate-700 hover:text-indigo-600 py-1.5"
          >
            Explore Events
          </Link>

          {isAuthenticated ? (
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <Link
                to="/my-bookings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-indigo-600 py-1.5"
              >
                <FiCalendar className="w-4 h-4 text-indigo-500" />
                My Bookings
              </Link>
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-indigo-600 py-1.5"
              >
                <FiUser className="w-4 h-4 text-indigo-500" />
                Profile & Settings
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm text-rose-600 hover:text-rose-700 py-1.5 w-full text-left"
              >
                <FiLogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2 text-sm font-medium text-slate-700 hover:text-indigo-600"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
              >
                Register Account
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
