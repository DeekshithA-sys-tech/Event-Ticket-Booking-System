import { useState, useEffect } from 'react';
import { bookingService } from '../services/bookingService.js';
import { TicketCard } from '../components/TicketCard.jsx';
import toast from 'react-hot-toast';

export const MyBookingsPage = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const res = await bookingService.getMyBookings({ limit: 20 });
      setBookings(res.data || []);
    } catch (_err) {
      toast.error('Failed to load your booking history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking? Released seats will become available immediately.')) {
      return;
    }

    try {
      await bookingService.cancelBooking(bookingId, 'Cancelled by customer');
      toast.success('Booking cancelled successfully.');
      fetchBookings();
    } catch (_err) {
      // Handled by toast
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (filterStatus === 'all') return true;
    return b.status === filterStatus;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page Title & Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Booking Passes</h1>
          <p className="text-xs text-slate-500 mt-1">
            Access your event tickets, scan QR codes, or download PDF passes.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-white border border-slate-200 self-start sm:self-auto text-xs shadow-sm">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Passes
          </button>
          <button
            onClick={() => setFilterStatus('confirmed')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'confirmed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Confirmed
          </button>
          <button
            onClick={() => setFilterStatus('cancelled')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              filterStatus === 'cancelled'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cancelled
          </button>
        </div>
      </div>

      {/* Bookings List */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white h-48 rounded-3xl animate-pulse border border-slate-200" />
          ))}
        </div>
      ) : filteredBookings.length > 0 ? (
        <div className="space-y-6">
          {filteredBookings.map((b) => (
            <TicketCard key={b._id || b.bookingId} booking={b} onCancel={handleCancelBooking} />
          ))}
        </div>
      ) : (
        <div className="bg-white p-16 text-center rounded-3xl border border-slate-200 shadow-sm space-y-3">
          <p className="text-slate-500 text-sm">No ticket bookings found matching this filter.</p>
        </div>
      )}
    </div>
  );
};
