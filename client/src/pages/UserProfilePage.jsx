import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { userService } from '../services/userService.js';
import { fetchCurrentUser } from '../store/authSlice.js';
import { FiUser, FiMail, FiPhone, FiCamera, FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';

export const UserProfilePage = () => {
  const dispatch = useDispatch();
  const authUser = useSelector((state) => state.auth.user);

  const [profile, setProfile] = useState(authUser);
  const [stats, setStats] = useState(null);
  const [name, setName] = useState(authUser?.name || '');
  const [phone, setPhone] = useState(authUser?.phone || '');
  const [loading, setLoading] = useState(!authUser);
  const [updating, setUpdating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Synchronize state if Redux authUser updates
  useEffect(() => {
    if (authUser) {
      setProfile((prev) => prev || authUser);
      setName((prev) => prev || authUser.name || '');
      setPhone((prev) => prev || authUser.phone || '');
    }
  }, [authUser]);

  const fetchProfile = async () => {
    try {
      if (!profile) setLoading(true);
      const res = await userService.getMyProfile();
      const user = res.data?.user || res.data;
      setProfile(user);
      setStats(res.data?.stats || {});
      setName(user.name || '');
      setPhone(user.phone || '');
    } catch (_err) {
      toast.error('Failed to load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await userService.uploadAvatar(formData);
      toast.success('Profile picture updated successfully!');
      setProfile((prev) => ({ ...prev, avatar: res.data?.avatar || prev?.avatar }));
      dispatch(fetchCurrentUser());
    } catch (_err) {
      // Toast handled by API interceptor
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      setUpdating(true);
      const formattedPhone = phone.trim() ? phone.trim() : null;

      await userService.updateMyProfile({
        name: name.trim(),
        phone: formattedPhone,
      });

      toast.success('Profile updated successfully!');
      fetchProfile();
      dispatch(fetchCurrentUser());
    } catch (_err) {
      // Handled by toast
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Account Profile & Settings</h1>
        <p className="text-xs text-slate-500 mt-1">Manage personal info and view account statistics.</p>
      </div>

      {/* Stats Header Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs text-slate-500 font-medium">Total Bookings</span>
            <p className="text-2xl font-bold text-slate-900">{stats.totalBookings || 0}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs text-slate-500 font-medium">Upcoming Events</span>
            <p className="text-2xl font-bold text-indigo-600">{stats.upcomingEvents || 0}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs text-slate-500 font-medium">Past Attended</span>
            <p className="text-2xl font-bold text-emerald-600">{stats.pastEvents || 0}</p>
          </div>
        </div>
      )}

      {/* Profile Form */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <form onSubmit={handleUpdateProfile} className="space-y-6">
          {/* Avatar Upload */}
          <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
            <div className="relative group">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-200 shadow-sm"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-2xl shadow-sm">
                  {profile?.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 bg-slate-900/60 rounded-2xl opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity text-white text-[10px] font-semibold"
              >
                <FiCamera className="w-6 h-6 mb-1" />
                <span>{uploadingAvatar ? 'Uploading...' : 'Change'}</span>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <p className="text-sm font-bold text-slate-900">{profile?.name || authUser?.name}</p>
              <p className="text-xs text-slate-500">{profile?.email || authUser?.email}</p>
              <span className="inline-block mt-2 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                Role: {profile?.role || authUser?.role}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
              <div className="relative">
                <FiUser className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Phone Number (Optional)</label>
              <div className="relative">
                <FiPhone className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+919876543210 or 9876543210"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
            <div className="relative">
              <FiMail className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                disabled
                type="email"
                value={profile?.email || authUser?.email || ''}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-400 cursor-not-allowed font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              disabled={updating}
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all hover:scale-[1.02]"
            >
              <FiCheck className="w-4 h-4" /> {updating ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
