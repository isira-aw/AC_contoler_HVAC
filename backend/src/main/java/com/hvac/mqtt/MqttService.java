package com.hvac.mqtt;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.TypeAdapter;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.google.gson.stream.JsonWriter;
import com.hvac.dto.ControlCommand;
import com.hvac.dto.TelemetryData;
import com.hvac.entity.Device;
import com.hvac.entity.Telemetry;
import com.hvac.repository.DeviceRepository;
import com.hvac.repository.TelemetryRepository;
import com.hvac.service.FaultDetectionService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

@Service
public class MqttService implements MqttCallback {

    private static final Logger logger = LoggerFactory.getLogger(MqttService.class);

    private final MqttClient mqttClient;
    private final MqttConnectOptions mqttConnectOptions;
    private final DeviceRepository deviceRepository;
    private final TelemetryRepository telemetryRepository;
    private final FaultDetectionService faultDetectionService;
    private final Gson gson = new GsonBuilder()
            .registerTypeAdapter(LocalDateTime.class, new TypeAdapter<LocalDateTime>() {
                private final DateTimeFormatter formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

                @Override
                public void write(JsonWriter out, LocalDateTime value) throws IOException {
                    if (value == null) {
                        out.nullValue();
                    } else {
                        out.value(formatter.format(value));
                    }
                }

                @Override
                public LocalDateTime read(JsonReader in) throws IOException {
                    if (in.peek() == JsonToken.NULL) {
                        in.nextNull();
                        return null;
                    }
                    return LocalDateTime.parse(in.nextString(), formatter);
                }
            })
            .create();

    @Value("${mqtt.topic.telemetry}")
    private String telemetryTopic;

    @Value("${mqtt.topic.status}")
    private String statusTopic;

    public MqttService(
            MqttClient mqttClient,
            MqttConnectOptions mqttConnectOptions,
            DeviceRepository deviceRepository,
            TelemetryRepository telemetryRepository,
            FaultDetectionService faultDetectionService
    ) {
        this.mqttClient = mqttClient;
        this.mqttConnectOptions = mqttConnectOptions;
        this.deviceRepository = deviceRepository;
        this.telemetryRepository = telemetryRepository;
        this.faultDetectionService = faultDetectionService;
    }

    @PostConstruct
    public void init() {
        mqttClient.setCallback(this);
        // Connect asynchronously to not block startup
        new Thread(() -> {
            try {
                Thread.sleep(2000); // Wait for app to fully start
                connect();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }).start();
        logger.info("MQTT service initialized, connecting in background...");
    }

    public void connect() {
        try {
            if (!mqttClient.isConnected()) {
                logger.info("Connecting to MQTT broker...");
                mqttClient.connect(mqttConnectOptions);
                logger.info("Connected to MQTT broker successfully!");
                subscribeToTopics();
            }
        } catch (MqttException e) {
            logger.warn("Failed to connect to MQTT broker: {}. Will retry on next operation.", e.getMessage());
        }
    }

    private void subscribeToTopics() throws MqttException {
        mqttClient.subscribe(telemetryTopic, 1);
        mqttClient.subscribe(statusTopic, 1);
        logger.info("Subscribed to topics: {}, {}", telemetryTopic, statusTopic);
    }

    @Override
    public void connectionLost(Throwable cause) {
        logger.warn("MQTT connection lost: {}", cause.getMessage());
        // Automatic reconnect is enabled in options
    }

    @Override
    public void messageArrived(String topic, MqttMessage message) {
        try {
            String payload = new String(message.getPayload());
            logger.debug("Received message on topic {}: {}", topic, payload);

            String[] parts = topic.split("/");
            if (parts.length >= 3) {
                String deviceId = parts[1];
                String messageType = parts[2];

                switch (messageType) {
                    case "telemetry" -> handleTelemetry(deviceId, payload);
                    case "status" -> handleStatus(deviceId, payload);
                    default -> logger.warn("Unknown message type: {}", messageType);
                }
            }
        } catch (Exception e) {
            logger.error("Error processing MQTT message", e);
        }
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) {
        logger.debug("Message delivered: {}", token.getMessageId());
    }

    private void handleTelemetry(String deviceId, String payload) {
        try {
            TelemetryData data = gson.fromJson(payload, TelemetryData.class);
            data.setDeviceId(deviceId);

            // Save telemetry
            Telemetry telemetry = new Telemetry();
            telemetry.setDeviceId(deviceId);
            telemetry.setSupplyAirTemp(data.getSupplyAirTemp());
            telemetry.setReturnAirTemp(data.getReturnAirTemp());
            telemetry.setRoomTemp(data.getRoomTemp());
            telemetry.setHumidity(data.getHumidity());
            telemetry.setOutdoorTemp(data.getOutdoorTemp());
            telemetry.setLineVoltage(data.getLineVoltage());
            telemetry.setCurrentAmps(data.getCurrentAmps());
            telemetry.setPowerWatts(data.getPowerWatts());
            telemetry.setEnergyKwh(data.getEnergyKwh());
            telemetry.setCompressorOn(data.getCompressorOn());
            telemetry.setFanSpeed(data.getFanSpeed());
            telemetry.setAirflowStatus(data.getAirflowStatus());
            telemetry.setFilterCondition(data.getFilterCondition());
            telemetry.setTimestamp(LocalDateTime.now());

            telemetryRepository.save(telemetry);

            // Update device heartbeat
            updateDeviceHeartbeat(deviceId);

            // Check for faults
            faultDetectionService.checkForFaults(deviceId, telemetry);

            logger.debug("Saved telemetry for device: {}", deviceId);
        } catch (Exception e) {
            logger.error("Error handling telemetry for device {}: {}", deviceId, e.getMessage());
        }
    }

    private void handleStatus(String deviceId, String payload) {
        try {
            Optional<Device> deviceOpt = deviceRepository.findByDeviceId(deviceId);
            if (deviceOpt.isPresent()) {
                Device device = deviceOpt.get();
                boolean wasOffline = !device.isOnline();

                // Update heartbeat and online status
                device.setLastHeartbeat(LocalDateTime.now());
                device.setOnline(true);
                deviceRepository.save(device);

                // If device was offline and is now coming online, sync the database state to it
                if (wasOffline) {
                    logger.info("Device {} came online, syncing database state to device", deviceId);
                    syncDeviceState(device);
                }
            }
            logger.debug("Status update from device: {}", deviceId);
        } catch (Exception e) {
            logger.error("Error handling status for device {}: {}", deviceId, e.getMessage());
        }
    }

    /**
     * Synchronizes the database state to the device.
     * This ensures that any changes made while the device was offline are applied.
     */
    private void syncDeviceState(Device device) {
        try {
            ControlCommand command = new ControlCommand();
            command.setDeviceId(device.getDeviceId());
            command.setSystemOn(device.isSystemOn());
            command.setMode(device.getMode());
            command.setFanSpeed(device.getFanSpeed());
            command.setTemperatureSetpoint(device.getTemperatureSetpoint());

            String topic = "hvac/" + device.getDeviceId() + "/control";
            String payload = gson.toJson(command);
            MqttMessage message = new MqttMessage(payload.getBytes());
            message.setQos(1);
            message.setRetained(false);
            mqttClient.publish(topic, message);

            logger.info("Synced state to device {}: systemOn={}, mode={}, fanSpeed={}, setpoint={}",
                    device.getDeviceId(), device.isSystemOn(), device.getMode(),
                    device.getFanSpeed(), device.getTemperatureSetpoint());
        } catch (MqttException e) {
            logger.error("Failed to sync state to device {}: {}", device.getDeviceId(), e.getMessage());
        }
    }

    private void updateDeviceHeartbeat(String deviceId) {
        Optional<Device> deviceOpt = deviceRepository.findByDeviceId(deviceId);
        if (deviceOpt.isPresent()) {
            Device device = deviceOpt.get();
            device.setLastHeartbeat(LocalDateTime.now());
            device.setOnline(true);
            deviceRepository.save(device);
        }
    }

    public void sendControlCommand(String deviceId, ControlCommand command) {
        try {
            String topic = "hvac/" + deviceId + "/control";
            String payload = gson.toJson(command);
            MqttMessage message = new MqttMessage(payload.getBytes());
            message.setQos(1);
            message.setRetained(false);
            mqttClient.publish(topic, message);
            logger.info("Sent control command to device {}: {}", deviceId, payload);

            // Update device state in database
            Optional<Device> deviceOpt = deviceRepository.findByDeviceId(deviceId);
            if (deviceOpt.isPresent()) {
                Device device = deviceOpt.get();
                boolean stateChanged = false;

                if (command.getSystemOn() != null && !command.getSystemOn().equals(device.isSystemOn())) {
                    device.setSystemOn(command.getSystemOn());
                    stateChanged = true;
                }
                if (command.getMode() != null && !command.getMode().equals(device.getMode())) {
                    device.setMode(command.getMode());
                    stateChanged = true;
                }
                if (command.getFanSpeed() != null && !command.getFanSpeed().equals(device.getFanSpeed())) {
                    device.setFanSpeed(command.getFanSpeed());
                    stateChanged = true;
                }
                if (command.getTemperatureSetpoint() != null && !command.getTemperatureSetpoint().equals(device.getTemperatureSetpoint())) {
                    device.setTemperatureSetpoint(command.getTemperatureSetpoint());
                    stateChanged = true;
                }

                // Increment config version when state changes to track offline updates
                if (stateChanged) {
                    device.setConfigVersion(device.getConfigVersion() + 1);
                    logger.info("Device {} config version incremented to {}", deviceId, device.getConfigVersion());
                }

                deviceRepository.save(device);
            }
        } catch (MqttException e) {
            logger.error("Failed to send control command to device {}: {}", deviceId, e.getMessage());
            throw new RuntimeException("Failed to send control command", e);
        }
    }

    public boolean isConnected() {
        return mqttClient.isConnected();
    }

    @PreDestroy
    public void disconnect() {
        try {
            if (mqttClient.isConnected()) {
                mqttClient.disconnect();
                logger.info("Disconnected from MQTT broker");
            }
        } catch (MqttException e) {
            logger.error("Error disconnecting from MQTT broker", e);
        }
    }
}
