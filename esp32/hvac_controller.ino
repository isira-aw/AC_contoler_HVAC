/*
 * Smart HVAC IoT Controller - ESP32 Firmware
 *
 * This firmware connects an ESP32 to the HVAC IoT system via MQTT.
 * It publishes telemetry data and receives control commands.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ==================== CONFIGURATION ====================

// WiFi Configuration
const char* WIFI_SSID = "SLT-4G-FD128A";
const char* WIFI_PASSWORD = "3L2QQ32C8Y";

// MQTT Configuration
const char* MQTT_SERVER = "trolley.proxy.rlwy.net";
const int MQTT_PORT = 26703;
const char* MQTT_USERNAME = "hvac-monitoring-system";
const char* MQTT_PASSWORD = "di1u5ydet0z049vbbl08cofp6vhya45l";

// Device Configuration
const char* DEVICE_ID = "YORK-001";

// Telemetry interval (milliseconds)
const unsigned long TELEMETRY_INTERVAL = 10000;  // 10 seconds
const unsigned long HEARTBEAT_INTERVAL = 30000;  // 30 seconds

// ==================== PIN DEFINITIONS ====================

// Sensor pins (modify based on your hardware setup)
#define SUPPLY_TEMP_PIN 34    // ADC for supply air temperature sensor
#define RETURN_TEMP_PIN 35    // ADC for return air temperature sensor
#define ROOM_TEMP_PIN 32      // ADC for room temperature sensor
#define HUMIDITY_PIN 33       // ADC for humidity sensor
#define VOLTAGE_PIN 25        // ADC for voltage sensor
#define CURRENT_PIN 26        // ADC for current sensor

// Control pins
#define COMPRESSOR_PIN 16     // Relay for compressor
#define FAN_LOW_PIN 17        // Relay for fan low speed
#define FAN_MED_PIN 18        // Relay for fan medium speed
#define FAN_HIGH_PIN 19       // Relay for fan high speed
#define COOLING_PIN 21        // Relay for cooling mode
#define HEATING_PIN 22        // Relay for heating mode
#define SYSTEM_LED_PIN 2      // Status LED

// ==================== GLOBAL VARIABLES ====================

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// MQTT Topics
String telemetryTopic;
String controlTopic;
String statusTopic;

// Device state
bool systemOn = false;
String operatingMode = "COOLING";
String fanSpeed = "LOW";
float temperatureSetpoint = 24.0;
bool compressorOn = false;

// Timing
unsigned long lastTelemetryTime = 0;
unsigned long lastHeartbeatTime = 0;

// Energy tracking
float totalEnergyKwh = 0.0;
unsigned long lastEnergyCalcTime = 0;

// ==================== SENSOR FUNCTIONS ====================

float readTemperature(int pin) {
    // Read ADC value and convert to temperature
    // This is a simplified conversion - adjust based on your sensor
    int adcValue = analogRead(pin);
    float voltage = adcValue * (3.3 / 4095.0);
    // LM35 conversion: 10mV per degree
    float temperature = voltage * 100.0;
    // Add some noise for simulation if using mock data
    #ifdef MOCK_DATA
    temperature = 22.0 + random(-20, 20) / 10.0;
    #endif
    return temperature;
}

float readHumidity() {
    int adcValue = analogRead(HUMIDITY_PIN);
    float humidity = (adcValue / 4095.0) * 100.0;
    #ifdef MOCK_DATA
    humidity = 55.0 + random(-100, 100) / 10.0;
    #endif
    return humidity;
}

float readVoltage() {
    int adcValue = analogRead(VOLTAGE_PIN);
    // Voltage divider conversion - adjust based on your setup
    float voltage = (adcValue / 4095.0) * 3.3 * 100.0;  // Assuming 100:1 divider
    #ifdef MOCK_DATA
    voltage = 220.0 + random(-50, 50) / 10.0;
    #endif
    return voltage;
}

float readCurrent() {
    int adcValue = analogRead(CURRENT_PIN);
    // ACS712 conversion - adjust based on your sensor model
    float current = ((adcValue / 4095.0) * 3.3 - 2.5) / 0.066;  // For 30A model
    if (current < 0) current = 0;
    #ifdef MOCK_DATA
    current = systemOn && compressorOn ? 8.0 + random(-20, 20) / 10.0 : 0.5;
    #endif
    return current;
}

String getFilterCondition() {
    // Simulate filter condition based on runtime
    // In production, use a differential pressure sensor
    return "CLEAN";
}

String getAirflowStatus() {
    // Simulate airflow status
    // In production, use an airflow sensor
    return systemOn ? "NORMAL" : "OFF";
}

// ==================== CONTROL FUNCTIONS ====================

void setFanSpeed(String speed) {
    fanSpeed = speed;

    digitalWrite(FAN_LOW_PIN, LOW);
    digitalWrite(FAN_MED_PIN, LOW);
    digitalWrite(FAN_HIGH_PIN, LOW);

    if (!systemOn) return;

    if (speed == "LOW") {
        digitalWrite(FAN_LOW_PIN, HIGH);
    } else if (speed == "MED") {
        digitalWrite(FAN_MED_PIN, HIGH);
    } else if (speed == "HIGH") {
        digitalWrite(FAN_HIGH_PIN, HIGH);
    }

    Serial.printf("Fan speed set to: %s\n", speed.c_str());
}

void setMode(String mode) {
    operatingMode = mode;

    if (!systemOn) return;

    if (mode == "COOLING") {
        digitalWrite(COOLING_PIN, HIGH);
        digitalWrite(HEATING_PIN, LOW);
    } else if (mode == "HEATING") {
        digitalWrite(COOLING_PIN, LOW);
        digitalWrite(HEATING_PIN, HIGH);
    }

    Serial.printf("Mode set to: %s\n", mode.c_str());
}

void setSystemPower(bool on) {
    systemOn = on;

    if (on) {
        digitalWrite(SYSTEM_LED_PIN, HIGH);
        setFanSpeed(fanSpeed);
        setMode(operatingMode);
        Serial.println("System turned ON");
    } else {
        digitalWrite(COMPRESSOR_PIN, LOW);
        digitalWrite(FAN_LOW_PIN, LOW);
        digitalWrite(FAN_MED_PIN, LOW);
        digitalWrite(FAN_HIGH_PIN, LOW);
        digitalWrite(COOLING_PIN, LOW);
        digitalWrite(HEATING_PIN, LOW);
        digitalWrite(SYSTEM_LED_PIN, LOW);
        compressorOn = false;
        Serial.println("System turned OFF");
    }
}

void controlCompressor(float roomTemp, float setpoint) {
    if (!systemOn) {
        compressorOn = false;
        digitalWrite(COMPRESSOR_PIN, LOW);
        return;
    }

    float hysteresis = 0.5;  // Temperature hysteresis

    if (operatingMode == "COOLING") {
        if (roomTemp > setpoint + hysteresis && !compressorOn) {
            compressorOn = true;
            digitalWrite(COMPRESSOR_PIN, HIGH);
            Serial.println("Compressor ON (cooling)");
        } else if (roomTemp < setpoint - hysteresis && compressorOn) {
            compressorOn = false;
            digitalWrite(COMPRESSOR_PIN, LOW);
            Serial.println("Compressor OFF (setpoint reached)");
        }
    } else if (operatingMode == "HEATING") {
        if (roomTemp < setpoint - hysteresis && !compressorOn) {
            compressorOn = true;
            digitalWrite(COMPRESSOR_PIN, HIGH);
            Serial.println("Compressor ON (heating)");
        } else if (roomTemp > setpoint + hysteresis && compressorOn) {
            compressorOn = false;
            digitalWrite(COMPRESSOR_PIN, LOW);
            Serial.println("Compressor OFF (setpoint reached)");
        }
    }
}

// ==================== MQTT FUNCTIONS ====================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    String message;
    for (unsigned int i = 0; i < length; i++) {
        message += (char)payload[i];
    }

    Serial.printf("Received message on topic %s: %s\n", topic, message.c_str());

    // Parse JSON command
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
        Serial.printf("JSON parse error: %s\n", error.c_str());
        return;
    }

    // Process control commands
    if (doc.containsKey("systemOn")) {
        setSystemPower(doc["systemOn"].as<bool>());
    }

    if (doc.containsKey("mode")) {
        setMode(doc["mode"].as<String>());
    }

    if (doc.containsKey("fanSpeed")) {
        setFanSpeed(doc["fanSpeed"].as<String>());
    }

    if (doc.containsKey("temperatureSetpoint")) {
        temperatureSetpoint = doc["temperatureSetpoint"].as<float>();
        Serial.printf("Temperature setpoint: %.1f\n", temperatureSetpoint);
    }
}

void reconnectMQTT() {
    while (!mqttClient.connected()) {
        Serial.print("Connecting to MQTT...");

        String clientId = "ESP32-" + String(DEVICE_ID) + "-" + String(random(0xffff), HEX);

        if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
            Serial.println("connected!");

            // Subscribe to control topic
            mqttClient.subscribe(controlTopic.c_str());
            Serial.printf("Subscribed to: %s\n", controlTopic.c_str());

            // Publish status
            publishStatus();
        } else {
            Serial.printf("failed, rc=%d. Retrying in 5 seconds...\n", mqttClient.state());
            delay(5000);
        }
    }
}

void publishTelemetry() {
    // Read all sensors
    float supplyTemp = readTemperature(SUPPLY_TEMP_PIN);
    float returnTemp = readTemperature(RETURN_TEMP_PIN);
    float roomTemp = readTemperature(ROOM_TEMP_PIN);
    float humidity = readHumidity();
    float voltage = readVoltage();
    float current = readCurrent();
    float power = voltage * current;

    // Calculate energy (kWh)
    unsigned long now = millis();
    if (lastEnergyCalcTime > 0) {
        float hours = (now - lastEnergyCalcTime) / 3600000.0;
        totalEnergyKwh += (power / 1000.0) * hours;
    }
    lastEnergyCalcTime = now;

    // Mock outdoor temperature (in production, use weather API or outdoor sensor)
    float outdoorTemp = 32.0 + random(-30, 30) / 10.0;

    // Create JSON payload
    StaticJsonDocument<512> doc;

    // Environmental
    doc["supplyAirTemp"] = supplyTemp;
    doc["returnAirTemp"] = returnTemp;
    doc["roomTemp"] = roomTemp;
    doc["humidity"] = humidity;
    doc["outdoorTemp"] = outdoorTemp;

    // Electrical
    doc["lineVoltage"] = voltage;
    doc["currentAmps"] = current;
    doc["powerWatts"] = power;
    doc["energyKwh"] = totalEnergyKwh;

    // Mechanical
    doc["compressorOn"] = compressorOn;
    doc["fanSpeed"] = fanSpeed;
    doc["airflowStatus"] = getAirflowStatus();
    doc["filterCondition"] = getFilterCondition();

    String payload;
    serializeJson(doc, payload);

    mqttClient.publish(telemetryTopic.c_str(), payload.c_str());
    Serial.printf("Telemetry published: %s\n", payload.c_str());

    // Control compressor based on room temperature
    controlCompressor(roomTemp, temperatureSetpoint);
}

void publishStatus() {
    StaticJsonDocument<128> doc;
    doc["online"] = true;
    doc["systemOn"] = systemOn;
    doc["mode"] = operatingMode;
    doc["fanSpeed"] = fanSpeed;
    doc["temperatureSetpoint"] = temperatureSetpoint;

    String payload;
    serializeJson(doc, payload);

    mqttClient.publish(statusTopic.c_str(), payload.c_str());
    Serial.printf("Status published: %s\n", payload.c_str());
}

// ==================== WIFI FUNCTIONS ====================

void connectWiFi() {
    Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.printf("Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println();
        Serial.println("WiFi connection failed. Restarting...");
        ESP.restart();
    }
}

// ==================== SETUP ====================

void setup() {
    Serial.begin(115200);
    Serial.println("\n\n=== Smart HVAC IoT Controller ===");
    Serial.printf("Device ID: %s\n", DEVICE_ID);

    // Initialize pins
    pinMode(COMPRESSOR_PIN, OUTPUT);
    pinMode(FAN_LOW_PIN, OUTPUT);
    pinMode(FAN_MED_PIN, OUTPUT);
    pinMode(FAN_HIGH_PIN, OUTPUT);
    pinMode(COOLING_PIN, OUTPUT);
    pinMode(HEATING_PIN, OUTPUT);
    pinMode(SYSTEM_LED_PIN, OUTPUT);

    // Set all outputs to LOW initially
    digitalWrite(COMPRESSOR_PIN, LOW);
    digitalWrite(FAN_LOW_PIN, LOW);
    digitalWrite(FAN_MED_PIN, LOW);
    digitalWrite(FAN_HIGH_PIN, LOW);
    digitalWrite(COOLING_PIN, LOW);
    digitalWrite(HEATING_PIN, LOW);
    digitalWrite(SYSTEM_LED_PIN, LOW);

    // Initialize MQTT topics
    telemetryTopic = String("hvac/") + DEVICE_ID + "/telemetry";
    controlTopic = String("hvac/") + DEVICE_ID + "/control";
    statusTopic = String("hvac/") + DEVICE_ID + "/status";

    // Connect to WiFi
    connectWiFi();

    // Setup MQTT
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(512);

    // Connect to MQTT
    reconnectMQTT();

    Serial.println("Setup complete!");
}

// ==================== MAIN LOOP ====================

void loop() {
    // Maintain MQTT connection
    if (!mqttClient.connected()) {
        reconnectMQTT();
    }
    mqttClient.loop();

    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi disconnected. Reconnecting...");
        connectWiFi();
    }

    unsigned long now = millis();

    // Publish telemetry at interval
    if (now - lastTelemetryTime >= TELEMETRY_INTERVAL) {
        publishTelemetry();
        lastTelemetryTime = now;
    }

    // Publish heartbeat/status at interval
    if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
        publishStatus();
        lastHeartbeatTime = now;
    }

    // Small delay to prevent watchdog issues
    delay(10);
}

// ==================== MOCK DATA MODE ====================
// Uncomment the following line to use simulated sensor data
// #define MOCK_DATA
