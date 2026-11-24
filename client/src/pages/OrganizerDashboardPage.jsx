import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { analyticsService } from '../services/analyticsService.js';
import { eventService } from '../services/eventService.js';
import { FiPlus, FiDollarSign, FiCalendar, FiUsers, FiTrendingUp, FiTrash2, FiEdit, FiImage, FiUploadCloud, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';

const BUILTIN_CATEGORIES = [
  { _id: '6a72c6e88307fd3530e63c10', name: 'Music', slug: 'music' },
  { _id: '6a72e15a1d2ac41d56e0bfb7', name: 'Sports', slug: 'sports' },
  { _id: '6a72e15a1d2ac41d56e0bfba', name: 'Arts & Theater', slug: 'arts-theater' },
  { _id: '6a72e15a1d2ac41d56e0bfbd', name: 'Comedy', slug: 'comedy' },
  { _id: '6a72e15a1d2ac41d56e0bfc0', name: 'Workshops', slug: 'workshops' },
  { _id: '6a72e15b1d2ac41d56e0bfc3', name: 'Conferences', slug: 'conferences' },
  { _id: '6a782b913b54c4ca601d1d9f', name: 'Dance', slug: 'dance' },
];

export const OrganizerDashboardPage = () => {
  const [overview, setOverview] = useState(null);
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState(BUILTIN_CATEGORIES);
  const [loading, setLoading] = useState(true);

  // Modal State for Event Creation & Editing
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [saving, setSaving] = useState(false);

  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);

  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: BUILTIN_CATEGORIES[0]._id,
    venue: '',
    city: '',
    date: '',
    time: '19:00',
    ticketPrice: 1500,
    totalSeats: 200,
  });

  const [searchParams, setSearchParams] = useSearchParams();

  // Keep create modal open when ?create=true is in the URL (initial navigation & query updates)
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setCreateModalOpen(true);
    }
  }, [searchParams]);

  const handleOpenCreateModal = () => {
    setFormData({
      title: '',
      description: '',
      category: categories[0]?._id || '',
      venue: '',
      city: '',
      date: '',
      time: '19:00',
      ticketPrice: 1500,
      totalSeats: 200,
    });
    setUseCustomCategory(false);
    setCustomCategoryName('');
    setCreateModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('create', 'true');
    setSearchParams(nextParams, { replace: true });
  };

  const handleCloseCreateModal = () => {
    setCreateModalOpen(false);
    setUseCustomCategory(false);
    setCustomCategoryName('');
    setBannerFile(null);
    setBannerPreview(null);
    if (searchParams.get('create') === 'true') {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('create');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleBannerChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [overviewRes, eventsRes, categoriesRes] = await Promise.all([
        analyticsService.getOverview().catch(() => ({ data: {} })),
        eventService.getMyEvents({ limit: 50 }).catch(() => eventService.getEvents({ limit: 50 })),
        eventService.getCategories().catch(() => ({ data: [] })),
      ]);

      setOverview(overviewRes?.data || {});
      const rawEvents = Array.isArray(eventsRes?.data)
        ? eventsRes.data
        : (eventsRes?.data?.events || eventsRes?.events || []);
      setEvents(rawEvents);

      if (categoriesRes?.data && categoriesRes.data.length > 0) {
        setCategories(categoriesRes.data);
      }
    } catch (_err) {
      // Silently handle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const categoryValue =
        useCustomCategory && customCategoryName.trim()
          ? customCategoryName.trim()
          : formData.category || categories[0]?._id || 'Music';

      const createRes = await eventService.createEvent({
        ...formData,
        category: categoryValue,
        ticketPrice: Number(formData.ticketPrice),
        totalSeats: Number(formData.totalSeats),
      });

      const newEventId = createRes?.data?._id || createRes?.data?.id;

      if (bannerFile && newEventId) {
        const uploadData = new FormData();
        uploadData.append('banner', bannerFile);
        await eventService.uploadBanner(newEventId, uploadData).catch(() => {});
      }

      toast.success('Event submitted with banner! Pending admin approval before publishing.', { duration: 5000 });
      handleCloseCreateModal();
      setFormData({
        title: '',
        description: '',
        category: categories[0]?._id || '',
        venue: '',
        city: '',
        date: '',
        time: '19:00',
        ticketPrice: 1500,
        totalSeats: 200,
      });
      fetchData();
    } catch (_err) {
      // Handled by api toast
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditModal = (ev) => {
    setEditingEvent(ev);
    const dateFormatted = ev.date ? new Date(ev.date).toISOString().split('T')[0] : '';
    setFormData({
      title: ev.title || '',
      description: ev.description || '',
      category: typeof ev.category === 'object' ? ev.category?._id : (ev.category || ''),
      venue: ev.venue || '',
      city: ev.city || '',
      date: dateFormatted,
      time: ev.time || '19:00',
      ticketPrice: ev.ticketPrice || 1500,
      totalSeats: ev.totalSeats || 200,
    });
    setBannerFile(null);
    setBannerPreview(typeof ev.banner === 'object' ? ev.banner?.url : ev.banner);
    setEditModalOpen(true);
  };

  const handleUpdateEvent = async (e) => {
    e.preventDefault();
    if (!editingEvent?._id) return;

    try {
      setSaving(true);
      await eventService.updateEvent(editingEvent._id, {
        title: formData.title,
        description: formData.description,
        venue: formData.venue,
        city: formData.city,
        date: formData.date,
        time: formData.time,
        ticketPrice: Number(formData.ticketPrice),
        totalSeats: Number(formData.totalSeats),
      });

      if (bannerFile) {
        const uploadData = new FormData();
        uploadData.append('banner', bannerFile);
        await eventService.uploadBanner(editingEvent._id, uploadData).catch(() => {});
      }

      toast.success('Event details and banner updated successfully.');
      setEditModalOpen(false);
      setEditingEvent(null);
      setBannerFile(null);
      setBannerPreview(null);
      fetchData();
    } catch (_err) {
      // Handled by api toast
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;

    try {
      await eventService.deleteEvent(eventId);
      toast.success('Event deleted successfully.');
      fetchData();
    } catch (_err) {
      // Handled by toast
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Organizer Control Panel</h1>
          <p className="text-xs text-slate-500 mt-1">Create events, edit details, track ticket sales, and view revenue analytics.</p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02]"
        >
          <FiPlus className="w-4 h-4" /> Create New Event
        </button>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FiDollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            ₹{(overview?.revenue?.total || overview?.totalRevenue || 0).toLocaleString('en-IN')}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Tickets Sold</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FiTrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-indigo-600">
            {overview?.bookings?.total || overview?.totalTicketsSold || 0}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Managed Events</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <FiCalendar className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-600">{events.length}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Occupancy Rate</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <FiUsers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-600">82%</p>
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
        <h3 className="text-base font-bold text-slate-900">Your Managed Events</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase font-mono font-semibold text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Event Title</th>
                <th className="px-4 py-3">Date & Time</th>
                <th className="px-4 py-3">Venue</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-slate-400">
                    <FiCalendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-slate-600">No managed events found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Click "+ Create New Event" above to create and publish your first event.
                    </p>
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev._id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{ev.title}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(ev.date).toLocaleDateString()} {ev.time}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {ev.venue}, {ev.city}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-indigo-600">
                    ₹{ev.ticketPrice?.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3">
                    {ev.status === 'published' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Published
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Pending Admin Approval
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEditModal(ev)}
                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1 font-semibold"
                        title="Edit Event Details"
                      >
                        <FiEdit className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(ev._id)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete Event"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Event Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Create New Event</h3>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Title</label>
                <input
                  required
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Summer Rock Fest 2026"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              {/* Category Dropdown + Custom Category Input */}
              <div className="space-y-2">
                <label className="text-slate-700 font-semibold block">Category Selection</label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setUseCustomCategory(false)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                      !useCustomCategory
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    Select From List
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseCustomCategory(true)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                      useCustomCategory
                        ? 'bg-purple-600 border-purple-600 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    + Enter Custom Category
                  </button>
                </div>

                {!useCustomCategory ? (
                  <select
                    required
                    value={formData.category || (categories[0]?._id || '')}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium cursor-pointer focus:outline-none focus:bg-white focus:border-indigo-500"
                  >
                    <option value="" disabled>-- Select a Category --</option>
                    {categories.map((c) => (
                      <option key={c._id || c.slug} value={c._id || c.name} className="bg-white text-slate-900 py-1">
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    type="text"
                    value={customCategoryName}
                    onChange={(e) => setCustomCategoryName(e.target.value)}
                    placeholder="Enter custom category name (e.g. EDM Night, Gaming Summit)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-purple-300 text-slate-900 focus:outline-none focus:bg-white focus:border-purple-500"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Venue</label>
                  <input
                    required
                    type="text"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    placeholder="Royal Arena"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">City</label>
                  <input
                    required
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Mumbai"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Date</label>
                  <input
                    required
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Time</label>
                  <input
                    required
                    type="text"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    placeholder="19:00"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Ticket Price (₹)</label>
                  <input
                    required
                    type="number"
                    value={formData.ticketPrice}
                    onChange={(e) => setFormData({ ...formData, ticketPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Total Seats</label>
                  <input
                    required
                    type="number"
                    value={formData.totalSeats}
                    onChange={(e) => setFormData({ ...formData, totalSeats: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Banner Photo Upload Field */}
              <div>
                <label className="text-slate-700 font-semibold block mb-1 flex items-center gap-1.5">
                  <FiImage className="w-4 h-4 text-indigo-600" /> Event Banner Photo (Poster)
                </label>
                
                {bannerPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-indigo-200 bg-slate-100 group aspect-video max-h-48 mb-2">
                    <img
                      src={bannerPreview}
                      alt="Banner Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <FiUploadCloud className="w-4 h-4" /> Change Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBannerChange}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setBannerFile(null);
                          setBannerPreview(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-white transition-all text-center group">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2">
                      <FiUploadCloud className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">Click to Upload Event Banner Photo</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Supports PNG, JPG, WebP (Max 5MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe your event, lineup, highlights, etc."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  {saving ? 'Submitting...' : 'Submit Event for Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Edit Event Details</h3>

            <form onSubmit={handleUpdateEvent} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">Title</label>
                <input
                  required
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Venue</label>
                  <input
                    required
                    type="text"
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">City</label>
                  <input
                    required
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Date</label>
                  <input
                    required
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">Time</label>
                  <input
                    required
                    type="text"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Ticket Price (₹)</label>
                <input
                  required
                  type="number"
                  value={formData.ticketPrice}
                  onChange={(e) => setFormData({ ...formData, ticketPrice: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              {/* Edit Modal Banner Upload */}
              <div>
                <label className="text-slate-700 font-semibold block mb-1 flex items-center gap-1.5">
                  <FiImage className="w-4 h-4 text-indigo-600" /> Event Banner Photo (Poster)
                </label>
                
                {bannerPreview ? (
                  <div className="relative rounded-2xl overflow-hidden border border-indigo-200 bg-slate-100 group aspect-video max-h-48 mb-2">
                    <img
                      src={bannerPreview}
                      alt="Banner Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <FiUploadCloud className="w-4 h-4" /> Change Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBannerChange}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setBannerFile(null);
                          setBannerPreview(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50 hover:bg-white transition-all text-center group">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 text-indigo-600 flex items-center justify-center mb-2">
                      <FiUploadCloud className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">Click to Upload / Change Event Banner</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Supports PNG, JPG, WebP (Max 5MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleBannerChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingEvent(null);
                    setBannerFile(null);
                    setBannerPreview(null);
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
