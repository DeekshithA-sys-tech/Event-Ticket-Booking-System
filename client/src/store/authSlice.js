/**
 * @file authSlice.js
 * @description Redux slice for managing user authentication state, tokens, and roles.
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authService } from '../services/authService.js';

const getCachedUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw && raw !== 'undefined' ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
};

const cachedUser = getCachedUser();
const cachedToken = localStorage.getItem('accessToken') || null;

const initialState = {
  user: cachedUser,
  accessToken: cachedToken,
  isAuthenticated: !!(cachedUser && cachedToken),
  role: cachedUser?.role || 'customer',
  loading: false,
  error: null,
};

export const loginUser = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async (data, { rejectWithValue }) => {
    try {
      const response = await authService.register(data);
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getMe();
      return response.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await authService.logout();
  } catch (_err) {
    // Ignore logout API failures
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.accessToken = accessToken;
      state.isAuthenticated = true;
      state.role = user.role;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', accessToken);
    },
    clearCredentials: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.role = 'customer';
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        const { user, accessToken } = action.payload;
        state.loading = false;
        state.user = user;
        state.accessToken = accessToken;
        state.isAuthenticated = true;
        state.role = user.role;
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('accessToken', accessToken);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        const { user, accessToken } = action.payload;
        state.loading = false;
        state.user = user;
        state.accessToken = accessToken;
        state.isAuthenticated = true;
        state.role = user.role;
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('accessToken', accessToken);
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch Current User
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.role = action.payload.user.role;
        localStorage.setItem('user', JSON.stringify(action.payload.user));
      })
      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.role = 'customer';
      });
  },
});

export const { setCredentials, clearCredentials } = authSlice.actions;
export default authSlice.reducer;
