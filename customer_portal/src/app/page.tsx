'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

import { useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-white py-4 px-4 md:px-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span className="text-lg md:text-xl font-bold">Smart HVAC</span>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/dashboard" className="hover:bg-white/10 px-2 py-2 rounded text-center">
              Dashboard
            </Link>
            {user ? (
              <span className="px-2 py-2 font-medium">
                {user.username}
              </span>
            ) : (
              <Link
                href="/login"
                className="hover:bg-white/10 px-2 py-2 rounded text-center"
              >
                Login
              </Link>
            )}

            <Link href="/register" className="bg-white text-primary px-4 py-2 rounded-lg hover:bg-gray-100">
              Register
            </Link>
            <Link href="/" className="bg-white/20 text-white px-4 py-2 rounded-lg">
              <i className="lni lni-home text-xl md:text-2xl"></i>
            </Link>
          </div>

          {/* Mobile hamburger button */}
          <button
            className="md:hidden p-2 hover:opacity-75"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <i className={`lni ${mobileMenuOpen ? 'lni-close' : 'lni-menu'} text-xl`}></i>
          </button>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-white/20">
            <div className="flex flex-col space-y-3">
              <Link href="/dashboard" className="px-2 py-2 hover:bg-white/10 rounded text-center">
                Dashboard
              </Link>
              {user ? (
                <span className="px-2 py-2 font-medium text-center">
                  {user.username}
                </span>
              ) : (
                <Link
                  href="/login"
                  className="hover:bg-white/10 px-2 py-2 rounded text-center"
                >
                  Login
                </Link>
              )}

              <Link href="/register" className="bg-white text-primary px-4 py-2 rounded-lg hover:bg-gray-100 text-center">
                Register
              </Link>
              <Link href="/" className="px-2 py-2 bg-white/10 rounded text-center">
                <i className="lni lni-home text-xl md:text-2xl"></i>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-primary mb-6">
            Smart HVAC IoT Control System
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Monitor, control, and optimize your HVAC units from anywhere.
            Real-time data, intelligent predictions, and seamless automation.
          </p>
          <Link href="/register" className="btn-primary text-lg px-8 py-3 inline-block">
            Get Started
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-primary mb-12">Key Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="lni lni-dashboard text-2xl text-white"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Real-time Monitoring</h3>
              <p className="text-gray-600">
                Track temperature, humidity, energy usage, and system status in real-time.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="lni lni-cog text-2xl text-white"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Remote Control</h3>
              <p className="text-gray-600">
                Adjust temperature, fan speed, and operating modes from your device.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="lni lni-alarm text-2xl text-white"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Smart Alerts</h3>
              <p className="text-gray-600">
                Get instant notifications for faults, maintenance needs, and anomalies.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="lni lni-graph text-2xl text-white"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Energy Analytics</h3>
              <p className="text-gray-600">
                Analyze energy consumption patterns and optimize efficiency.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="lni lni-calendar text-2xl text-white"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Scheduling</h3>
              <p className="text-gray-600">
                Set up automated schedules for optimal comfort and efficiency.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="card text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="lni lni-shield text-2xl text-white"></i>
              </div>
              <h3 className="text-xl font-semibold mb-2">Secure Access</h3>
              <p className="text-gray-600">
                Enterprise-grade security with JWT authentication and 2FA.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-primary text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg mb-8 opacity-90">
            Join thousands of users who trust Smart HVAC for their climate control needs.
          </p>
          <Link href="/register" className="bg-white text-primary px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-100 inline-block">
            Create Your Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto text-center">
          <p className="opacity-75">© 2024 Smart HVAC IoT System. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
