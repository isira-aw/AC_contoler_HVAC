'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { customerApi } from '@/lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface DeviceStatus {
  device: {
    deviceId: string;
    deviceName: string;
    location: string;
    online: boolean;
    systemOn: boolean;
    mode: string;
    fanSpeed: string;
    temperatureSetpoint: number;
  };
  telemetry: {
    supplyAirTemp: number | null;
    returnAirTemp: number | null;
    roomTemp: number | null;
    humidity: number | null;
    outdoorTemp: number | null;
    lineVoltage: number | null;
    currentAmps: number | null;
    powerWatts: number | null;
    energyKwh: number | null;
    compressorOn: boolean | null;
    fanSpeed: string | null;
    airflowStatus: string | null;
    filterCondition: string | null;
    timestamp: string | null;
  };
}

interface TelemetryHistory {
  timestamp: string;
  supplyAirTemp: number;
  returnAirTemp: number;
  powerWatts: number;
  energyKwh: number;
}

interface Fault {
  id: number;
  faultType: string;
  description: string;
  severity: string;
  createdAt: string;
  resolved: boolean;
}

interface Prediction {
  estimatedRuntime: number;
  dailyEnergyPrediction: number;
  monthlyEnergyPrediction: number;
  efficiencyScore: number;
  maintenanceRecommendation: string;
}

export default function DeviceDashboard() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.deviceId as string;
  const { isAuthenticated, isLoading, logout, user } = useAuth();

  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryHistory[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [predictions, setPredictions] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState(false);

  // Control states
  const [systemOn, setSystemOn] = useState(false);
  const [mode, setMode] = useState('COOLING');
  const [fanSpeed, setFanSpeed] = useState('MED');
  const [temperatureSetpoint, setTemperatureSetpoint] = useState(24);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statusRes, telemetryRes, faultsRes, predictionsRes] = await Promise.all([
        customerApi.getDeviceStatus(deviceId),
        customerApi.getTelemetry(deviceId, 50),
        customerApi.getFaults(deviceId, 0, 10),
        customerApi.getPredictions(deviceId),
      ]);

      setStatus(statusRes.data);
      setTelemetryHistory(telemetryRes.data.reverse());
      setFaults(faultsRes.data.content || []);
      setPredictions(predictionsRes.data);

      // Update control states from device status
      const device = statusRes.data.device;
      setSystemOn(device.systemOn);
      setMode(device.mode);
      setFanSpeed(device.fanSpeed);
      setTemperatureSetpoint(device.temperatureSetpoint);
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert('You do not have access to this device');
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId, router]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      const interval = setInterval(loadData, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, loadData]);

  const sendControl = async (updates: {
    systemOn?: boolean;
    mode?: string;
    fanSpeed?: string;
    temperatureSetpoint?: number;
  }) => {
    setControlLoading(true);
    try {
      await customerApi.sendControl(deviceId, updates);
      // Update local state
      if (updates.systemOn !== undefined) setSystemOn(updates.systemOn);
      if (updates.mode) setMode(updates.mode);
      if (updates.fanSpeed) setFanSpeed(updates.fanSpeed);
      if (updates.temperatureSetpoint) setTemperatureSetpoint(updates.temperatureSetpoint);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to send control command');
    } finally {
      setControlLoading(false);
    }
  };

  const formatValue = (value: any, unit = '') => {
    if (value === null || value === undefined) return 'N/C';
    return `${typeof value === 'number' ? value.toFixed(1) : value}${unit}`;
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <i className="lni lni-spinner-arrow text-4xl text-primary animate-spin"></i>
          <p className="mt-4 text-gray-600">Loading device data...</p>
        </div>
      </div>
    );
  }

  const telemetry = status?.telemetry || {} as DeviceStatus['telemetry'];
  const device = status?.device;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-white py-4 px-4 md:px-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Left side - Navigation */}
          <div className="flex items-center space-x-3 md:space-x-4">
            <button onClick={() => router.push('/')} className="hover:opacity-75" title="Home">
              <i className="lni lni-home text-xl"></i>
            </button>
            <button onClick={() => router.push('/dashboard')} className="hover:opacity-75 hidden sm:flex items-center space-x-1">
              <span className="text-sm font-medium">Dashboard</span>
            </button>
            <button onClick={() => router.push('/dashboard')} className="hover:opacity-75 sm:hidden" title="Dashboard">
              <i className="lni lni-dashboard text-xl"></i>
            </button>
            <div className="border-l border-white/30 pl-3 md:pl-4">
              <h1 className="text-base md:text-xl font-bold truncate max-w-[120px] sm:max-w-none">{device?.deviceName || deviceId}</h1>
              <p className="text-xs md:text-sm opacity-75 hidden sm:block">{device?.location}</p>
            </div>
          </div>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${device?.online ? 'text-green-300' : 'text-red-300'}`}>
              <div className={`w-3 h-3 rounded-full ${device?.online ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span>{device?.online ? 'Online' : 'Offline'}</span>
            </div>
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

          {/* Mobile - Status indicator and hamburger */}
          <div className="flex md:hidden items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${device?.online ? 'bg-green-400' : 'bg-red-400'}`}></div>
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
              <div className="flex items-center justify-between px-2">
                <span className="text-sm opacity-75">{device?.location}</span>
                <span className={`text-sm ${device?.online ? 'text-green-300' : 'text-red-300'}`}>
                  {device?.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <button
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="bg-white text-primary px-4 py-2 rounded hover:bg-gray-100 text-center"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <i className="lni lni-thermometer text-xl text-blue-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Room Temp</p>
                <p className="text-2xl font-bold">{formatValue(telemetry.roomTemp, '°C')}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <i className="lni lni-drop text-xl text-green-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Humidity</p>
                <p className="text-2xl font-bold">{formatValue(telemetry.humidity, '%')}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <i className="lni lni-bolt text-xl text-yellow-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Power</p>
                <p className="text-2xl font-bold">{formatValue(telemetry.powerWatts, 'W')}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <i className="lni lni-stats-up text-xl text-purple-600"></i>
              </div>
              <div>
                <p className="text-sm text-gray-500">Energy</p>
                <p className="text-2xl font-bold">{formatValue(telemetry.energyKwh, ' kWh')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Controls & Environmental */}
          <div className="space-y-6">
            {/* Control Panel */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <i className="lni lni-cog mr-2 text-primary"></i>
                Control Panel
              </h2>

              <div className="space-y-4">
                {/* Power Toggle */}
                <div className="flex justify-between items-center">
                  <span>System Power</span>
                  <button
                    onClick={() => sendControl({ systemOn: !systemOn })}
                    disabled={controlLoading}
                    className={`w-16 h-8 rounded-full relative ${systemOn ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full absolute top-1 transition-all ${systemOn ? 'right-1' : 'left-1'}`}></div>
                  </button>
                </div>

                {/* Mode */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Mode</label>
                  <div className="flex space-x-2">
                    {['COOLING', 'HEATING'].map((m) => (
                      <button
                        key={m}
                        onClick={() => sendControl({ mode: m })}
                        disabled={controlLoading}
                        className={`flex-1 py-2 rounded-lg ${mode === m ? 'bg-primary text-white' : 'bg-gray-200'}`}
                      >
                        {m === 'COOLING' ? <i className="lni lni-snowflake"></i> : <i className="lni lni-sun"></i>}
                        <span className="ml-1">{m}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fan Speed */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Fan Speed</label>
                  <div className="flex space-x-2">
                    {['LOW', 'MED', 'HIGH'].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => sendControl({ fanSpeed: speed })}
                        disabled={controlLoading}
                        className={`flex-1 py-2 rounded-lg ${fanSpeed === speed ? 'bg-primary text-white' : 'bg-gray-200'}`}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Temperature Setpoint */}
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Temperature Setpoint: {temperatureSetpoint}°C
                  </label>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => sendControl({ temperatureSetpoint: temperatureSetpoint - 1 })}
                      disabled={controlLoading || temperatureSetpoint <= 16}
                      className="btn-secondary w-10 h-10"
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="16"
                      max="30"
                      value={temperatureSetpoint}
                      onChange={(e) => setTemperatureSetpoint(Number(e.target.value))}
                      onMouseUp={() => sendControl({ temperatureSetpoint })}
                      className="flex-1"
                    />
                    <button
                      onClick={() => sendControl({ temperatureSetpoint: temperatureSetpoint + 1 })}
                      disabled={controlLoading || temperatureSetpoint >= 30}
                      className="btn-secondary w-10 h-10"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Environmental Data */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <i className="lni lni-leaf mr-2 text-primary"></i>
                Environmental
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Supply Air Temp</span>
                  <span className="font-medium">{formatValue(telemetry.supplyAirTemp, '°C')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Return Air Temp</span>
                  <span className="font-medium">{formatValue(telemetry.returnAirTemp, '°C')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Outdoor Temp</span>
                  <span className="font-medium">{formatValue(telemetry.outdoorTemp, '°C')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Filter Condition</span>
                  <span className={`font-medium ${telemetry.filterCondition === 'CLOGGED' ? 'text-red-500' : ''}`}>
                    {formatValue(telemetry.filterCondition)}
                  </span>
                </div>
              </div>
            </div>

            {/* Electrical Data */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <i className="lni lni-bolt mr-2 text-primary"></i>
                Electrical
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Voltage</span>
                  <span className="font-medium">{formatValue(telemetry.lineVoltage, 'V')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Current</span>
                  <span className="font-medium">{formatValue(telemetry.currentAmps, 'A')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Compressor</span>
                  <span className={`font-medium ${telemetry.compressorOn ? 'text-green-600' : 'text-gray-400'}`}>
                    {telemetry.compressorOn ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Column - Charts */}
          <div className="lg:col-span-2 space-y-6">
            {/* Historical Data Button */}
            <div className="flex justify-end">
              <button
                onClick={() => router.push(`/${deviceId}/history`)}
                className="btn-primary flex items-center space-x-2"
              >
                <i className="lni lni-files"></i>
                <span>View Historical Data & Predictions</span>
              </button>
            </div>

            {/* Temperature Chart */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Temperature History</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(val) => new Date(val).toLocaleTimeString()}
                      fontSize={12}
                    />
                    <YAxis domain={['auto', 'auto']} fontSize={12} />
                    <Tooltip
                      labelFormatter={(val) => new Date(val).toLocaleString()}
                    />
                    <Line
                      type="monotone"
                      dataKey="supplyAirTemp"
                      stroke="#094166"
                      name="Supply"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="returnAirTemp"
                      stroke="#10b981"
                      name="Return"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Energy Chart */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Energy Consumption</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(val) => new Date(val).toLocaleTimeString()}
                      fontSize={12}
                    />
                    <YAxis fontSize={12} />
                    <Tooltip
                      labelFormatter={(val) => new Date(val).toLocaleString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="powerWatts"
                      stroke="#8b5cf6"
                      fill="#c4b5fd"
                      name="Power (W)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Predictions & Faults */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Predictions */}
              <div className="card">
                <h2 className="text-lg font-semibold mb-4 flex items-center">
                  <i className="lni lni-graph mr-2 text-primary"></i>
                  Predictions
                </h2>
                {predictions ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Runtime Estimate</span>
                      <span className="font-medium">{predictions.estimatedRuntime.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Daily Energy</span>
                      <span className="font-medium">{predictions.dailyEnergyPrediction.toFixed(1)} kWh</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Monthly Energy</span>
                      <span className="font-medium">{predictions.monthlyEnergyPrediction.toFixed(1)} kWh</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Efficiency Score</span>
                      <span className={`font-bold ${predictions.efficiencyScore >= 70 ? 'text-green-600' : predictions.efficiencyScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {predictions.efficiencyScore.toFixed(0)}%
                      </span>
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500">{predictions.maintenanceRecommendation}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">No predictions available</p>
                )}
              </div>

              {/* Faults */}
              <div className="card">
                <h2 className="text-lg font-semibold mb-4 flex items-center">
                  <i className="lni lni-warning mr-2 text-primary"></i>
                  Recent Alerts
                </h2>
                {faults.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {faults.map((fault) => (
                      <div
                        key={fault.id}
                        className={`p-2 rounded text-sm ${
                          fault.severity === 'HIGH'
                            ? 'bg-red-100 text-red-800'
                            : fault.severity === 'MEDIUM'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        <div className="font-medium">{fault.faultType}</div>
                        <div className="text-xs opacity-75">{fault.description}</div>
                        <div className="text-xs opacity-50">
                          {new Date(fault.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No recent alerts</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
