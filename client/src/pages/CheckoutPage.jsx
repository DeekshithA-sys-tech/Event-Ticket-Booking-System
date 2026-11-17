import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { FiCheckCircle, FiShield, FiCreditCard, FiDownload, FiArrowLeft } from 'react-icons/fi';
import { bookingService } from '../services/bookingService.js';
import { setConfirmedBooking, resetBookingState } from '../store/bookingSlice.js';
import toast from 'react-hot-toast';

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { activeEvent, lockedSeats, selectedSeats } = useSelector((state) => state.booking);
  const { user } = useSelector((state) => state.auth);

  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [submitting, setSubmitting] = useState(false);
  const [successBooking, setSuccessBooking] = useState(null);

  const seatsToBook = lockedSeats.length > 0 ? lockedSeats : selectedSeats;
  const totalPrice = seatsToBook.reduce((sum, s) => sum + s.price, 0);

  const handleConfirmPayment = async () => {
    if (!activeEvent || seatsToBook.length === 0) {
      toast.error('No locked seats found. Please select seats again.');
      navigate('/events');
      return;
    }

    try {
      setSubmitting(true);
      const seatIds = seatsToBook.map((s) => s.seatId);

      const res = await bookingService.confirmBooking({
        eventId: activeEvent._id,
        seatIds,
      });

      const confirmedData = res.data?.booking || res.data;
      dispatch(setConfirmedBooking(confirmedData));
      setSuccessBooking(confirmedData);
      toast.success('🎉 Booking Confirmed! Ticket sent to your email.');
    } catch (_err) {
      // Handled by toast
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!successBooking) return;
    try {
      const response = await bookingService.downloadTicketPdf(successBooking.bookingId);
      const url = window.URL.createObjectURL(new Blob([response]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ticket-${successBooking.bookingId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      toast.success('PDF Ticket Downloaded!');
    } catch (_err) {
      toast.error('Failed to download PDF ticket.');
    }
  };

  if (successBooking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-8">
        <div className="bg-white p-8 sm:p-12 rounded-3xl border border-emerald-200 shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200 animate-bounce">
            <FiCheckCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900">Booking Confirmed!</h1>
            <p className="text-sm text-slate-600">
              Your tickets have been reserved and sent to <span className="text-indigo-600 font-semibold">{user?.email}</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono space-y-1">
            <p className="text-slate-500">Booking ID</p>
            <p className="text-base font-bold text-indigo-600">{successBooking.bookingId}</p>
          </div>

          {/* QR Preview */}
          {successBooking.qrCode && (
            <div className="flex flex-col items-center justify-center pt-2">
              <img
                src={successBooking.qrCode}
                alt="Ticket QR Code"
                className="w-32 h-32 rounded-2xl bg-white p-2 shadow-md border border-slate-200"
              />
              <span className="text-[11px] text-slate-500 mt-2">Scan at venue entrance</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={handleDownloadPdf}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2"
            >
              <FiDownload className="w-4 h-4" /> Download PDF Ticket
            </button>

            <Link
              to="/my-bookings"
              onClick={() => dispatch(resetBookingState())}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              View My Bookings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!activeEvent || seatsToBook.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-900">No active booking session found</h2>
        <Link to="/events" className="text-indigo-600 text-xs hover:underline">
          Return to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <FiArrowLeft className="w-4 h-4" /> Back to Seat Selection
        </button>
        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
          Step 2 of 2 — Payment & Confirmation
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: Payment Method Simulation */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FiCreditCard className="w-4 h-4 text-indigo-600" /> Select Payment Method
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`p-4 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                  paymentMethod === 'upi'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-xs font-bold">UPI / QR Code</span>
                <span className="text-[10px] text-slate-500">Google Pay, PhonePe, Paytm</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-4 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                  paymentMethod === 'card'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-xs font-bold">Credit / Debit Card</span>
                <span className="text-[10px] text-slate-500">Visa, Mastercard, RuPay</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('netbanking')}
                className={`p-4 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                  paymentMethod === 'netbanking'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-xs font-bold">Net Banking</span>
                <span className="text-[10px] text-slate-500">HDFC, ICICI, SBI, Axis</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <FiShield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Transactions are secured with 256-bit SSL encryption & atomic lock verification.</span>
          </div>
        </div>

        {/* Right: Booking Order Summary */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-md space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Order Summary
            </h3>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-slate-900">{activeEvent.title}</p>
              <p className="text-slate-500">
                {activeEvent.venue}, {activeEvent.city}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <span className="text-slate-500 block">Reserved Seats:</span>
              <div className="flex flex-wrap gap-1.5">
                {seatsToBook.map((s) => (
                  <span
                    key={s.seatId}
                    className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                  >
                    {s.row}-{s.seatNumber}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">Total Payable</span>
              <span className="text-xl font-bold text-slate-900">₹{totalPrice.toLocaleString('en-IN')}</span>
            </div>

            <button
              disabled={submitting}
              onClick={handleConfirmPayment}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {submitting ? 'Processing Transaction...' : 'Pay & Confirm Booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
