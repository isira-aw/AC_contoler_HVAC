'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { customerApi } from '@/lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TelemetryHistory {
  timestamp: string;
  supplyAirTemp: number | null;
  returnAirTemp: number | null;
  roomTemp: number | null;
  powerWatts: number | null;
  energyKwh: number | null;
}

interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  location: string;
}

interface SimplePrediction {
  avgTemperature: number;
  minTemperature: number;
  maxTemperature: number;
  temperatureTrend: string;
  avgPower: number;
  totalEnergy: number;
  estimatedDailyEnergy: number;
  estimatedMonthlyCost: number;
  peakPowerTime: string;
  efficiencyRating: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const params = useParams();
  const deviceId = params.deviceId as string;
  const { isAuthenticated, isLoading } = useAuth();

  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryHistory[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [predictions, setPredictions] = useState<SimplePrediction | null>(null);

  // Date range state
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 16);
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });

  // Selection state for table rows
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // Calculate simple predictions using basic math (no ML/AI)
  const calculatePredictions = useCallback((data: TelemetryHistory[]): SimplePrediction | null => {
    if (data.length === 0) return null;

    // Filter valid temperature readings
    const validTemps = data.filter(d => d.supplyAirTemp !== null).map(d => d.supplyAirTemp!);
    const validPower = data.filter(d => d.powerWatts !== null).map(d => d.powerWatts!);
    const validEnergy = data.filter(d => d.energyKwh !== null).map(d => d.energyKwh!);

    if (validTemps.length === 0) return null;

    // Basic statistical calculations
    const avgTemp = validTemps.reduce((a, b) => a + b, 0) / validTemps.length;
    const minTemp = Math.min(...validTemps);
    const maxTemp = Math.max(...validTemps);

    // Temperature trend using simple linear regression
    let trend = 'Stable';
    if (validTemps.length > 1) {
      const firstHalf = validTemps.slice(0, Math.floor(validTemps.length / 2));
      const secondHalf = validTemps.slice(Math.floor(validTemps.length / 2));
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const diff = avgSecond - avgFirst;
      if (diff > 0.5) trend = 'Rising';
      else if (diff < -0.5) trend = 'Falling';
    }

    // Power calculations
    const avgPower = validPower.length > 0
      ? validPower.reduce((a, b) => a + b, 0) / validPower.length
      : 0;

    // Energy calculations
    const totalEnergy = validEnergy.length > 0
      ? validEnergy[validEnergy.length - 1] - validEnergy[0]
      : 0;

    // Time span calculation for daily estimate
    const timeSpanHours = data.length > 1
      ? (new Date(data[data.length - 1].timestamp).getTime() - new Date(data[0].timestamp).getTime()) / (1000 * 60 * 60)
      : 1;

    // Estimated daily energy (extrapolate from current data)
    const energyRate = timeSpanHours > 0 ? totalEnergy / timeSpanHours : 0;
    const estimatedDailyEnergy = energyRate * 24;

    // Estimated monthly cost (using average electricity rate of $0.12/kWh)
    const electricityRate = 0.12;
    const estimatedMonthlyCost = estimatedDailyEnergy * 30 * electricityRate;

    // Find peak power time
    let peakPowerTime = 'N/A';
    if (validPower.length > 0) {
      const maxPower = Math.max(...validPower);
      const peakIndex = data.findIndex(d => d.powerWatts === maxPower);
      if (peakIndex !== -1) {
        peakPowerTime = new Date(data[peakIndex].timestamp).toLocaleTimeString();
      }
    }

    // Efficiency rating based on power fluctuation
    let efficiencyRating = 'Good';
    if (validPower.length > 1) {
      const powerVariance = validPower.reduce((sum, val) => sum + Math.pow(val - avgPower, 2), 0) / validPower.length;
      const stdDev = Math.sqrt(powerVariance);
      const coefficientOfVariation = (stdDev / avgPower) * 100;

      if (coefficientOfVariation > 30) efficiencyRating = 'Poor';
      else if (coefficientOfVariation > 15) efficiencyRating = 'Fair';
      else efficiencyRating = 'Excellent';
    }

    return {
      avgTemperature: avgTemp,
      minTemperature: minTemp,
      maxTemperature: maxTemp,
      temperatureTrend: trend,
      avgPower: avgPower,
      totalEnergy: Math.abs(totalEnergy),
      estimatedDailyEnergy: estimatedDailyEnergy,
      estimatedMonthlyCost: estimatedMonthlyCost,
      peakPowerTime: peakPowerTime,
      efficiencyRating: efficiencyRating,
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        customerApi.getDeviceStatus(deviceId),
        customerApi.getTelemetryHistory(deviceId, fromDate, toDate),
      ]);

      setDeviceInfo({
        deviceId: statusRes.data.device.deviceId,
        deviceName: statusRes.data.device.deviceName,
        location: statusRes.data.device.location,
      });

      // Filter to only include temperature and energy data
      const filteredData = (historyRes.data || []).map((item: any) => ({
        timestamp: item.timestamp,
        supplyAirTemp: item.supplyAirTemp,
        returnAirTemp: item.returnAirTemp,
        roomTemp: item.roomTemp,
        powerWatts: item.powerWatts,
        energyKwh: item.energyKwh,
      }));

      setTelemetryHistory(filteredData);
      setPredictions(calculatePredictions(filteredData));
      setSelectedRows(new Set());
      setSelectAll(false);
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert('You do not have access to this device');
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId, fromDate, toDate, router, calculatePredictions]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(telemetryHistory.map((_, index) => index)));
    }
    setSelectAll(!selectAll);
  };

  const handleRowSelect = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
    setSelectAll(newSelected.size === telemetryHistory.length);
  };

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();

      // Title
      doc.setFontSize(18);
      doc.setTextColor(9, 65, 102); // Primary color
      doc.text('HVAC Historical Data Report', 14, 22);

      // Device info
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Device: ${deviceInfo?.deviceName || deviceId}`, 14, 35);
      doc.text(`Location: ${deviceInfo?.location || 'N/A'}`, 14, 42);
      doc.text(`Period: ${new Date(fromDate).toLocaleString()} - ${new Date(toDate).toLocaleString()}`, 14, 49);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 56);

      // Get data to export (selected or all)
      const dataToExport = selectedRows.size > 0
        ? telemetryHistory.filter((_, index) => selectedRows.has(index))
        : telemetryHistory;

      // Table data
      const tableData = dataToExport.map(item => [
        new Date(item.timestamp).toLocaleString(),
        item.supplyAirTemp?.toFixed(1) || 'N/A',
        item.returnAirTemp?.toFixed(1) || 'N/A',
        item.roomTemp?.toFixed(1) || 'N/A',
        item.powerWatts?.toFixed(1) || 'N/A',
        item.energyKwh?.toFixed(2) || 'N/A',
      ]);

      // Create table
      autoTable(doc, {
        startY: 65,
        head: [['Timestamp', 'Supply Temp (°C)', 'Return Temp (°C)', 'Room Temp (°C)', 'Power (W)', 'Energy (kWh)']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [9, 65, 102],
          textColor: 255,
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 8,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
      });

      // Add predictions summary if available
      if (predictions) {
        const finalY = (doc as any).lastAutoTable.finalY || 65;

        doc.setFontSize(14);
        doc.setTextColor(9, 65, 102);
        doc.text('Predictions Summary', 14, finalY + 15);

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        const predictionLines = [
          `Average Temperature: ${predictions.avgTemperature.toFixed(1)}°C`,
          `Temperature Range: ${predictions.minTemperature.toFixed(1)}°C - ${predictions.maxTemperature.toFixed(1)}°C`,
          `Temperature Trend: ${predictions.temperatureTrend}`,
          `Average Power: ${predictions.avgPower.toFixed(1)} W`,
          `Total Energy Used: ${predictions.totalEnergy.toFixed(2)} kWh`,
          `Estimated Daily Energy: ${predictions.estimatedDailyEnergy.toFixed(2)} kWh`,
          `Estimated Monthly Cost: $${predictions.estimatedMonthlyCost.toFixed(2)}`,
          `Peak Power Time: ${predictions.peakPowerTime}`,
          `Efficiency Rating: ${predictions.efficiencyRating}`,
        ];

        let yPos = finalY + 25;
        predictionLines.forEach(line => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, 14, yPos);
          yPos += 7;
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(`Page ${i} of ${pageCount}`, 14, 290);
        doc.text('Generated by HVAC Control System', 150, 290);
      }

      // Save
      const fileName = `hvac_history_${deviceId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
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
          <p className="mt-4 text-gray-600">Loading historical data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-white py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <button onClick={() => router.push(`/${deviceId}`)} className="hover:opacity-75">
              <i className="lni lni-arrow-left text-xl"></i>
            </button>
            <div>
              <h1 className="text-xl font-bold">Historical Data & Predictions</h1>
              <p className="text-sm opacity-75">{deviceInfo?.deviceName || deviceId}</p>
            </div>
          </div>
          <button
            onClick={exportToPDF}
            disabled={exporting || telemetryHistory.length === 0}
            className="bg-white text-primary px-4 py-2 rounded-lg hover:bg-gray-100 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <i className="lni lni-spinner-arrow animate-spin"></i>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <i className="lni lni-download"></i>
                <span>Export PDF</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Date Range Selection */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <i className="lni lni-calendar mr-2 text-primary"></i>
            Select Date Range
          </h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">From</label>
              <input
                type="datetime-local"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">To</label>
              <input
                type="datetime-local"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <button
              onClick={loadData}
              className="btn-primary px-6 py-2"
            >
              <i className="lni lni-reload mr-2"></i>
              Load Data
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Predictions Panel */}
          <div className="lg:col-span-1">
            <div className="card sticky top-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center">
                <i className="lni lni-graph mr-2 text-primary"></i>
                Predictions & Analysis
              </h2>

              {predictions ? (
                <div className="space-y-6">
                  {/* Temperature Analysis */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                      <i className="lni lni-thermometer mr-2 text-blue-500"></i>
                      Temperature Analysis
                    </h3>
                    <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Average</span>
                        <span className="font-medium">{predictions.avgTemperature.toFixed(1)}°C</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Range</span>
                        <span className="font-medium">{predictions.minTemperature.toFixed(1)}°C - {predictions.maxTemperature.toFixed(1)}°C</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Trend</span>
                        <span className={`font-medium ${
                          predictions.temperatureTrend === 'Rising' ? 'text-red-600' :
                          predictions.temperatureTrend === 'Falling' ? 'text-blue-600' : 'text-green-600'
                        }`}>
                          {predictions.temperatureTrend === 'Rising' && <i className="lni lni-arrow-up mr-1"></i>}
                          {predictions.temperatureTrend === 'Falling' && <i className="lni lni-arrow-down mr-1"></i>}
                          {predictions.temperatureTrend === 'Stable' && <i className="lni lni-minus mr-1"></i>}
                          {predictions.temperatureTrend}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Energy Analysis */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                      <i className="lni lni-bolt mr-2 text-yellow-500"></i>
                      Energy Analysis
                    </h3>
                    <div className="bg-yellow-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Average Power</span>
                        <span className="font-medium">{predictions.avgPower.toFixed(1)} W</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total Energy</span>
                        <span className="font-medium">{predictions.totalEnergy.toFixed(2)} kWh</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Peak Time</span>
                        <span className="font-medium">{predictions.peakPowerTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cost Predictions */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                      <i className="lni lni-wallet mr-2 text-green-500"></i>
                      Cost Predictions
                    </h3>
                    <div className="bg-green-50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Est. Daily Energy</span>
                        <span className="font-medium">{predictions.estimatedDailyEnergy.toFixed(2)} kWh</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Est. Monthly Cost</span>
                        <span className="font-medium text-green-700">${predictions.estimatedMonthlyCost.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Efficiency Rating */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                      <i className="lni lni-checkmark-circle mr-2 text-purple-500"></i>
                      Efficiency Rating
                    </h3>
                    <div className={`rounded-lg p-3 text-center ${
                      predictions.efficiencyRating === 'Excellent' ? 'bg-green-100 text-green-800' :
                      predictions.efficiencyRating === 'Good' ? 'bg-blue-100 text-blue-800' :
                      predictions.efficiencyRating === 'Fair' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      <span className="text-2xl font-bold">{predictions.efficiencyRating}</span>
                      <p className="text-xs mt-1 opacity-75">Based on power consumption stability</p>
                    </div>
                  </div>

                  {/* Calculation Method Note */}
                  <div className="text-xs text-gray-500 border-t pt-3">
                    <p className="flex items-start">
                      <i className="lni lni-information mr-1 mt-0.5"></i>
                      Predictions are calculated using basic statistical analysis (averages, trends, and extrapolation) without machine learning.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <i className="lni lni-graph text-4xl mb-2"></i>
                  <p>No data available for predictions</p>
                </div>
              )}
            </div>
          </div>

          {/* Data Table */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold flex items-center">
                  <i className="lni lni-list mr-2 text-primary"></i>
                  Historical Data
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({telemetryHistory.length} records)
                  </span>
                </h2>
                {selectedRows.size > 0 && (
                  <span className="text-sm text-primary">
                    {selectedRows.size} selected for export
                  </span>
                )}
              </div>

              {telemetryHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectAll}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">Timestamp</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Supply Temp</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Return Temp</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Room Temp</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Power</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Energy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {telemetryHistory.map((item, index) => (
                        <tr
                          key={index}
                          className={`hover:bg-gray-50 cursor-pointer ${selectedRows.has(index) ? 'bg-primary/5' : ''}`}
                          onClick={() => handleRowSelect(index)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedRows.has(index)}
                              onChange={() => handleRowSelect(index)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {new Date(item.timestamp).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatValue(item.supplyAirTemp, '°C')}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatValue(item.returnAirTemp, '°C')}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatValue(item.roomTemp, '°C')}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatValue(item.powerWatts, ' W')}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {formatValue(item.energyKwh, ' kWh')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <i className="lni lni-files text-4xl mb-2"></i>
                  <p>No historical data found for the selected period</p>
                  <p className="text-sm mt-1">Try adjusting the date range</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
