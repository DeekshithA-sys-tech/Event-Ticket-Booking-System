import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '../services/adminService.js';
import { eventService } from '../services/eventService.js';
import {
  FiShield,
  FiActivity,
  FiCheckCircle,
  FiFileText,
  FiUserCheck,
  FiCalendar,
  FiTrash2,
  FiSlash,
  FiLock,
} from 'react-icons/fi';
import toast from 'react-hot-toast';

export const AdminDashboardPage = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [eventFilter, setEventFilter] = useState('all'); // 'all' | 'pending' | 'published'
  const [dashboardStats, setDashboardStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      if (tabParam === 'events' || tabParam === 'events_approval') {
        setActiveTab('events_approval');
      } else if (['overview', 'pending', 'users', 'audit'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab === 'events_approval' ? 'events' : tab);
    setSearchParams(next, { replace: true });
  };

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [dashRes, usersRes, eventsRes, logsRes, healthRes] = await Promise.all([
        adminService.getDashboard().catch(() => ({ data: {} })),
        adminService.listUsers({ limit: 100 }).catch(() => ({ data: [] })),
        eventService.getEvents({ limit: 100, status: 'all' }).catch(() => ({ data: [] })),
        adminService.getAuditLogs({ limit: 20 }).catch(() => ({ data: [] })),
        adminService.getSystemHealth().catch(() => ({ data: null })),
      ]);

      setDashboardStats(dashRes?.data || {});
      setUsers(usersRes?.data || []);
      setEvents(eventsRes?.data || []);
      setAuditLogs(logsRes?.data || []);
      setHealth(healthRes?.data || null);
    } catch (_err) {
      // Silently handle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleApproveOrganizer = async (userId) => {
    try {
      await adminService.updateUserStatus(userId, {
        isActive: true,
        reason: 'Admin approved organizer account registration',
      });
      toast.success('Organizer account approved and activated successfully!');
      fetchAdminData();
    } catch (_err) {
      // Handled by toast
    }
  };

  const handleBlockOrganizer = async (userId) => {
    if (!window.confirm('Are you sure you want to block/suspend this organizer account?')) return;
    try {
      await adminService.updateUserStatus(userId, {
        isActive: false,
        reason: 'Admin blocked organizer account',
      });
      toast.success('Organizer account suspended successfully.');
      fetchAdminData();
    } catch (_err) {
      // Handled by toast
    }
  };

  const handleApproveEvent = async (eventId) => {
    try {
      await adminService.updateEventStatus(eventId, {
        status: 'published',
        reason: 'Admin approved and published event',
      });
      toast.success('Event approved and published to public catalog!');
      fetchAdminData();
    } catch (_err) {
      // Handled by toast
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      await eventService.deleteEvent(eventId);
      toast.success('Event deleted by admin.');
      fetchAdminData();
    } catch (_err) {
      // Handled by toast
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    try {
      await adminService.updateUserStatus(userId, {
        isActive: !currentStatus,
        reason: 'Admin status toggle',
      });
      toast.success(`User ${!currentStatus ? 'activated' : 'blocked/suspended'} successfully.`);
      fetchAdminData();
    } catch (_err) {
      // Handled by toast
    }
  };

  const handleChangeUserRole = async (userId, newRole) => {
    try {
      await adminService.updateUserRole(userId, { role: newRole });
      toast.success(`User role updated to ${newRole}.`);
      fetchAdminData();
    } catch (_err) {
      // Handled by toast
    }
  };

  const pendingOrganizers = users.filter((u) => u.role === 'organizer' && !u.isActive);
  const activeOrganizers = users.filter((u) => u.role === 'organizer' && u.isActive);
  const pendingEvents = events.filter((e) => e.status === 'draft');

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700">
            <FiShield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Platform Administration Console</h1>
            <p className="text-xs text-slate-500">System overview, organizer block/approve, event moderation, and audit trail.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 p-1 rounded-xl bg-white border border-slate-200 text-xs shadow-sm">
          <button
            onClick={() => handleTabChange('overview')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'overview'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => handleTabChange('events_approval')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'events_approval'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FiCalendar className="w-3.5 h-3.5" />
            Events ({events.length}) {pendingEvents.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {pendingEvents.length} Pending
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('pending')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FiUserCheck className="w-3.5 h-3.5" />
            Organizers ({pendingOrganizers.length} Pending)
          </button>
          <button
            onClick={() => handleTabChange('users')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'users'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            User Directory ({users.length})
          </button>
          <button
            onClick={() => handleTabChange('audit')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Audit Trail
          </button>
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-medium">Total Registered Users</span>
              <p className="text-2xl font-bold text-slate-900">{dashboardStats?.users?.total || users.length}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-medium">Pending Event Approvals</span>
              <p className="text-2xl font-bold text-amber-600">{pendingEvents.length}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-medium">Pending Organizers</span>
              <p className="text-2xl font-bold text-purple-600">{pendingOrganizers.length}</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs text-slate-500 font-medium">Gross Revenue</span>
              <p className="text-2xl font-bold text-emerald-600">
                ₹{(dashboardStats?.revenue?.total || 0).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Pending Event Approvals Section (Prominent Cards) */}
          <div className="bg-amber-50/50 p-6 sm:p-8 rounded-3xl border border-amber-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FiCheckCircle className="w-5 h-5 text-amber-600" /> Pending Event Approvals
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review and approve events submitted by organizers before they appear on the public catalog.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {pendingEvents.length} Waiting Review
              </span>
            </div>

            {pendingEvents.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pendingEvents.map((ev) => (
                  <div
                    key={ev._id}
                    className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-amber-400 space-y-4 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-slate-900">{ev.title}</h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Draft
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ev.description}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-slate-400 block">Category</span>
                        <span className="font-semibold text-indigo-700">
                          {typeof ev.category === 'object' ? ev.category?.name : (ev.category || 'General')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">City & Venue</span>
                        <span className="font-semibold text-slate-900">{ev.city} • {ev.venue}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Ticket Price</span>
                        <span className="font-semibold text-emerald-700 font-mono">₹{ev.ticketPrice} ({ev.totalSeats} seats)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleApproveEvent(ev._id)}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
                      >
                        <FiCheckCircle className="w-4 h-4" />
                        <span>Approve & Publish to Public</span>
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(ev._id)}
                        className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
                        title="Reject and delete event"
                      >
                        <FiTrash2 className="w-4 h-4" />
                        <span>Reject / Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500 shadow-sm">
                ✓ All events are approved! No pending event approval requests right now.
              </div>
            )}
          </div>

          {/* Pending Organizers Section (Prominent Cards) */}
          <div className="bg-purple-50/50 p-6 sm:p-8 rounded-3xl border border-purple-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FiUserCheck className="w-5 h-5 text-purple-600" /> Pending Organizer Registrations
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approve new organizers so they can access the Organizer Hub and create events.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                {pendingOrganizers.length} Pending Approval
              </span>
            </div>

            {pendingOrganizers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingOrganizers.map((org) => (
                  <div
                    key={org._id}
                    className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{org.name}</h4>
                      <p className="text-xs text-slate-500">{org.email}</p>
                      <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Registration Pending
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveOrganizer(org._id)}
                        className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/20 transition-all"
                      >
                        <FiCheckCircle className="w-3.5 h-3.5" />
                        <span>Approve Organizer</span>
                      </button>
                      <button
                        onClick={() => handleBlockOrganizer(org._id)}
                        className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold"
                        title="Reject organizer"
                      >
                        <FiSlash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500 shadow-sm">
                ✓ No pending organizer applications. All registered organizers are activated.
              </div>
            )}
          </div>

          {health && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FiActivity className="w-5 h-5 text-emerald-600" /> Infrastructure Health
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">MongoDB Database</span>
                  <p className="font-bold text-emerald-600">
                    Status: {health.checks?.database?.status} ({health.checks?.database?.latencyMs}ms)
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Redis Cache & Locks</span>
                  <p className="font-bold text-emerald-600">
                    Status: {health.checks?.redis?.status} ({health.checks?.redis?.latencyMs}ms)
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">BullMQ Email Queue</span>
                  <p className="font-bold text-indigo-600">
                    Active: {health.checks?.emailQueue?.active || 0} | Waiting: {health.checks?.emailQueue?.waiting || 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Events & Approvals */}
      {activeTab === 'events_approval' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FiCalendar className="w-5 h-5 text-indigo-600" /> Platform Events Catalog
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEventFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  eventFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({events.length})
              </button>
              <button
                onClick={() => setEventFilter('pending')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  eventFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                Pending Approvals ({pendingEvents.length})
              </button>
              <button
                onClick={() => setEventFilter('published')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  eventFilter === 'published'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                Published ({events.filter(e => e.status === 'published').length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-mono font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Event Title</th>
                  <th className="px-4 py-3">City & Venue</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Host</th>
                  <th className="px-4 py-3 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events
                  .filter((ev) => {
                    if (eventFilter === 'pending') return ev.status !== 'published';
                    if (eventFilter === 'published') return ev.status === 'published';
                    return true;
                  })
                  .map((ev) => {
                    const hostName = typeof ev.organizer === 'object' && ev.organizer?.name
                      ? ev.organizer.name
                      : (users.find((u) => u._id === ev.organizer || u._id === ev.organizer?._id)?.name || 'Organizer');

                    return (
                      <tr key={ev._id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">{ev.title}</td>
                        <td className="px-4 py-3 text-slate-500">{ev.venue}, {ev.city}</td>
                        <td className="px-4 py-3 text-slate-500">{new Date(ev.date).toLocaleDateString()} {ev.time}</td>
                        <td className="px-4 py-3">
                          {ev.status === 'published' ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Published
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Draft / Pending Approval
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] flex items-center justify-center font-bold">
                              {hostName.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-xs font-medium text-slate-800">{hostName}</span>
                          </div>
                        </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {ev.status !== 'published' && (
                          <button
                            onClick={() => handleApproveEvent(ev._id)}
                            className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1"
                          >
                            <FiCheckCircle className="w-3.5 h-3.5" /> Approve & Publish
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteEvent(ev._id)}
                          className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-bold flex items-center gap-1"
                          title="Delete Event"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" /> Delete Event
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Organizers Management */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FiUserCheck className="w-5 h-5 text-purple-600" /> Organizers Management & Approvals
            </h3>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
              {pendingOrganizers.length} Pending Approval
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-mono font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Organizer Name</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.filter(u => u.role === 'organizer').map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active & Approved
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Pending / Suspended
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!u.isActive ? (
                          <button
                            onClick={() => handleApproveOrganizer(u._id)}
                            className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1"
                          >
                            <FiCheckCircle className="w-3.5 h-3.5" /> Approve Organizer
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBlockOrganizer(u._id)}
                            className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-bold flex items-center gap-1"
                          >
                            <FiSlash className="w-3.5 h-3.5" /> Block / Suspend Organizer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: User Directory */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <h3 className="text-base font-bold text-slate-900">Platform User Directory</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-mono font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Account Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{u.name}</p>
                      <p className="text-slate-400 text-[11px]">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeUserRole(u._id, e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-slate-800 px-2 py-1 rounded-lg text-xs font-medium focus:outline-none"
                      >
                        <option value="customer">customer</option>
                        <option value="organizer">organizer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Blocked / Suspended
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleUserStatus(u._id, u.isActive)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                          u.isActive
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        {u.isActive ? 'Block / Suspend' : 'Approve / Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FiFileText className="w-5 h-5 text-purple-600" /> Immutable Audit Trail
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-mono font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-purple-600">{log.action}</td>
                    <td className="px-4 py-3 text-slate-800">{log.adminEmail}</td>
                    <td className="px-4 py-3 text-slate-500">{log.targetSummary || log.targetId}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
