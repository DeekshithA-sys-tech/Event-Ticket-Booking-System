import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchService } from '../services/searchService.js';
import { EventCard } from '../components/EventCard.jsx';
import { FiSearch, FiMapPin, FiX, FiTrendingUp, FiSliders } from 'react-icons/fi';

export const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || searchParams.get('search') || '';
  const selectedCity = searchParams.get('city') || 'All Cities';

  const [results, setResults] = useState([]);
  const [trendingEvents, setTrendingEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const cities = ['All Cities', 'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Pune'];

  const executeSearch = async (searchTerm, cityTerm) => {
    try {
      setLoading(true);
      const params = { limit: 24 };
      if (searchTerm && searchTerm.trim()) {
        params.q = searchTerm.trim();
      }
      if (cityTerm && cityTerm !== 'All Cities') {
        params.city = cityTerm;
      }

      const res = await searchService.searchEvents(params);
      setResults(res.data || []);
    } catch (_err) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTrending = async () => {
    try {
      const res = await searchService.getTrendingEvents();
      setTrendingEvents(res.data || []);
    } catch (_err) {
      // Handled
    }
  };

  useEffect(() => {
    if (query || (selectedCity && selectedCity !== 'All Cities')) {
      executeSearch(query, selectedCity);
    } else {
      executeSearch('', '');
      loadTrending();
    }
  }, [query, selectedCity]);

  const handleCityFilter = (city) => {
    const params = {};
    if (query.trim()) params.q = query.trim();
    if (city && city !== 'All Cities') params.city = city;
    setSearchParams(params);
  };

  const removeQueryFilter = () => {
    const params = {};
    if (selectedCity && selectedCity !== 'All Cities') params.city = selectedCity;
    setSearchParams(params);
  };

  const removeCityFilter = () => {
    const params = {};
    if (query.trim()) params.q = query.trim();
    setSearchParams(params);
  };

  const clearAllFilters = () => {
    setSearchParams({});
  };

  const isFiltered = query.trim() || (selectedCity && selectedCity !== 'All Cities');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header with Active Filters */}
      <div className="space-y-4 border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {query ? (
                <span>
                  Results for <span className="text-indigo-600">"{query}"</span>
                </span>
              ) : (
                'Explore All Events'
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isFiltered
                ? `Showing ${results.length} matching ${results.length === 1 ? 'event' : 'events'}`
                : 'Browse live concerts, sports, festivals, and theatrical shows.'}
            </p>
          </div>

          {/* Quick Clear All */}
          {isFiltered && (
            <button
              onClick={clearAllFilters}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 self-start sm:self-auto py-1 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all"
            >
              Clear All Filters
            </button>
          )}
        </div>

        {/* Active Filter Badges & City Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1 mr-1">
            <FiSliders className="w-3.5 h-3.5 text-indigo-500" /> City:
          </span>

          {cities.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleCityFilter(c)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                selectedCity === c
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-semibold scale-[1.02]'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:text-indigo-600 shadow-sm'
              }`}
            >
              {c !== 'All Cities' && <FiMapPin className="w-3 h-3 text-indigo-500" />}
              {c}
            </button>
          ))}

          {/* Active Query Badge */}
          {query.trim() && (
            <div className="flex items-center gap-1.5 ml-auto px-3 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
              <span>Keyword: <strong>"{query.trim()}"</strong></span>
              <button
                onClick={removeQueryFilter}
                className="text-indigo-600 hover:text-indigo-900 ml-1 p-0.5 rounded hover:bg-indigo-100 transition-colors"
                title="Remove keyword filter"
              >
                <FiX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="bg-white rounded-2xl h-80 animate-pulse border border-slate-200" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {results.map((ev) => (
            <EventCard key={ev._id} event={ev} />
          ))}
        </div>
      ) : (
        <div className="bg-white p-16 text-center rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600">
            <FiSearch className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-800 font-semibold text-base">No events found</p>
            <p className="text-slate-500 text-xs mt-1">
              {query
                ? `No events matched "${query}". Try another search from the top navbar.`
                : 'No events found in this city filter.'}
            </p>
          </div>
        </div>
      )}

      {/* Trending Events Section when browsing without a search term */}
      {!query && trendingEvents.length > 0 && (
        <div className="space-y-4 pt-8 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <FiTrendingUp className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">Trending Events Right Now</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trendingEvents.slice(0, 4).map((ev) => (
              <EventCard key={ev._id} event={ev} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
