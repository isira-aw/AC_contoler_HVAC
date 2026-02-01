'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

interface HeaderProps {
  // Optional device info for device detail pages
  deviceName?: string;
  deviceLocation?: string;
  deviceOnline?: boolean;
  showDeviceStatus?: boolean;
}

export default function Header({
  deviceName,
  deviceLocation,
  deviceOnline,
  showDeviceStatus = false,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <header className="bg-primary text-white py-4 px-4 md:px-6 shadow-lg sticky top-0 z-50 w-full">
      <div className="w-full md:max-w-7xl md:mx-auto flex justify-between items-center">
        {/* Left side - Logo and optional device info */}
        <div className="flex items-center space-x-3 md:space-x-4">
          <span className="text-lg md:text-xl font-bold">Smart HVAC</span>

          {showDeviceStatus && deviceName && (
            <div className="border-l border-white/30 pl-3 md:pl-4">
              <h1 className="text-base md:text-xl font-bold truncate max-w-[120px] sm:max-w-none">
                {deviceName}
              </h1>
              {deviceLocation && (
                <p className="text-xs md:text-sm opacity-75 hidden sm:block">
                  {deviceLocation}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Desktop menu */}
        <div className="hidden md:flex items-center space-x-4">
          <Link
            href="/dashboard"
            className="bg-white/10 px-2 py-2 rounded text-center"
          >
            Dashboard
          </Link>

          {user && <span>{user.username}</span>}

          {showDeviceStatus && (
            <div className={`flex items-center space-x-2 ${deviceOnline ? 'text-green-300' : 'text-red-300'}`}>
              <div className={`w-3 h-3 rounded-full ${deviceOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span>{deviceOnline ? 'Online' : 'Offline'}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="bg-white text-primary px-4 py-2 rounded-lg hover:bg-gray-100 text-center"
          >
            Logout
          </button>

          <Link href="/" className="text-white px-4 py-2 rounded-lg hover:bg-white/10">
            <i className="lni lni-home text-xl md:text-2xl"></i>
          </Link>
        </div>

        {/* Mobile - Status indicator (if applicable) and hamburger */}
        <div className="flex md:hidden items-center space-x-3">
          {showDeviceStatus && (
            <div className={`w-3 h-3 rounded-full ${deviceOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
          )}
          <button
            className="p-2 hover:opacity-75"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <i className={`lni ${mobileMenuOpen ? 'lni-close' : 'lni-menu'} text-xl`}></i>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-4 pt-4 border-t border-white/20">
          <div className="flex flex-col space-y-3">
            {showDeviceStatus && deviceLocation && (
              <div className="flex items-center justify-between px-2">
                <span className="text-sm opacity-75">{deviceLocation}</span>
                <span className={`text-sm ${deviceOnline ? 'text-green-300' : 'text-red-300'}`}>
                  {deviceOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            )}

            <Link
              href="/dashboard"
              className="px-2 py-2 bg-white/10 rounded text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>

            {user && (
              <span className="px-2 py-2 font-medium text-center">
                <i className="lni lni-user mr-2 text-sm"></i>
                <span>{user.username}</span>
              </span>
            )}

            <button
              onClick={handleLogout}
              className="bg-white text-primary px-4 py-2 rounded hover:bg-gray-100 text-center"
            >
              Logout
            </button>

            <Link
              href="/"
              className="px-2 py-2 hover:bg-white/10 rounded text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              <i className="lni lni-home text-xl md:text-2xl"></i>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
