import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HiSparkles } from 'react-icons/hi2';
import { FiSearch, FiCalendar, FiMapPin, FiTrendingUp } from 'react-icons/fi';
import { eventService } from '../services/eventService.js';
import { searchService } from '../services/searchService.js';
import { EventCard } from '../components/EventCard.jsx';
import { EventCardSkeleton } from '../components/skeletons/EventCardSkeleton.jsx';

export const HomePage = () => {
  const [events, setEvents] = useState([]);
  const [trending, setTrending] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [eventsRes, trendingRes, categoriesRes] = await Promise.all([
          eventService.getEvents({ limit: 8, category: selectedCategory }),
          searchService.getTrendingEvents(),
          eventService.getCategories(),
        ]);

        setEvents(eventsRes.data || []);
        setTrending(trendingRes.data || []);
        setCategories(categoriesRes.data || []);
      } catch (_err) {
        // Suppress initial errors
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedCategory]);

  return (
    <div className="space-y-16 pb-20">
      {/* Hero Banner Section */}
      <section className="relative overflow-hidden pt-12 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-tr from-indigo-200/40 via-purple-200/40 to-pink-200/30 blur-3xl rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold shadow-sm">
            <HiSparkles className="w-3.5 h-3.5" /> Experience Live Music, Sports & Shows
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Book Tickets to Your Next <br />
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Unforgettable Memory
            </span>
          </h1>

          <p className="text-slate-600 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Visual seat map selection, atomic 10-minute seat reservations, instant QR pass delivery, and zero double booking guarantee.
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
              }}
              className="bg-white p-2 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-xl shadow-slate-200/60"
            >
              <div className="flex items-center gap-3 px-3 flex-1">
                <FiSearch className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search events, artists, venues, or cities..."
                  className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
              >
                Find Events
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Browse Categories</h2>
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory('')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
            >
              Clear Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {categories.map((cat) => (
            <button
              key={cat._id || cat.slug}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`bg-white p-4 rounded-2xl flex flex-col items-center gap-2 text-center border transition-all shadow-sm hover:shadow-md ${
                selectedCategory === cat.slug
                  ? 'border-indigo-500 bg-indigo-50/80 text-indigo-700 font-semibold'
                  : 'border-slate-200/90 text-slate-700 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <span className="text-2xl">{cat.icon || '🎟️'}</span>
              <span className="text-xs font-semibold line-clamp-1">{cat.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Trending Events Carousel */}
      {trending.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center gap-2">
            <FiTrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">Trending Events</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trending.slice(0, 4).map((event) => (
              <EventCard key={event._id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* All Events Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Upcoming Events</h2>
          <Link to="/events" className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold">
            View All ({events.length}) →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <EventCardSkeleton key={n} />
            ))}
          </div>
        ) : events.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {events.map((event) => (
              <EventCard key={event._id} event={event} />
            ))}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 p-12 text-center rounded-3xl space-y-3 shadow-sm">
            <p className="text-slate-500 text-sm">No events found matching current criteria.</p>
          </div>
        )}
      </section>
    </div>
  );
};
