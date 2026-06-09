import React, { useState, useRef, useEffect } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaBell,
  FaCheck,
  FaTimes,
  FaEnvelope,
  FaClock,
  FaExclamationTriangle,
  FaCheckCircle,
  FaHistory,
  FaChevronRight,
  FaExternalLinkAlt,
  FaTrash
} from 'react-icons/fa';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const dropdownRef = useRef(null);
  const bellRef = useRef(null);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAllNotifications,
    wsConnected
  } = useNotification();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          bellRef.current && !bellRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    setIsOpen(false);

    // Navigate based on notification type
    if (notification.matchId) {
      navigate(`/player/matchlisting?match=${notification.matchId}`);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'result_submitted':
        return <FaEnvelope className="h-4 w-4 text-blue-500" />;
      case 'result_confirmation':
        return <FaCheckCircle className="h-4 w-4 text-green-500" />;
      case 'result_dispute':
        return <FaExclamationTriangle className="h-4 w-4 text-red-500" />;
      case 'match_reminder':
        return <FaClock className="h-4 w-4 text-yellow-500" />;
      case 'result_submitted_sent':
        return <FaCheck className="h-4 w-4 text-gray-500" />;
      default:
        return <FaEnvelope className="h-4 w-4 text-gray-500" />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'result_submitted':
        return 'bg-blue-50 border-l-4 border-blue-500';
      case 'result_confirmation':
        return 'bg-green-50 border-l-4 border-green-500';
      case 'result_dispute':
        return 'bg-red-50 border-l-4 border-red-500';
      case 'match_reminder':
        return 'bg-yellow-50 border-l-4 border-yellow-500';
      default:
        return 'bg-gray-50 border-l-4 border-gray-400';
    }
  };

  const formatTime = (timeString) => {
    try {
      const time = new Date(timeString);
      const now = new Date();
      const diffMs = now - time;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return time.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Recently';
    }
  };

  const groupedNotifications = {
    unread: notifications.filter(n => !n.read),
    today: notifications.filter(n => {
      if (n.read) {
        try {
          const time = new Date(n.timestamp);
          const today = new Date();
          return time.toDateString() === today.toDateString();
        } catch (e) {
          return false;
        }
      }
      return false;
    }),
    older: notifications.filter(n => {
      if (n.read) {
        try {
          const time = new Date(n.timestamp);
          const today = new Date();
          return time.toDateString() !== today.toDateString();
        } catch (e) {
          return false;
        }
      }
      return false;
    })
  };

  const hasNotifications = notifications.length > 0;
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={toggleDropdown}
        className="relative p-2 text-[#132F45] hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <div className="relative">
          <FaBell className={`h-5 w-5 transition-transform duration-200 ${isAnimating ? 'animate-ring' : ''}`} />

          {hasUnread && (
            <span className="absolute -top-2 -right-2">
              <span className="relative flex h-5 w-5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-white text-xs items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </span>
            </span>
          )}

          {wsConnected && (
            <span
              className="absolute -bottom-1 -right-1 h-2 w-2 bg-green-500 rounded-full border border-white"
              title="WebSocket connected"
            ></span>
          )}
        </div>
      </button>

      <style>{`
        @keyframes ring {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(15deg); }
          50% { transform: rotate(-15deg); }
          75% { transform: rotate(15deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-ring {
          animation: ring 0.5s ease-in-out;
        }
      `}</style>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={dropdownRef}
            className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 animate-fadeIn"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-gray-800 text-lg">Notifications</h3>
                  {wsConnected && (
                    <span className="flex items-center text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      <span className="h-1.5 w-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                      Live
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {hasUnread && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAllAsRead();
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                  {hasNotifications && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clearAllNotifications();
                      }}
                      className="text-sm text-gray-500 hover:text-red-600 font-medium px-3 py-1 hover:bg-red-50 rounded-md transition-colors"
                      title="Clear all"
                    >
                      <FaTrash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-[500px] overflow-y-auto">
              {!hasNotifications ? (
                <div className="p-8 text-center">
                  <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaBell className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">No notifications yet</p>
                  <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                    You'll see updates about your matches, results, and reminders here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* Unread notifications */}
                  {groupedNotifications.unread.length > 0 && (
                    <div className="p-2 bg-blue-50/30">
                      <div className="px-3 py-2">
                        <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                          New ({groupedNotifications.unread.length})
                        </div>
                      </div>
                      {groupedNotifications.unread.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 hover:bg-blue-50 cursor-pointer transition-colors ${getNotificationColor(notification.type)}`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="mt-1 flex-shrink-0">
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                                <span className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                              {notification.score && (
                                <div className="mt-2 inline-flex items-center px-2.5 py-1 bg-gray-100 rounded-md text-xs font-medium text-gray-800">
                                  <FaExternalLinkAlt className="h-3 w-3 mr-1.5" />
                                  Score: {notification.score}
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-3">
                                <span className="text-xs text-gray-500">
                                  {formatTime(notification.timestamp)}
                                </span>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(notification.id);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 hover:bg-blue-100 rounded transition-colors"
                                  >
                                    Mark read
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeNotification(notification.id);
                                    }}
                                    className="text-gray-400 hover:text-red-500 p-1"
                                    title="Remove"
                                  >
                                    <FaTimes className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Today's read notifications */}
                  {groupedNotifications.today.length > 0 && (
                    <div className="p-2">
                      <div className="px-3 py-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Today
                        </div>
                      </div>
                      {groupedNotifications.today.map((notification) => (
                        <div
                          key={notification.id}
                          className="p-4 hover:bg-gray-50 cursor-pointer transition-colors border-l-4 border-transparent"
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="mt-1 flex-shrink-0 opacity-70">
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900">{notification.message}</p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-gray-500">
                                  {formatTime(notification.timestamp)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeNotification(notification.id);
                                  }}
                                  className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remove"
                                >
                                  <FaTimes className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Older notifications */}
                  {groupedNotifications.older.length > 0 && (
                    <div className="p-2">
                      <div className="px-3 py-2">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                          Older
                        </div>
                      </div>
                      {groupedNotifications.older.map((notification) => (
                        <div
                          key={notification.id}
                          className="p-4 hover:bg-gray-50 cursor-pointer transition-colors opacity-75"
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="mt-1 flex-shrink-0 opacity-50">
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 opacity-70">{notification.message}</p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-gray-500">
                                  {formatTime(notification.timestamp)}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeNotification(notification.id);
                                  }}
                                  className="text-gray-400 hover:text-red-500 p-1 opacity-50 hover:opacity-100 transition-opacity"
                                  title="Remove"
                                >
                                  <FaTimes className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {hasNotifications && (
              <div className="p-4 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <Link
                  to="/player/notifications"
                  onClick={() => setIsOpen(false)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium w-full text-center block hover:bg-blue-50 py-2 rounded-md transition-colors"
                >
                  View all notifications
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;