import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout.jsx';
import { ProtectedRoute } from '../components/ProtectedRoute.jsx';

import { HomePage } from '../pages/HomePage.jsx';
import { EventsListPage } from '../pages/EventsListPage.jsx';
import { EventDetailPage } from '../pages/EventDetailPage.jsx';
import { SeatSelectionPage } from '../pages/SeatSelectionPage.jsx';
import { CheckoutPage } from '../pages/CheckoutPage.jsx';
import { MyBookingsPage } from '../pages/MyBookingsPage.jsx';
import { UserProfilePage } from '../pages/UserProfilePage.jsx';
import { SearchPage } from '../pages/SearchPage.jsx';
import { LoginPage } from '../pages/LoginPage.jsx';
import { RegisterPage } from '../pages/RegisterPage.jsx';
import { OrganizerDashboardPage } from '../pages/OrganizerDashboardPage.jsx';
import { AdminDashboardPage } from '../pages/AdminDashboardPage.jsx';
import { NotFoundPage } from '../pages/NotFoundPage.jsx';
import { VerifyEmailPage } from '../pages/VerifyEmailPage.jsx';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        {/* Public Routes */}
        <Route index element={<HomePage />} />
        <Route path="events" element={<EventsListPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />

        {/* Customer Protected Routes */}
        <Route
          path="events/:id/select-seats"
          element={
            <ProtectedRoute>
              <SeatSelectionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="checkout"
          element={
            <ProtectedRoute>
              <CheckoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-bookings"
          element={
            <ProtectedRoute>
              <MyBookingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <UserProfilePage />
            </ProtectedRoute>
          }
        />

        {/* Organizer Protected Routes */}
        <Route
          path="organizer/dashboard"
          element={
            <ProtectedRoute allowedRoles={['organizer', 'admin']}>
              <OrganizerDashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Admin Protected Routes */}
        <Route
          path="admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
