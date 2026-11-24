import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { HiTicket } from 'react-icons/hi2';
import {
  FiCalendar,
  FiMapPin,
  FiStar,
  FiUser,
  FiMessageSquare,
  FiShare2,
  FiPlus,
  FiTrash2,
} from 'react-icons/fi';
import { eventService } from '../services/eventService.js';
import { reviewService } from '../services/reviewService.js';
import { setActiveEvent } from '../store/bookingSlice.js';
import { BackButton } from '../components/BackButton.jsx';
import toast from 'react-hot-toast';

export const EventDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { isAuthenticated, user } = useSelector((state) => state.auth);

  const [event, setEvent] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Review Submission Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        setLoading(true);
        const [eventRes, reviewsRes] = await Promise.all([
          eventService.getEventById(id),
          reviewService.getEventReviews(id).catch(() => ({ data: [] })),
        ]);

        setEvent(eventRes.data);
        setReviews(reviewsRes.data || []);
      } catch (_err) {
        toast.error('Failed to load event details.');
      } finally {
        setLoading(false);
      }
    };

    fetchEventData();
  }, [id]);

  const handleSelectSeats = () => {
    if (!isAuthenticated) {
      toast.error('Please log in to select seats and book tickets.');
      navigate('/login', { state: { from: `/events/${id}/select-seats` } });
      return;
    }
    if (event) {
      dispatch(setActiveEvent(event));
      navigate(`/events/${id}/select-seats`);
    }
  };

  const handleCreateReview = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error('Please log in to leave a review.');
      navigate('/login');
      return;
    }

    try {
      setSubmittingReview(true);
      const res = await reviewService.createReview({
        eventId: id,
        rating: Number(newRating),
        comment: newComment,
      });

      toast.success('Review submitted successfully!');
      setReviews([res.data, ...reviews]);
      setReviewModalOpen(false);
      setNewComment('');
    } catch (_err) {
      // Handled by API toast
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!window.confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }
    try {
      await eventService.deleteEvent(id);
      toast.success('Event deleted successfully.');
      navigate('/events');
    } catch (_err) {
      // Handled by API toast
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto py-20 px-4 text-center space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Event Not Found</h2>
        <Link to="/events" className="text-indigo-600 text-sm hover:underline">
          Return to Events List
        </Link>
      </div>
    );
  }

  const bannerUrl =
    (typeof event.banner === 'object' ? event.banner?.url : event.banner) ||
    'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80';

  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-12 pb-20">
      {/* Event Header Banner */}
      <div className="relative h-[380px] w-full bg-slate-900 overflow-hidden">
        <img src={bannerUrl} alt={event.title} className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/50 to-transparent" />

        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col justify-end pb-8 space-y-4">
          <BackButton label="Back to Events" className="self-start mb-2" />

          {/* Category Badge */}
          {event.category && (
            <span className="self-start px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/90 text-indigo-700 border border-white shadow-sm">
              {typeof event.category === 'object' ? event.category.name : event.category}
            </span>
          )}

          <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight">
            {event.title}
          </h1>

          {/* Quick Info Strip */}
          <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm text-slate-200 pt-2">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-indigo-400" />
              <span>
                {eventDate} at {event.time}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <FiMapPin className="w-4 h-4 text-indigo-400" />
              <span>
                {event.venue}, {event.city}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-amber-400 font-bold">
              <FiStar className="w-4 h-4 fill-amber-400" />
              <span>{event.averageRating ? event.averageRating.toFixed(1) : '4.8'}</span>
              <span className="text-slate-300 font-normal">({reviews.length} reviews)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content & Reservation Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: Description & Reviews */}
        <div className="lg:col-span-2 space-y-10">
          {/* Description */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-slate-900">About This Event</h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </div>

          {/* Organizer Details */}
          {event.organizer && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                  <FiUser className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Organized By</p>
                  <p className="text-sm font-bold text-slate-900">
                    {typeof event.organizer === 'object' ? event.organizer.name : 'Event Organizer'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Customer Reviews Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FiMessageSquare className="w-5 h-5 text-indigo-600" /> Reviews & Ratings
              </h3>

              <button
                onClick={() => setReviewModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition-all"
              >
                <FiPlus className="w-4 h-4" /> Write Review
              </button>
            </div>

            {reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((rev) => (
                  <div key={rev._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {typeof rev.user === 'object' ? rev.user.name : 'Verified Buyer'}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-amber-500 font-semibold">
                        <FiStar className="w-3.5 h-3.5 fill-amber-500" />
                        <span>{rev.rating}/5</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{rev.comment}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 p-8 text-center rounded-2xl text-xs text-slate-500 shadow-sm">
                No reviews yet. Be the first to share your experience!
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Price & Seat Selection Action Box */}
        <div className="space-y-6">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-lg space-y-6 sticky top-24">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs text-slate-500">Ticket Price</span>
                <p className="text-2xl font-bold text-slate-900">
                  ₹{event.ticketPrice?.toLocaleString('en-IN')}
                </p>
              </div>

              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {event.availableSeats} Seats Left
              </span>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <HiTicket className="w-4 h-4 text-indigo-600" />
                <span>Visual Seat Map Reservation</span>
              </div>
              <div className="flex items-center gap-2">
                <FiCalendar className="w-4 h-4 text-indigo-600" />
                <span>Instant PDF & QR Code Pass</span>
              </div>
            </div>

            <button
              onClick={handleSelectSeats}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-bold shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02]"
            >
              Select Seats & Reserve
            </button>

            {/* Admin or Organizer Delete Event Action */}
            {(user?.role === 'admin' || (user?.role === 'organizer' && (event.organizer?._id === user._id || event.organizer === user._id))) && (
              <button
                onClick={handleDeleteEvent}
                className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <FiTrash2 className="w-4 h-4" />
                <span>Delete Event (Admin Moderation)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Reservation CTA Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 shadow-lg flex items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-slate-400 block">From</span>
          <p className="text-base sm:text-lg font-bold text-slate-900">
            ₹{event.ticketPrice?.toLocaleString('en-IN')}
          </p>
        </div>
        <button
          onClick={handleSelectSeats}
          className="flex-1 max-w-xs py-2.5 sm:py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5"
        >
          <HiTicket className="w-4 h-4" />
          <span>Select Seats</span>
        </button>
      </div>

      {/* Write Review Modal */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full space-y-6">
            <h3 className="text-lg font-bold text-slate-900">Write a Review</h3>

            <form onSubmit={handleCreateReview} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Rating</label>
                <select
                  value={newRating}
                  onChange={(e) => setNewRating(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value={5}>5 Stars - Outstanding</option>
                  <option value={4}>4 Stars - Very Good</option>
                  <option value={3}>3 Stars - Average</option>
                  <option value={2}>2 Stars - Poor</option>
                  <option value={1}>1 Star - Terrible</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Comment</label>
                <textarea
                  required
                  rows={4}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Tell us about the venue, performance, and organization..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20"
                >
                  {submittingReview ? 'Submitting...' : 'Post Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
