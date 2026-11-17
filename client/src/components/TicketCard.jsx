import { useState } from 'react';
import { FiDownload, FiCalendar, FiMapPin, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { bookingService } from '../services/bookingService.js';
import toast from 'react-hot-toast';

export const TicketCard = ({ booking, onCancel }) => {
  const [downloading, setDownloading] = useState(false);

  if (!booking) return null;

  const event = booking.event || {};
  const isConfirmed = booking.status === 'confirmed';

  const eventDate = event.date
  ? new Date(event.date).toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date TBA';

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const response = await bookingService.downloadTicketPdf(booking.bookingId);

      // Create blob link to download PDF
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ticket-${booking.bookingId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('PDF Ticket Downloaded!');
    } catch (_err) {
      toast.error('Failed to download PDF ticket.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-6 relative overflow-hidden">
      {/* Top Header Strip */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
            Booking ID
          </span>
          <p className="font-mono font-bold text-sm text-indigo-600">{booking.bookingId}</p>
        </div>

        <div className="flex items-center gap-2">
          {isConfirmed ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <FiCheckCircle className="w-3.5 h-3.5" /> Confirmed
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
              <FiXCircle className="w-3.5 h-3.5" /> Cancelled
            </span>
          )}
        </div>
      </div>

      {/* Main Details & QR Code */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2 space-y-3">
          <h3 className="text-lg font-bold text-slate-900 line-clamp-1">{event.title || 'Event Title'}</h3>

          <div className="space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <FiCalendar className="w-4 h-4 text-indigo-500" />
              <span>
                {eventDate} {event.time ? `at ${event.time}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <FiMapPin className="w-4 h-4 text-indigo-500" />
              <span>
                {event.venue}, {event.city}
              </span>
            </div>
          </div>

          {/* Seat Badges */}
          <div className="pt-2">
            <span className="text-[11px] text-slate-400 block mb-1">Seats Booked:</span>
            <div className="flex flex-wrap gap-1.5">
              {booking.seats?.map((s) => (
                <span
                  key={s.seatId || `${s.row}-${s.seatNumber}`}
                  className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200"
                >
                  Row {s.row} · Seat {s.seatNumber}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-50 border border-slate-200">
          {booking.qrCode ? (
            <img
              src={booking.qrCode}
              alt="Booking QR Code"
              className="w-28 h-28 object-contain rounded-xl bg-white p-1 shadow-sm border border-slate-100"
            />
          ) : (
            <div className="w-28 h-28 rounded-xl bg-slate-100 flex items-center justify-center text-xs text-slate-400">
              No QR
            </div>
          )}
          <span className="text-[10px] text-slate-500 mt-2">Scan at venue entrance</span>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center justify-between sm:justify-start sm:block">
          <span className="text-[10px] text-slate-400">Total Amount: </span>
          <span className="text-base font-bold text-slate-900 ml-1 sm:ml-0 sm:block">
            ₹{booking.totalAmount?.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {isConfirmed && onCancel && (
            <button
              onClick={() => onCancel(booking.bookingId)}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors text-center"
            >
              Cancel Booking
            </button>
          )}

          {isConfirmed && (
            <button
              disabled={downloading}
              onClick={handleDownloadPdf}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01]"
            >
              <FiDownload className="w-4 h-4 shrink-0" />
              <span>{downloading ? 'Generating PDF...' : 'Download Ticket PDF'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
