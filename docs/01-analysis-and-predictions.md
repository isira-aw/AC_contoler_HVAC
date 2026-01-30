# Analysis & Predictions Documentation

This document explains how the HVAC system processes sensor data, generates predictions, detects faults, and calculates efficiency scores.

## Table of Contents

1. [Overview](#overview)
2. [Data Collection Pipeline](#data-collection-pipeline)
3. [Prediction Algorithms](#prediction-algorithms)
4. [Fault Detection System](#fault-detection-system)
5. [Efficiency Scoring Algorithm](#efficiency-scoring-algorithm)
6. [Maintenance Recommendations](#maintenance-recommendations)
7. [Enhancement Guidelines](#enhancement-guidelines)

---

## Overview

The analysis and prediction system uses **rule-based algorithms** (not machine learning) to:
- Predict energy consumption and runtime
- Calculate system efficiency scores (0-100)
- Detect operational faults in real-time
- Generate maintenance recommendations

**Source Files:**
- `/backend/src/main/java/com/hvac/service/PredictionService.java`
- `/backend/src/main/java/com/hvac/service/FaultDetectionService.java`

---

## Data Collection Pipeline

### How Telemetry Data Flows

```
ESP32 Sensors (every 10 seconds)
         |
         v
    MQTT Publish
    Topic: hvac/{device_id}/telemetry
         |
         v
    MQTT Broker
         |
         v
    Backend MqttService
         |
         v
    +--------------------+
    | handleTelemetry()  |
    +--------------------+
         |
         +---> Save to Database (TelemetryRepository)
         |
         +---> Update Device Heartbeat
         |
         +---> Run Fault Detection (FaultDetectionService)
```

### Telemetry Data Structure

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `supplyAirTemp` | Float | Celsius | Air temperature leaving the unit |
| `returnAirTemp` | Float | Celsius | Air temperature returning to the unit |
| `roomTemp` | Float | Celsius | Current room temperature |
| `humidity` | Float | % | Relative humidity |
| `outdoorTemp` | Float | Celsius | Outside temperature |
| `lineVoltage` | Float | Volts | Input voltage (nominal 220V) |
| `currentAmps` | Float | Amps | Current draw |
| `powerWatts` | Float | Watts | Real power consumption |
| `energyKwh` | Float | kWh | Cumulative energy used |
| `compressorOn` | Boolean | - | Compressor running state |
| `fanSpeed` | Enum | - | OFF, LOW, MED, HIGH |
| `airflowStatus` | Enum | - | NORMAL, RESTRICTED |
| `filterCondition` | Enum | - | CLEAN, DIRTY, CLOGGED |

---

## Prediction Algorithms

### 1. Energy Prediction Algorithm

**Purpose:** Estimate daily and monthly energy consumption based on current usage patterns.

**Algorithm Logic:**

```java
// Constants
MAX_CAPACITY_KWH = 100.0  // Maximum energy capacity reference

// Step 1: Calculate Average Hourly Usage
// Get telemetry data from last 24 hours
List<Telemetry> last24Hours = getRecentTelemetry(deviceId, 24hours)

// Calculate average power consumption
avgPowerWatts = average(telemetry.powerWatts)  // in Watts
avgPowerKw = avgPowerWatts / 1000              // convert to kW

// Step 2: Calculate Daily Prediction
dailyEnergyPrediction = avgPowerKw * 24  // kWh per day

// Step 3: Calculate Monthly Prediction
monthlyEnergyPrediction = dailyEnergyPrediction * 30  // kWh per month
```

**Example Calculation:**
```
Input:
  - Average power consumption: 1,800 Watts

Calculation:
  - avgPowerKw = 1800 / 1000 = 1.8 kW
  - dailyPrediction = 1.8 * 24 = 43.2 kWh/day
  - monthlyPrediction = 43.2 * 30 = 1,296 kWh/month
```

### 2. Estimated Runtime Algorithm

**Purpose:** Calculate how long the system can run before reaching max capacity.

**Algorithm Logic:**

```java
// Get latest telemetry
currentEnergyKwh = latestTelemetry.energyKwh
currentPowerWatts = latestTelemetry.powerWatts

// Calculate remaining capacity
remainingCapacity = MAX_CAPACITY_KWH - currentEnergyKwh

// Calculate runtime in hours
currentPowerKw = currentPowerWatts / 1000
estimatedRuntimeHours = remainingCapacity / currentPowerKw

// Handle edge case: if power is zero, runtime is infinite
if (currentPowerWatts <= 0) {
    estimatedRuntimeHours = Double.MAX_VALUE
}
```

**Example Calculation:**
```
Input:
  - Current energy used: 45.5 kWh
  - Current power draw: 2,000 Watts

Calculation:
  - remainingCapacity = 100.0 - 45.5 = 54.5 kWh
  - currentPowerKw = 2000 / 1000 = 2.0 kW
  - estimatedRuntime = 54.5 / 2.0 = 27.25 hours
```

---

## Fault Detection System

### How Fault Detection Works

```
Telemetry Received
       |
       v
+------------------+
| checkForFaults() |
+------------------+
       |
       +---> Check Overcurrent (current > 20A)
       |
       +---> Check Voltage (< 200V or > 250V)
       |
       +---> Check Overheating (supply temp > 40C)
       |
       +---> Check Filter (CLOGGED status)
       |
       +---> Check Sensors (null or invalid range)
       |
       v
  If fault detected AND no unresolved fault of same type exists:
       |
       v
  Create FaultLog entry
```

### Fault Detection Thresholds

| Fault Type | Condition | Threshold | Severity | Action Required |
|------------|-----------|-----------|----------|-----------------|
| `OVERCURRENT` | Current exceeds safe limit | > 20 Amps | HIGH | Immediate shutdown, check wiring |
| `LOW_VOLTAGE` | Voltage below operating range | < 200 Volts | MEDIUM | Check power supply |
| `HIGH_VOLTAGE` | Voltage above safe range | > 250 Volts | HIGH | Install voltage regulator |
| `OVERHEATING` | Supply air too hot | > 40 Celsius | HIGH | Check refrigerant, compressor |
| `FILTER_CHOKE` | Filter completely blocked | `CLOGGED` status | MEDIUM | Replace filter immediately |
| `SENSOR_FAILURE` | Invalid sensor readings | `null` or < -50C or > 100C | MEDIUM | Calibrate/replace sensor |
| `DEVICE_OFFLINE` | No heartbeat received | > 5 minutes | HIGH | Check device connectivity |

### Fault Detection Code Logic

```java
public void checkForFaults(Device device, Telemetry telemetry) {

    // Overcurrent Detection
    if (telemetry.getCurrentAmps() != null && telemetry.getCurrentAmps() > 20.0) {
        logFault(device, FaultType.OVERCURRENT, Severity.HIGH,
            "Current exceeds safe threshold",
            telemetry.getCurrentAmps(), 20.0);
    }

    // Voltage Monitoring
    if (telemetry.getLineVoltage() != null) {
        if (telemetry.getLineVoltage() < 200.0) {
            logFault(device, FaultType.LOW_VOLTAGE, Severity.MEDIUM,
                "Line voltage below minimum",
                telemetry.getLineVoltage(), 200.0);
        }
        if (telemetry.getLineVoltage() > 250.0) {
            logFault(device, FaultType.HIGH_VOLTAGE, Severity.HIGH,
                "Line voltage exceeds maximum",
                telemetry.getLineVoltage(), 250.0);
        }
    }

    // Temperature Monitoring
    if (telemetry.getSupplyAirTemp() != null && telemetry.getSupplyAirTemp() > 40.0) {
        logFault(device, FaultType.OVERHEATING, Severity.HIGH,
            "Supply air temperature exceeds safe limit",
            telemetry.getSupplyAirTemp(), 40.0);
    }

    // Filter Condition
    if ("CLOGGED".equals(telemetry.getFilterCondition())) {
        logFault(device, FaultType.FILTER_CHOKE, Severity.MEDIUM,
            "Air filter is clogged and needs replacement",
            null, null);
    }

    // Sensor Validation
    if (isSensorInvalid(telemetry.getSupplyAirTemp()) ||
        isSensorInvalid(telemetry.getReturnAirTemp()) ||
        isSensorInvalid(telemetry.getRoomTemp())) {
        logFault(device, FaultType.SENSOR_FAILURE, Severity.MEDIUM,
            "One or more temperature sensors reporting invalid data",
            null, null);
    }
}

private boolean isSensorInvalid(Double value) {
    return value == null || value < -50.0 || value > 100.0;
}
```

### Duplicate Fault Prevention

The system prevents duplicate fault logs:

```java
private void logFault(Device device, FaultType type, Severity severity, ...) {
    // Check if unresolved fault of same type exists
    Optional<FaultLog> existing = faultLogRepository
        .findByDeviceAndFaultTypeAndIsResolvedFalse(device, type);

    // Only create new fault if none exists
    if (existing.isEmpty()) {
        FaultLog fault = new FaultLog();
        fault.setDevice(device);
        fault.setFaultType(type);
        // ... set other fields
        faultLogRepository.save(fault);
    }
}
```

---

## Efficiency Scoring Algorithm

### Overview

The efficiency score is a 0-100 rating that indicates how well the HVAC system is operating. Higher scores mean better efficiency.

### Scoring Components

| Factor | Weight | Optimal Condition | Penalty |
|--------|--------|-------------------|---------|
| Temperature Delta | Base Score | 8 Celsius difference | -5 points per degree below 8C |
| Filter Condition | -15 to -30 | CLEAN | DIRTY: -15, CLOGGED: -30 |
| Airflow Status | -20 | NORMAL | RESTRICTED: -20 |
| Power Factor | -0 to -50 | >= 0.85 | (0.85 - PF) * 50 |

### Algorithm Implementation

```java
public int calculateEfficiencyScore(Telemetry telemetry) {
    int score = 100;  // Start with perfect score

    // 1. Temperature Delta Factor
    // Optimal: Supply air should be ~8C cooler than return air
    if (telemetry.getSupplyAirTemp() != null && telemetry.getReturnAirTemp() != null) {
        double delta = telemetry.getReturnAirTemp() - telemetry.getSupplyAirTemp();

        if (delta < 8.0) {
            // Penalty for insufficient cooling
            score -= (int) ((8.0 - delta) * 5);
        }
    }

    // 2. Filter Condition Factor
    String filterCondition = telemetry.getFilterCondition();
    if ("DIRTY".equals(filterCondition)) {
        score -= 15;
    } else if ("CLOGGED".equals(filterCondition)) {
        score -= 30;
    }

    // 3. Airflow Status Factor
    if ("RESTRICTED".equals(telemetry.getAirflowStatus())) {
        score -= 20;
    }

    // 4. Power Factor Calculation
    if (telemetry.getLineVoltage() != null &&
        telemetry.getCurrentAmps() != null &&
        telemetry.getPowerWatts() != null) {

        double apparentPower = telemetry.getLineVoltage() * telemetry.getCurrentAmps();
        double powerFactor = telemetry.getPowerWatts() / apparentPower;

        if (powerFactor < 0.85) {
            // Penalty for poor power factor
            score -= (int) ((0.85 - powerFactor) * 50);
        }
    }

    // Ensure score stays within bounds
    return Math.max(0, Math.min(100, score));
}
```

### Example Efficiency Calculation

```
Input Telemetry:
  - Supply Air Temp: 16 Celsius
  - Return Air Temp: 22 Celsius  (Delta = 6C)
  - Filter Condition: DIRTY
  - Airflow Status: NORMAL
  - Line Voltage: 220V
  - Current: 8A
  - Power: 1600W

Calculation:
  Starting Score: 100

  Step 1 - Temperature Delta:
    delta = 22 - 16 = 6C
    penalty = (8 - 6) * 5 = 10 points
    score = 100 - 10 = 90

  Step 2 - Filter Condition:
    DIRTY = -15 points
    score = 90 - 15 = 75

  Step 3 - Airflow Status:
    NORMAL = no penalty
    score = 75

  Step 4 - Power Factor:
    apparentPower = 220 * 8 = 1760 VA
    powerFactor = 1600 / 1760 = 0.91
    0.91 >= 0.85, no penalty
    score = 75

  Final Efficiency Score: 75%
```

---

## Maintenance Recommendations

The system generates recommendations based on efficiency score:

| Score Range | Status | Recommendation |
|-------------|--------|----------------|
| 90-100 | Excellent | "System is operating optimally. Continue regular maintenance schedule." |
| 70-89 | Good | "System is performing well. Monitor for any changes." |
| 70-89 + DIRTY filter | Good | "Consider replacing air filter soon." |
| 50-69 | Fair | "Performance is degraded. Schedule maintenance check within 2 weeks." |
| 0-49 | Poor | "Urgent maintenance required. System efficiency is significantly compromised." |

### Recommendation Logic

```java
public String getMaintenanceRecommendation(int efficiencyScore, Telemetry telemetry) {
    if (efficiencyScore >= 90) {
        return "System is operating optimally. Continue regular maintenance schedule.";
    } else if (efficiencyScore >= 70) {
        if ("DIRTY".equals(telemetry.getFilterCondition())) {
            return "Consider replacing air filter soon.";
        }
        return "System is performing well. Monitor for any changes.";
    } else if (efficiencyScore >= 50) {
        return "Performance is degraded. Schedule maintenance check within 2 weeks.";
    } else {
        return "Urgent maintenance required. System efficiency is significantly compromised.";
    }
}
```

---

## Enhancement Guidelines

### For Future ML Implementation

If you want to enhance the prediction system with machine learning:

1. **Data Collection Requirements:**
   - Minimum 30 days of historical telemetry data
   - Include weather data (outdoor temp, humidity)
   - Track maintenance events and their impact

2. **Recommended Models:**
   - Energy prediction: LSTM or Prophet for time-series forecasting
   - Fault prediction: Random Forest or XGBoost for classification
   - Anomaly detection: Isolation Forest or Autoencoders

3. **Training Pipeline:**
   ```
   Historical Telemetry Data
          |
          v
   Feature Engineering (time features, rolling averages)
          |
          v
   Train/Test Split (80/20, time-based)
          |
          v
   Model Training
          |
          v
   Validation & Metrics (RMSE for energy, F1 for faults)
          |
          v
   Deploy Model (save to /models/ directory)
   ```

4. **Integration Points:**
   - Replace `PredictionService` calculations with model inference
   - Add `/api/predictions/retrain` endpoint for model updates
   - Store model metadata in database for versioning

### Adding New Fault Types

To add a new fault detection:

1. **Add enum value** in `FaultType.java`:
   ```java
   public enum FaultType {
       OVERCURRENT,
       LOW_VOLTAGE,
       // ... existing types
       NEW_FAULT_TYPE  // Add here
   }
   ```

2. **Add detection logic** in `FaultDetectionService.java`:
   ```java
   // In checkForFaults() method
   if (telemetry.getNewMetric() > NEW_THRESHOLD) {
       logFault(device, FaultType.NEW_FAULT_TYPE, Severity.MEDIUM,
           "Description of the fault",
           telemetry.getNewMetric(), NEW_THRESHOLD);
   }
   ```

3. **Update thresholds table** in this documentation.

### Tuning Efficiency Score Weights

Current weights are:
- Temperature delta: 5 points per degree
- Filter dirty: 15 points
- Filter clogged: 30 points
- Airflow restricted: 20 points
- Power factor: 50 points per 0.01 below 0.85

To adjust weights, modify `PredictionService.calculateEfficiencyScore()`:

```java
// Example: Make filter condition more important
private static final int FILTER_DIRTY_PENALTY = 20;  // was 15
private static final int FILTER_CLOGGED_PENALTY = 40; // was 30
```

---

## API Endpoint

Predictions are accessed via:

```
GET /api/customer/devices/{deviceId}/predictions
Authorization: Bearer {jwt_token}

Response:
{
    "deviceId": "YORK-001",
    "timestamp": "2024-01-15T10:30:00",
    "efficiencyScore": 75,
    "dailyEnergyPrediction": 43.2,
    "monthlyEnergyPrediction": 1296.0,
    "estimatedRuntimeHours": 27.25,
    "maintenanceRecommendation": "Consider replacing air filter soon."
}
```
