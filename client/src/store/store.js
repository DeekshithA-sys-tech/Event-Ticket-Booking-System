/**
 * @file store.js
 * @description Centralized Redux store configuration.
 */

import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice.js';
import bookingReducer from './bookingSlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    booking: bookingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});
