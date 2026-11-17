import { Link } from 'react-router-dom';
import { FiCalendar, FiMapPin, FiStar, FiTag } from 'react-icons/fi';

export const EventCard = ({ event }) => {
  if (!event) return null;

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Default fallback image if banner missing
  const bannerUrl =
    (typeof event.banner === 'object' ? event.banner?.url : event.banner) ||
    'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=800&q=80';

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col group border border-slate-200/90 shadow-sm hover:shadow-xl transition-all duration-300">
      {/* Banner & Badges */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-100">
        <img
          src={bannerUrl}
          alt={event.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-60" />

        {/* Category Badge */}
        {event.category && (
          <span className="absolute top-3 left-3 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/95 backdrop-blur-md text-indigo-700 border border-indigo-100 shadow-sm">
            {typeof event.category === 'object' ? event.category.name : event.category}
          </span>
        )}

        {/* Price Tag */}
        <div className="absolute bottom-3 right-3 px-3 py-1 rounded-xl bg-indigo-600 backdrop-blur-md text-white font-bold text-xs shadow-md shadow-indigo-600/30">
          ₹{event.ticketPrice?.toLocaleString('en-IN')} <span className="font-normal text-[10px] text-indigo-200">onwards</span>
        </div>
      </div>

      {/* Details */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          {/* Title */}
          <Link
            to={`/events/${event._id}`}
            className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1"
          >
            {event.title}
          </Link>

          {/* Date & Location */}
          <div className="space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
              <span>
                {eventDate} · {event.time}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FiMapPin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
              <span className="truncate">
                {event.venue}, {event.city}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Availability & Action */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
            <FiStar className="w-3.5 h-3.5 fill-amber-500" />
            <span>{event.averageRating ? event.averageRating.toFixed(1) : '4.8'}</span>
            <span className="text-slate-400 font-normal">({event.totalReviews || 12})</span>
          </div>

          <Link
            to={`/events/${event._id}`}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-semibold transition-all hover:shadow-md hover:shadow-indigo-600/20"
          >
            Book Seats
          </Link>
        </div>
      </div>
    </div>
  );
};
