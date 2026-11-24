import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { eventService } from '../services/eventService.js';
import { bookingService } from '../services/bookingService.js';
import { searchService } from '../services/searchService.js';
import {
  toggleSeatSelection,
  setSeatsLocked,
  setActiveEvent,
} from '../store/bookingSlice.js';
import { SeatMap } from '../components/SeatMap.jsx';
import toast from 'react-hot-toast';

export const SeatSelectionPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { isAuthenticated } = useSelector((state) => state.auth);
  const { selectedSeats, lockedSeats, lockExpiresAt, activeEvent } = useSelector(
    (state) => state.booking
  );

  const [event, setEvent] = useState(activeEvent);
  const [seatLayout, setSeatLayout] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('Please log in to select seats and book tickets.');
      navigate('/login', { state: { from: `/events/${id}/select-seats` }, replace: true });
    }
  }, [isAuthenticated, id, navigate]);

  useEffect(() => {
    const fetchEventAndSeats = async () => {
      try {
        setLoading(true);
        const [eventRes, seatRes] = await Promise.all([
          eventService.getEventById(id),
          searchService.getSeatAvailability(id).catch(() => ({ data: { seatLayout: [] } })),
        ]);

        setEvent(eventRes.data);
        dispatch(setActiveEvent(eventRes.data));
        setSeatLayout(seatRes.data?.seatLayout || eventRes.data?.seatLayout || []);
      } catch (_err) {
        toast.error('Failed to load seat layout.');
      } finally {
        setLoading(false);
      }
    };

    fetchEventAndSeats();
  }, [id, dispatch]);

  useEffect(() => {
    if (activeEvent && activeEvent._id !== id) {
      dispatch(clearSeatSelection());
    } else if (lockExpiresAt && Date.now() > lockExpiresAt) {
      dispatch(clearSeatSelection());
    }
  }, [id, activeEvent, lockExpiresAt, dispatch]);

  const handleToggleSeat = (seat) => {
    dispatch(toggleSeatSelection(seat));
  };

  const handleConfirmLock = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to reserve seats.');
      navigate('/login');
      return;
    }

    if (selectedSeats.length === 0) {
      toast.error('Please select at least one seat.');
      return;
    }

    try {
      setLocking(true);
      const seatIds = selectedSeats.map((s) => s.seatId);

      const res = await bookingService.lockSeats({
        eventId: id,
        seatIds,
      });

      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
      dispatch(
        setSeatsLocked({
          seats: selectedSeats,
          expiresAt,
        })
      );

      toast.success(res.message || 'Seats locked successfully for 10 minutes!');
      navigate('/checkout');
    } catch (_err) {
      // API error handled by toast
    } finally {
      setLocking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            Step 1 of 2 — Seat Selection
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{event?.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {event?.venue}, {event?.city}
          </p>
        </div>
      </div>

      {/* Visual Seat Map */}
      <SeatMap
        event={event}
        seatLayout={seatLayout}
        selectedSeats={selectedSeats}
        lockedSeats={lockedSeats}
        lockExpiresAt={lockExpiresAt}
        onToggleSeat={handleToggleSeat}
        onConfirmLock={handleConfirmLock}
        loading={locking}
      />
    </div>
  );
};
