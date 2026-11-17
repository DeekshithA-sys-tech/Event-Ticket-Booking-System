import { useState, useEffect } from 'react';
import { FiClock, FiCheck, FiAlertCircle, FiLock } from 'react-icons/fi';

export const SeatMap = ({
  event,
  seatLayout = [],
  selectedSeats = [],
  lockedSeats = [],
  onToggleSeat,
  onConfirmLock,
  lockExpiresAt,
  loading = false,
}) => {
  const [timeLeft, setTimeLeft] = useState(null);

  // 10-Minute Countdown Timer logic
  useEffect(() => {
    if (!lockExpiresAt) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((lockExpiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockExpiresAt]);

  const formatTime = (seconds) => {
    if (seconds === null) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper to normalize seat layout whether it comes from DB (row objects) or flat array
  const formattedRows = (() => {
    if (seatLayout && Array.isArray(seatLayout) && seatLayout.length > 0) {
      // Check if it's DB structure: [{ row: 'A', seats: [...] }]
      if (seatLayout[0]?.row && Array.isArray(seatLayout[0]?.seats)) {
        return seatLayout.map((rObj) => ({
          rowLabel: rObj.row,
          seats: (rObj.seats || []).map((s) => ({
            ...s,
            row: rObj.row,
            price: s.price || event?.ticketPrice || 1500,
          })),
        }));
      }

      // Flat array structure
      const map = {};
      seatLayout.forEach((s) => {
        const row = s.row || 'A';
        if (!map[row]) map[row] = [];
        map[row].push({
          ...s,
          row,
          price: s.price || event?.ticketPrice || 1500,
        });
      });
      return Object.entries(map).map(([rowLabel, seats]) => ({ rowLabel, seats }));
    }

    return generateDefaultRows(event);
  })();

  function generateDefaultRows(eventData) {
    const rows = ['A', 'B', 'C', 'D', 'E'];
    const seatsPerRow = 10;
    const basePrice = eventData?.ticketPrice || 1500;

    return rows.map((row, rIndex) => {
      const price = rIndex < 2 ? basePrice * 1.5 : rIndex < 3 ? basePrice * 1.2 : basePrice;
      const seats = [];

      for (let i = 1; i <= seatsPerRow; i++) {
        seats.push({
          seatId: `${row}-${i}`,
          row,
          seatNumber: i,
          price,
          status: 'available',
        });
      }

      return { rowLabel: row, seats };
    });
  }

  const isSeatSelected = (seatId) => selectedSeats.some((s) => s.seatId === seatId);
  const isSeatLocked = (seatId) => lockedSeats.some((s) => s.seatId === seatId);

  const totalPrice = selectedSeats.reduce((sum, s) => sum + (s.price || event?.ticketPrice || 1500), 0);

  return (
    <div className="space-y-8 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-md">
      {/* Stage Header */}
      <div className="text-center space-y-2">
        <div className="w-3/4 max-w-lg mx-auto h-3 bg-gradient-to-r from-indigo-500/20 via-indigo-600 to-indigo-500/20 rounded-full shadow-sm" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">
          Stage / Screen This Way 🎭
        </p>
      </div>

      {/* Seat Map Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 py-3 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-slate-100 border border-slate-300" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-indigo-600 border border-indigo-600 shadow-sm" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-300 seat-locked-anim" />
          <span>Locked (10m)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-slate-200 border border-slate-300 opacity-60 cursor-not-allowed" />
          <span>Booked</span>
        </div>
      </div>

      {/* Seat Grid */}
      <div className="overflow-x-auto py-4">
        <div className="min-w-[600px] flex flex-col items-center gap-3">
          {formattedRows.map((rowObj) => (
            <div key={rowObj.rowLabel} className="flex items-center gap-3">
              {/* Row Label */}
              <span className="w-6 text-center font-mono font-bold text-xs text-slate-400">
                {rowObj.rowLabel}
              </span>

              {/* Row Seats */}
              <div className="flex items-center gap-2">
                {rowObj.seats.map((seat, sIdx) => {
                  const sId = seat.seatId || `${rowObj.rowLabel}-${seat.seatNumber || sIdx + 1}`;
                  const selected = isSeatSelected(sId);
                  const locked = isSeatLocked(sId);
                  const booked = seat.status === 'booked';

                  let btnStyle =
                    'bg-slate-100 border-slate-300 text-slate-800 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700';

                  if (selected) {
                    btnStyle =
                      'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-105';
                  } else if (locked) {
                    btnStyle = 'bg-amber-100 border-amber-400 text-amber-800 seat-locked-anim';
                  } else if (booked) {
                    btnStyle = 'bg-slate-200 border-slate-300 text-slate-400 opacity-60 cursor-not-allowed';
                  }

                  return (
                    <button
                      key={sId}
                      disabled={booked || (locked && !selected)}
                      onClick={() => onToggleSeat({ ...seat, seatId: sId })}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border text-xs font-mono font-bold flex flex-col items-center justify-center transition-all ${btnStyle}`}
                      title={`Row ${rowObj.rowLabel} Seat ${seat.seatNumber || sIdx + 1} — ₹${seat.price || 1500}`}
                    >
                      <span>{seat.seatNumber || sIdx + 1}</span>
                    </button>
                  );
                })}
              </div>

              <span className="w-6 text-center font-mono font-bold text-xs text-slate-400">
                {rowObj.rowLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Lock Expiry Countdown Banner */}
      {lockExpiresAt && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <FiClock className="w-4 h-4 text-amber-600 animate-pulse" />
            <span>Seats Reserved Temporarily. Complete checkout before timer expires!</span>
          </div>
          <div className="font-mono font-bold text-base bg-amber-100 px-3 py-1 rounded-xl border border-amber-300">
            {formatTime(timeLeft)}
          </div>
        </div>
      )}

      {/* Selection Summary Footer */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Selected Seats ({selectedSeats.length}/6 max)</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {selectedSeats.length > 0 ? (
              selectedSeats.map((s) => (
                <span
                  key={s.seatId}
                  className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  {s.row || 'Row'}-{s.seatNumber || s.seatId}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">No seats selected yet</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-right">
            <p className="text-xs text-slate-500">Total Price</p>
            <p className="text-xl font-bold text-slate-900">₹{totalPrice.toLocaleString('en-IN')}</p>
          </div>

          <button
            disabled={selectedSeats.length === 0 || loading}
            onClick={onConfirmLock}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02]"
          >
            {loading ? 'Locking Seats...' : 'Confirm & Reserve Seats'}
          </button>
        </div>
      </div>
    </div>
  );
};
