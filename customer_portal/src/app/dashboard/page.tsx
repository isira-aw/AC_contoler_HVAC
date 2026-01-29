'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { customerApi } from '@/lib/api';

interface Device {
  id: number;
  deviceId: string;
  deviceName: string;
  location: string;
  online: boolean;
  systemOn: boolean;
  mode: string;
  temperatureSetpoint: number;
}

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState<Device | null>(null);
  const [assignDeviceId, setAssignDeviceId] = useState('');
  const [assignPassword, setAssignPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDevices();
    }
  }, [isAuthenticated]);

  const loadDevices = async () => {
    try {
      const response = await customerApi.getDevices();
      setDevices(response.data);
    } catch (err) {
      console.error('Failed to load devices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await customerApi.assignDevice({
        deviceId: assignDeviceId,
        accessPassword: assignPassword || undefined,
      });
      setShowAssignModal(false);
      setAssignDeviceId('');
      setAssignPassword('');
      loadDevices();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to assign device');
    }
  };

  const handleUnassignDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to unassign this device?')) return;
    try {
      await customerApi.unassignDevice(deviceId);
      loadDevices();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to unassign device');
    }
  };

  const handleUpdateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showManageModal) return;

    try {
      await customerApi.updateDevice(showManageModal.deviceId, {
        deviceName: showManageModal.deviceName,
        location: showManageModal.location,
      });
      setShowManageModal(null);
      loadDevices();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update device');
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <i className="lni lni-spinner-arrow text-4xl text-primary animate-spin"></i>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-white py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <i className="lni lni-cloud text-2xl"></i>
            <span className="text-xl font-bold">Smart HVAC</span>
          </div>
          <div className="flex items-center space-x-4">
            <span>{user?.username}</span>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="bg-white text-primary px-4 py-1 rounded hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-primary">My Devices</h1>
          <button
            onClick={() => setShowAssignModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <i className="lni lni-plus"></i>
            <span>Assign Device</span>
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="card text-center py-12">
            <i className="lni lni-package text-6xl text-gray-300 mb-4"></i>
            <h2 className="text-xl font-semibold text-gray-600 mb-2">No Devices Assigned</h2>
            <p className="text-gray-500 mb-4">
              Assign your first device to start monitoring and controlling your HVAC units.
            </p>
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn-primary"
            >
              Assign a Device
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device) => (
              <div key={device.id} className="card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{device.deviceName}</h3>
                    <p className="text-sm text-gray-500">{device.deviceId}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${device.online ? 'status-online' : 'status-offline'}`}></div>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center space-x-2">
                    <i className="lni lni-map-marker"></i>
                    <span>{device.location}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="lni lni-power-switch"></i>
                    <span>{device.systemOn ? 'ON' : 'OFF'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="lni lni-thermometer"></i>
                    <span>{device.temperatureSetpoint}°C</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="lni lni-cog"></i>
                    <span>{device.mode}</span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => router.push(`/${device.deviceId}`)}
                    className="btn-primary flex-1"
                  >
                    <i className="lni lni-dashboard mr-1"></i> View
                  </button>
                  <button
                    onClick={() => setShowManageModal(device)}
                    className="btn-secondary"
                  >
                    <i className="lni lni-cog"></i>
                  </button>
                  <button
                    onClick={() => handleUnassignDevice(device.deviceId)}
                    className="bg-red-100 text-red-600 px-3 py-2 rounded-lg hover:bg-red-200"
                  >
                    <i className="lni lni-trash-can"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Assign Device Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Assign Device</h2>
              <button onClick={() => setShowAssignModal(false)}>
                <i className="lni lni-close text-xl"></i>
              </button>
            </div>

            {error && (
              <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleAssignDevice}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device ID
                </label>
                <input
                  type="text"
                  value={assignDeviceId}
                  onChange={(e) => setAssignDeviceId(e.target.value)}
                  className="input"
                  placeholder="e.g., YORK-001"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Password (if required)
                </label>
                <input
                  type="password"
                  value={assignPassword}
                  onChange={(e) => setAssignPassword(e.target.value)}
                  className="input"
                  placeholder="Leave empty if not required"
                />
              </div>

              <div className="flex space-x-2">
                <button type="submit" className="btn-primary flex-1">
                  Assign Device
                </button>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Device Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Manage Device</h2>
              <button onClick={() => setShowManageModal(null)}>
                <i className="lni lni-close text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleUpdateDevice}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Name
                </label>
                <input
                  type="text"
                  value={showManageModal.deviceName}
                  onChange={(e) =>
                    setShowManageModal({ ...showManageModal, deviceName: e.target.value })
                  }
                  className="input"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={showManageModal.location}
                  onChange={(e) =>
                    setShowManageModal({ ...showManageModal, location: e.target.value })
                  }
                  className="input"
                  required
                />
              </div>

              <div className="flex space-x-2">
                <button type="submit" className="btn-primary flex-1">
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowManageModal(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
