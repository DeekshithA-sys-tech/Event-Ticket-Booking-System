import { Link } from 'react-router-dom';
import { HiTicket } from 'react-icons/hi2';
import { FiHeart, FiGlobe, FiShield, FiSend } from 'react-icons/fi';

export const Footer = () => {
  return (
    <footer className="bg-white border-t border-slate-200 pt-16 pb-8 text-slate-600 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-slate-200">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                <HiTicket className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-slate-900 bg-clip-text text-transparent">EventPulse</span>
            </Link>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enterprise event ticketing platform with real-time visual seat map reservation, Redis atomic locking, and PDF/QR pass generation.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Quick Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/events" className="hover:text-indigo-600 transition-colors">
                  All Events
                </Link>
              </li>
              <li>
                <Link to="/search" className="hover:text-indigo-600 transition-colors">
                  Search & Discover
                </Link>
              </li>
              <li>
                <Link to="/my-bookings" className="hover:text-indigo-600 transition-colors">
                  My Bookings
                </Link>
              </li>
              <li>
                <a href="http://localhost:5000/api-docs" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">
                  Swagger OpenAPI Docs
                </a>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Top Categories</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link to="/events?category=music" className="hover:text-indigo-600 transition-colors">
                  Music Concerts & Festivals
                </Link>
              </li>
              <li>
                <Link to="/events?category=sports" className="hover:text-indigo-600 transition-colors">
                  Live Sports & Matches
                </Link>
              </li>
              <li>
                <Link to="/events?category=arts-theater" className="hover:text-indigo-600 transition-colors">
                  Arts, Theater & Performances
                </Link>
              </li>
              <li>
                <Link to="/events?category=comedy" className="hover:text-indigo-600 transition-colors">
                  Standup Comedy Shows
                </Link>
              </li>
              <li>
                <Link to="/events?category=workshops" className="hover:text-indigo-600 transition-colors">
                  Workshops & Masterclasses
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter Box */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Stay Updated</h4>
            <p className="text-xs text-slate-500">Subscribe for early-bird ticket releases & discounts.</p>
            <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2">
              <input
                type="email"
                placeholder="Enter email..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all"
              >
                <FiSend className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Copyright Footer */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} EventPulse Ticketing Platform. All rights reserved.</p>
          
        </div>
      </div>
    </footer>
  );
};
