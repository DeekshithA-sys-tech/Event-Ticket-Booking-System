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
    <div className="space-y-6 sm:space-y-8 bg-white p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-md">
      {/* Stage Header */}
      <div className="text-center space-y-2">
        <div className="w-3/4 max-w-lg mx-auto h-2.5 sm:h-3 bg-gradient-to-r from-indigo-500/20 via-indigo-600 to-indigo-500/20 rounded-full shadow-sm" />
        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-indigo-600">
          Stage / Screen This Way 🎭
        </p>
      </div>

      {/* Seat Map Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md sm:rounded-lg bg-slate-100 border border-slate-300" />
          <span className="text-[11px] sm:text-xs">Available</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md sm:rounded-lg bg-indigo-600 border border-indigo-600 shadow-sm" />
          <span className="text-[11px] sm:text-xs">Selected</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md sm:rounded-lg bg-amber-100 border border-amber-300 seat-locked-anim" />
          <span className="text-[11px] sm:text-xs">Locked (10m)</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-md sm:rounded-lg bg-slate-200 border border-slate-300 opacity-60 cursor-not-allowed" />
          <span className="text-[11px] sm:text-xs">Booked</span>
        </div>
      </div>

      {/* Mobile Swipe Hint */}
      <div className="sm:hidden flex items-center justify-center gap-1.5 text-[11px] text-indigo-600 bg-indigo-50/70 border border-indigo-100 py-1.5 px-3 rounded-xl font-medium">
        <span>⇄ Swipe horizontally to view all seats</span>
      </div>

      {/* Seat Grid */}
      <div className="overflow-x-auto py-2 sm:py-4 -mx-2 sm:mx-0 px-2 sm:px-0">
        <div className="min-w-[540px] sm:min-w-[600px] flex flex-col items-center gap-2 sm:gap-3">
          {formattedRows.map((rowObj) => (
            <div key={rowObj.rowLabel} className="flex items-center gap-2 sm:gap-3">
              {/* Row Label */}
              <span className="w-5 sm:w-6 text-center font-mono font-bold text-[10px] sm:text-xs text-slate-400">
                {rowObj.rowLabel}
              </span>

              {/* Row Seats */}
              <div className="flex items-center gap-1.5 sm:gap-2">
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
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-mono font-bold flex flex-col items-center justify-center transition-all ${btnStyle}`}
                      title={`Row ${rowObj.rowLabel} Seat ${seat.seatNumber || sIdx + 1} — ₹${seat.price || 1500}`}
                    >
                      <span>{seat.seatNumber || sIdx + 1}</span>
                    </button>
                  );
                })}
              </div>

              <span className="w-5 sm:w-6 text-center font-mono font-bold text-[10px] sm:text-xs text-slate-400">
                {rowObj.rowLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Lock Expiry Countdown Banner */}
      {lockExpiresAt && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <FiClock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
            <span>Seats Reserved Temporarily. Complete checkout before timer expires!</span>
          </div>
          <div className="font-mono font-bold text-sm sm:text-base bg-amber-100 px-3 py-1 rounded-xl border border-amber-300 self-end sm:self-auto">
            {formatTime(timeLeft)}
          </div>
        </div>
      )}

      {/* Selection Summary Footer */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">Selected Seats ({selectedSeats.length}/6 max)</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {selectedSeats.length > 0 ? (
              selectedSeats.map((s) => (
                <span
                  key={s.seatId}
                  className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  {s.row || 'Row'}-{s.seatNumber || s.seatId}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 italic">No seats selected yet</span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6 w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-end sm:text-right gap-2">
            <span className="text-xs text-slate-500 sm:hidden">Total:</span>
            <p className="text-lg sm:text-xl font-bold text-slate-900">₹{totalPrice.toLocaleString('en-IN')}</p>
          </div>

          <button
            disabled={selectedSeats.length === 0 || loading}
            onClick={onConfirmLock}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01] text-center"
          >
            {loading ? 'Locking Seats...' : 'Confirm & Reserve Seats'}
          </button>
        </div>
      </div>
    </div>
  );
};
