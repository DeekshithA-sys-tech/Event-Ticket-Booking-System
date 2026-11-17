/**
 * @file bookingSlice.js
 * @description Redux slice for managing visual seat selection, seat lock timer (10 mins),
 * active event selection, and checkout state.
 */

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  activeEvent: null,
  selectedSeats: [], // Array of seat objects { seatId, row, seatNumber, price }
  lockedSeats: [],   // Confirmed seat locks from backend
  lockExpiresAt: null, // Timestamp when the 10-minute lock expires
  confirmedBooking: null,
};

const bookingSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    setActiveEvent: (state, action) => {
      state.activeEvent = action.payload;
    },
    toggleSeatSelection: (state, action) => {
      const seat = action.payload;
      const index = state.selectedSeats.findIndex((s) => s.seatId === seat.seatId);
      if (index >= 0) {
        state.selectedSeats.splice(index, 1);
      } else {
        // Max 6 seats per booking limit
        if (state.selectedSeats.length < 6) {
          state.selectedSeats.push(seat);
        }
      }
    },
    clearSeatSelection: (state) => {
      state.selectedSeats = [];
    },
    setSeatsLocked: (state, action) => {
      const { seats, expiresAt } = action.payload;
      state.lockedSeats = seats;
      state.lockExpiresAt = expiresAt || Date.now() + 10 * 60 * 1000; // 10 minutes
    },
    setConfirmedBooking: (state, action) => {
      state.confirmedBooking = action.payload;
      state.selectedSeats = [];
      state.lockedSeats = [];
      state.lockExpiresAt = null;
    },
    resetBookingState: (state) => {
      state.activeEvent = null;
      state.selectedSeats = [];
      state.lockedSeats = [];
      state.lockExpiresAt = null;
      state.confirmedBooking = null;
    },
  },
});

export const {
  setActiveEvent,
  toggleSeatSelection,
  clearSeatSelection,
  setSeatsLocked,
  setConfirmedBooking,
  resetBookingState,
} = bookingSlice.actions;

export default bookingSlice.reducer;
