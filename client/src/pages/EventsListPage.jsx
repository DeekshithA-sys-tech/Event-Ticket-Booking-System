import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { eventService } from '../services/eventService.js';
import { EventCard } from '../components/EventCard.jsx';
import { EventCardSkeleton } from '../components/skeletons/EventCardSkeleton.jsx';
import { FiFilter, FiSearch } from 'react-icons/fi';
import toast from 'react-hot-toast';

export const EventsListPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialCategory = searchParams.get('category') || '';
  const initialCity = searchParams.get('city') || '';
  const initialSearch = searchParams.get('search') || '';

  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedCity, setSelectedCity] = useState(initialCity);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const [eventsRes, categoriesRes] = await Promise.all([
        eventService.getEvents({
          category: selectedCategory,
          city: selectedCity,
          search: searchQuery,
          limit: 24,
        }),
        eventService.getCategories(),
      ]);

      setEvents(eventsRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (_err) {
      toast.error('Failed to load events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedCategory, selectedCity]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchEvents();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Title & Filter Bar */}
      <div className="space-y-6 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Explore Events</h1>
          <p className="text-xs text-slate-500 mt-1">Discover live concerts, sports, theater, and comedy shows.</p>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="flex flex-col md:flex-row items-center gap-4">
          {/* Keyword Search */}
          <form onSubmit={handleSearchSubmit} className="w-full md:w-96 relative">
            <FiSearch className="absolute left-3.5 top-3 text-indigo-500 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by event title or venue..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 shadow-sm"
            />
          </form>

          {/* Category Dropdown */}
          <div className="w-full md:w-48">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
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
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none shadow-sm font-medium"
            >
              <option value="">All Cities</option>
              <option value="Mumbai">Mumbai</option>
              <option value="Delhi">Delhi</option>
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
        </div>
      )}
    </div>
  );
};
