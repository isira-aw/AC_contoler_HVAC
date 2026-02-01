'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { CloudIcon, DashboardIcon, UserIcon } from './Icons';

const NAV_ITEMS = ['What It Is', 'Features', 'How It Works', 'About Us', 'FAQ'];

export default function HomeHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const headerHeight = 80;
      const position = element.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({ top: position, behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <>
      <style jsx global>{`
        /* Mobile menu slide-down animation */
        .mobile-menu-wrap {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.35s cubic-bezier(.4,0,.2,1),
                      opacity 0.3s ease;
          opacity: 0;
        }
        .mobile-menu-wrap.open {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        .mobile-menu-inner {
          overflow: hidden;
        }
      `}</style>

      <header
        className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${isScrolled ? 'py-3 shadow-lg' : 'py-4'}`}
        style={{ backgroundColor: 'rgba(9, 65, 102, 0.97)', backdropFilter: 'blur(12px)' }}
      >
        {/* Solid fallback for older browsers */}
        <div className="absolute inset-0 -z-10" style={{ backgroundColor: '#094166' }} />

        <div className="max-w-7xl mx-auto px-4 md:px-6 flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-white">
            <CloudIcon className="w-7 h-7" />
            <span className="text-lg md:text-xl font-bold tracking-tight">Smart HVAC</span>
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase().replace(/\s+/g, '-'))}
                className="text-white/80 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg transition-all text-sm font-medium"
              >
                {item}
              </button>
            ))}

            <div className="border-l border-white pl-2">
              <Link
                href="/dashboard"
                className="text-white hover:bg-white/10 px-3 py-2 rounded text-sm font-medium"
              >
                Dashboard
              </Link>

              {user ? (
                <>
                  <span className="px-3 py-1 font-medium text-white">
                    {user.username}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="bg-white text-primary px-4 py-2 rounded-lg hover:bg-gray-100 text-center"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-white hover:bg-white/10 px-3 py-2 rounded text-sm font-medium"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="bg-white text-primary px-4 py-2 rounded-lg hover:bg-gray-100 font-medium"
                  >
                    Register
                  </Link>
                </>
              )}

              <Link
                href="/"
                className="bg-white/20 text-white px-4 py-2 rounded-lg hover:bg-white/30 ml-2"
              >
                <i className="lni lni-home text-xl"></i>
              </Link>
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden relative z-[101] w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            style={{ color: '#ffffff' }}
          >
            <i className={`lni ${mobileMenuOpen ? 'lni-close' : 'lni-menu'} text-xl`}></i>
          </button>
        </div>

        {/* Mobile menu dropdown (animated slide) */}
        <div className={`mobile-menu-wrap md:hidden ${mobileMenuOpen ? 'open' : ''}`}>
          <div className="mobile-menu-inner">
            <div className="mt-3 pt-4 border-t border-white/20 px-4 pb-4">
              {/* Nav section links */}
              <div className="flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      scrollToSection(item.toLowerCase().replace(/\s+/g, '-'));
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left text-white/90 hover:bg-white/10 active:bg-white/15 px-4 py-3 rounded-xl transition-colors font-medium text-sm"
                  >
                    {item}
                  </button>
                ))}
              </div>

              {/* Divider between nav & auth */}
              <div className="my-3 border-t border-white/15" />

              {/* Auth block */}
              <div className="flex flex-col gap-2">
                {/* Dashboard */}
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-white/90 hover:bg-white/10 active:bg-white/15 px-4 py-3 rounded-xl transition-colors text-sm font-medium"
                >
                  <DashboardIcon className="w-4 h-4 opacity-70" />
                  Dashboard
                </Link>

                {user ? (
                  <>
                    {/* Username row */}
                    <div className="flex items-center gap-3 px-4 py-2">
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-semibold text-white text-sm truncate">
                        {user.username}
                      </span>
                    </div>
                    {/* Logout */}
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/20 text-white px-4 py-3 rounded-xl transition-colors text-sm font-medium text-left"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full text-center text-white/90 hover:bg-white/10 active:bg-white/15 border border-white/25 px-4 py-3 rounded-xl transition-colors text-sm font-medium"
                    >
                      Login
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full text-center bg-white text-[var(--primary)] hover:bg-gray-100 active:bg-gray-200 px-4 py-3 rounded-xl transition-colors text-sm font-semibold"
                    >
                      Register
                    </Link>
                  </>
                )}

                {/* Home shortcut */}
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-white/70 hover:bg-white/10 active:bg-white/15 px-4 py-3 rounded-xl transition-colors text-sm"
                >
                  <i className="lni lni-home text-base"></i>
                  Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
