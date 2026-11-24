import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { eventService } from '../services/eventService.js';
import { EventCard } from '../components/EventCard.jsx';
import { EventCardSkeleton } from '../components/skeletons/EventCardSkeleton.jsx';
import { FiFilter, FiSearch, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

export const EventsListPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const categoryParam = searchParams.get('category') || '';
  const cityParam = searchParams.get('city') || '';
  const searchParam = searchParams.get('search') || '';

  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchInput, setSearchInput] = useState(searchParam);
  const [loading, setLoading] = useState(true);

  // Sync search input if URL search parameter changes
  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  // Load categories ONCE on initial mount
  useEffect(() => {
    eventService.getCategories().then((res) => {
      setCategories(res?.data || []);
    }).catch(() => {});
  }, []);

  // Fetch events only when URL parameters change (single source of truth)
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    eventService.getEvents({
      category: categoryParam,
      city: cityParam,
      search: searchParam,
      limit: 24,
    }).then((res) => {
      if (!isCancelled) {
        setEvents(res?.data || []);
      }
    }).catch(() => {
      if (!isCancelled) toast.error('Failed to load events.');
    }).finally(() => {
      if (!isCancelled) setLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [categoryParam, cityParam, searchParam]);

  const handleCategoryChange = (newCat) => {
    const newParams = new URLSearchParams(searchParams);
    if (newCat) {
      newParams.set('category', newCat);
    } else {
      newParams.delete('category');
    }
    setSearchParams(newParams);
  };

  const handleCityChange = (newCity) => {
    const newParams = new URLSearchParams(searchParams);
    if (newCity) {
      newParams.set('city', newCity);
    } else {
      newParams.delete('city');
    }
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      newParams.set('search', searchInput.trim());
    } else {
      newParams.delete('search');
    }
    setSearchParams(newParams);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(categoryParam || cityParam || searchParam);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Title & Filter Bar */}
      <div className="space-y-6 border-b border-slate-200 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900">Explore Events</h1>
            <p className="text-xs text-slate-500 mt-1">Discover live concerts, sports, theater, and comedy shows.</p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors self-start sm:self-auto"
            >
              <FiX className="w-3.5 h-3.5 text-slate-500" />
              Clear Filters
            </button>
          )}
        </div>

        {/* Search & Category Filter Controls */}
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Keyword Search */}
          <form onSubmit={handleSearchSubmit} className="w-full md:w-96 relative">
            <FiSearch className="absolute left-3.5 top-3 text-indigo-500 w-4 h-4" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by event title or venue..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-sm"
            />
          </form>

          {/* Category Dropdown */}
          <div className="w-full md:w-48">
            <select
              value={categoryParam}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none shadow-sm font-medium"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c._id || c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* City Dropdown */}
          <div className="w-full md:w-44">
            <select
              value={cityParam}
              onChange={(e) => handleCityChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none shadow-sm font-medium"
            >
              <option value="">All Cities</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Delhi">Delhi</option>
              <option value="Bangalore">Bangalore</option>
              <option value="Bengaluru">Bengaluru</option>
              <option value="Hyderabad">Hyderabad</option>
              <option value="Pune">Pune</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <EventCardSkeleton key={n} />
          ))}
        </div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {events.map((ev) => (
            <EventCard key={ev._id} event={ev} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 p-16 text-center rounded-3xl space-y-3 shadow-sm">
          <p className="text-slate-500 text-sm">No events found matching your search filters.</p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              View All Events
            </button>
          )}
        </div>
      )}
    </div>
  );
};
