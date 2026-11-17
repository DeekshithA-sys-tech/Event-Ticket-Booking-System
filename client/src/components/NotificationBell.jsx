import { useState, useEffect } from 'react';
import { FiBell, FiCheck, FiInfo } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import axios from 'axios';

export const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/v1/notifications?limit=5');
      if (res.data?.data) {
        setNotifications(res.data.data.notifications || []);
        setUnreadCount(res.data.data.unreadCount || 0);
      }
    } catch (_err) {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // 1-min polling
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await axios.patch(`/api/v1/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (_err) {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.patch('/api/v1/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (_err) {
      // Ignore
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
        title="Notifications"
      >
        <FiBell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-xl py-3 z-50 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          <div className="px-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.length > 0 ? (
              notifications.map((n) => (
                <div
                  key={n._id}
                  className={`p-3.5 flex items-start gap-3 transition-colors ${
                    n.isRead
                      ? 'bg-white dark:bg-slate-900 opacity-70'
                      : 'bg-indigo-50/40 dark:bg-indigo-950/20'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0 text-xs">
                    <FiInfo className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{n.title}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                    {n.link && (
                      <Link
                        to={n.link}
                        onClick={() => setIsOpen(false)}
                        className="inline-block text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-1 hover:underline"
                      >
                        View Details →
                      </Link>
                    )}
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(n._id, e)}
                      title="Mark as read"
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <FiCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
