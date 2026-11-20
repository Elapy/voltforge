/* 10 Benches — the known-good building-block library.
   FENCED GENERATION: every project 10 Benches produces is assembled from one
   of these hand-checked blocks plus whitelisted, validated parameters.
   User free text is NEVER injected into generated code; sketches come from
   these templates with numeric/enum parameters only.

   Block shape:
     id, name, short, keywords[],
     params: [{key,label,type:'pin'|'apin'|'number'|'enum'|'bool',def,...}]
     libraries: [names] (beyond the Arduino core)
     bom(p)     -> [{item, qty, note}] — real, named parts (model numbers)
     wiring(p)  -> [{from, to, note}] — references the same named parts
     sketch(p)  -> string (body below the shared header the engine adds)
     steps(p)   -> [assembly step strings]
     test       -> string (how the builder checks it works)
     cad(p)     -> {primary, parts: [{key, name, w, d, h (mm), mount, ...}]}
                   real dimensions of the block's primary sensor/actuator,
                   used by the engine's parametric enclosure (.scad) export
*/
(function () {
  'use strict';

  var blocks = [

    /* ------------------------------------------------ motion light */
    {
      id: 'motion-light',
      name: 'Motion-Activated Light',
      short: 'A PIR sensor switches a light on when someone walks in, and off again after the room goes quiet.',
      examplePrompt: 'A light that turns on when someone walks into the room',
      keywords: ['motion', 'pir', 'someone walks', 'walks in', 'walk in', 'presence', 'hallway', 'entry', 'night light', 'automatic light', 'turns on when', 'lamp', 'room light', 'motion sensor', 'movement'],
      libraries: [],
      params: [
        { key: 'sensorPin', label: 'PIR sensor signal pin', type: 'pin', def: 2 },
        { key: 'outputPin', label: 'Light output pin', type: 'pin', def: 8 },
        { key: 'holdSeconds', label: 'Stay on after last motion (seconds)', type: 'number', def: 30, min: 5, max: 300, unit: 's' },
        { key: 'useRelay', label: 'Drive a relay module (for a real lamp) instead of an LED', type: 'bool', def: false }
      ],
      bom: function (p) {
        var items = [
          { item: 'Arduino Uno R3 (or compatible)', qty: 1, note: 'The brain of the project' },
          { item: 'PIR motion sensor module (HC-SR501)', qty: 1, note: 'Detects body heat movement' },
          { item: 'Solderless breadboard, 400-point', qty: 1, note: '' },
          { item: 'Jumper wires (male-to-male, assorted)', qty: 1, note: 'A small pack is plenty' },
          { item: 'USB cable (A to B)', qty: 1, note: 'Powers the board and uploads code' }
        ];
        if (p.useRelay) {
          items.push({ item: 'Relay module, 1-channel, 5V (Songle SRD-05VDC-SL-C relay)', qty: 1, note: 'Switches the lamp circuit — mains wiring is an electrician job; use it with low-voltage lamps while learning' });
        } else {
          items.push({ item: 'LED, 5mm (any color)', qty: 1, note: 'Stands in for the lamp while you test' });
          items.push({ item: 'Resistor, 220 ohm', qty: 1, note: 'Protects the LED' });
        }
        return items;
      },
      wiring: function (p) {
        var rows = [
          { from: 'HC-SR501 PIR OUT', to: 'Arduino D' + p.sensorPin, note: 'Motion signal' },
          { from: 'HC-SR501 PIR VCC', to: 'Arduino 5V', note: '' },
          { from: 'HC-SR501 PIR GND', to: 'Arduino GND', note: '' }
        ];
        if (p.useRelay) {
          rows.push({ from: 'Relay module IN', to: 'Arduino D' + p.outputPin, note: 'Switch signal' });
          rows.push({ from: 'Relay module VCC', to: 'Arduino 5V', note: '' });
          rows.push({ from: 'Relay module GND', to: 'Arduino GND', note: '' });
        } else {
          rows.push({ from: 'Arduino D' + p.outputPin, to: '220 ohm resistor, then LED long leg (+)', note: 'Resistor and LED in series' });
          rows.push({ from: 'LED short leg (-)', to: 'Arduino GND', note: '' });
        }
        return rows;
      },
      sketch: function (p) {
        var out = p.useRelay ? 'relay' : 'LED';
        return [
          '// ' + (p.useRelay ? 'Relay' : 'LED') + ' on D' + p.outputPin + ' switches on when the PIR sees motion,',
          '// and off again ' + p.holdSeconds + 's after the last movement.',
          '',
          'const int PIR_PIN = ' + p.sensorPin + ';',
          'const int OUT_PIN = ' + p.outputPin + ';',
          'const unsigned long HOLD_MS = ' + (p.holdSeconds * 1000) + 'UL; // ' + p.holdSeconds + ' seconds',
          '',
          'unsigned long lastMotion = 0;',
          'bool lightOn = false;',
          '',
          'void setup() {',
          '  Serial.begin(9600);',
          '  pinMode(PIR_PIN, INPUT);',
          '  pinMode(OUT_PIN, OUTPUT);',
          '  digitalWrite(OUT_PIN, LOW);',
          '  Serial.println("Motion light ready. Give the PIR about 30 seconds to settle.");',
          '}',
          '',
          'void loop() {',
          '  if (digitalRead(PIR_PIN) == HIGH) {',
          '    lastMotion = millis();',
          '    if (!lightOn) {',
          '      digitalWrite(OUT_PIN, HIGH);',
          '      lightOn = true;',
          '      Serial.println("Motion - light ON");',
          '    }',
          '  }',
          '  if (lightOn && (millis() - lastMotion > HOLD_MS)) {',
          '    digitalWrite(OUT_PIN, LOW);',
          '    lightOn = false;',
          '    Serial.println("Quiet - light OFF");',
          '  }',
          '}'
        ].join('\n');
      },
      steps: function (p) {
        return [
          'Plug the PIR sensor into the breadboard. Connect its VCC to Arduino 5V and GND to Arduino GND.',
          'Connect the PIR OUT pin to Arduino D' + p.sensorPin + '.',
          p.useRelay
            ? 'Connect the relay module: IN to Arduino D' + p.outputPin + ', VCC to 5V, GND to GND. Leave the lamp side unwired until the signal side tests good.'
            : 'Build the LED circuit: Arduino D' + p.outputPin + ' -> 220 ohm resistor -> LED long leg. LED short leg -> GND.',
          'Connect the Arduino to your computer with the USB cable.',
          'Upload the sketch (see Upload steps), then open the Serial Monitor at 9600 baud.',
          'Wait about 30 seconds for the PIR to settle, then wave a hand in front of it.'
        ];
      },
      test: function (p) { return 'Wave a hand in front of the PIR: the ' + 'light turns on and the Serial Monitor prints "Motion - light ON". Stay still and it turns off after the hold time you set.'; },
      cad: function (p) {
        var parts = [
          { key: 'pir', name: 'HC-SR501 PIR motion sensor', w: 32, d: 24, h: 25, mount: 'lid', holeD: 23, note: 'Fresnel dome pokes through the lid hole' }
        ];
        if (p.useRelay) parts.push({ key: 'relay', name: 'Relay module (Songle SRD-05VDC-SL-C)', w: 51, d: 27, h: 19, mount: 'floor' });
        return { primary: 'pir', parts: parts };
      }
    },

    /* ------------------------------------------------ temp logger */
    {
      id: 'temp-logger',
      name: 'Temperature & Humidity Logger',
      short: 'A DHT climate sensor reads the room and prints timestamped temperature and humidity readings you can copy into a spreadsheet.',
      examplePrompt: 'Log the temperature and humidity in my room every minute',
      keywords: ['temperature', 'humidity', 'temp', 'climate', 'logger', 'log the', 'dht', 'thermometer', 'hygrometer', 'room readings', 'weather station', 'record the temperature'],
      libraries: ['DHT sensor library by Adafruit', 'Adafruit Unified Sensor (dependency of the DHT library)'],
      params: [
        { key: 'sensorType', label: 'Sensor model', type: 'enum', def: 'DHT11', options: [
          { v: 'DHT11', label: 'DHT11 (blue, basic)' },
          { v: 'DHT22', label: 'DHT22 (white, more precise)' }
        ] },
        { key: 'dataPin', label: 'Sensor data pin', type: 'pin', def: 2 },
        { key: 'intervalSeconds', label: 'Seconds between readings', type: 'number', def: 10, min: 2, max: 3600, unit: 's' }
      ],
      bom: function (p) {
        return [
          { item: 'Arduino Uno R3 (or compatible)', qty: 1, note: 'The brain of the project' },
          { item: p.sensorType + ' temperature & humidity sensor module (Aosong ' + (p.sensorType === 'DHT22' ? 'AM2302' : 'DHT11') + ')', qty: 1, note: 'Module version has the resistor built in' },
          { item: 'Solderless breadboard, 400-point', qty: 1, note: '' },
          { item: 'Jumper wires (male-to-male, assorted)', qty: 1, note: '' },
          { item: 'USB cable (A to B)', qty: 1, note: 'Readings travel over USB to the Serial Monitor' }
        ];
      },
      wiring: function (p) {
        return [
          { from: p.sensorType + ' sensor DATA (S)', to: 'Arduino D' + p.dataPin, note: 'Signal' },
          { from: p.sensorType + ' sensor VCC (+)', to: 'Arduino 5V', note: '' },
          { from: p.sensorType + ' sensor GND (-)', to: 'Arduino GND', note: '' }
        ];
      },
      sketch: function (p) {
        return [
          '// Reads a ' + p.sensorType + ' on D' + p.dataPin + ' every ' + p.intervalSeconds + 's and prints CSV rows',
          '// to the Serial Monitor: seconds, humidity %, temp C, temp F.',
          '// Copy the output straight into a spreadsheet to chart it.',
          '',
          '#include <DHT.h>',
          '',
          '#define DHT_PIN ' + p.dataPin,
          '#define DHT_TYPE ' + p.sensorType,
          '',
          'DHT dht(DHT_PIN, DHT_TYPE);',
          '',
          'const unsigned long INTERVAL_MS = ' + (p.intervalSeconds * 1000) + 'UL; // ' + p.intervalSeconds + ' seconds',
          'unsigned long startTime = 0;',
          '',
          'void setup() {',
          '  Serial.begin(9600);',
          '  dht.begin();',
          '  startTime = millis();',
          '  Serial.println("Time(s), Humidity(%), Temp(C), Temp(F)");',
          '}',
          '',
          'void loop() {',
          '  float h = dht.readHumidity();',
          '  float tc = dht.readTemperature();',
          '  float tf = dht.readTemperature(true);',
          '  unsigned long t = (millis() - startTime) / 1000UL;',
          '',
          '  if (isnan(h) || isnan(tc)) {',
          '    Serial.println("Sensor read failed - check the wiring and pin number.");',
          '  } else {',
          '    Serial.print(t);',
          '    Serial.print(", ");',
          '    Serial.print(h);',
          '    Serial.print(", ");',
          '    Serial.print(tc);',
          '    Serial.print(", ");',
          '    Serial.println(tf);',
          '  }',
          '  delay(INTERVAL_MS);',
          '}'
        ].join('\n');
      },
      steps: function (p) {
        return [
          'Plug the ' + p.sensorType + ' module into the breadboard.',
          'Connect DATA to Arduino D' + p.dataPin + ', VCC (+) to 5V, GND (-) to GND. Pin labels are printed on the module.',
          'Install the library before uploading: in the Arduino IDE, open Tools > Manage Libraries, search "DHT sensor library" by Adafruit, and install it (accept the Adafruit Unified Sensor dependency).',
          'Connect the Arduino by USB and upload the sketch (see Upload steps).',
          'Open Tools > Serial Monitor and set it to 9600 baud.'
        ];
      },
      test: function (p) { return 'Readings appear every ' + p.intervalSeconds + ' seconds as CSV rows. Breathe gently on the sensor: humidity and temperature should climb, then settle back.'; },
      cad: function (p) {
        return { primary: 'dht', parts: [
          { key: 'dht', name: p.sensorType + ' sensor module (Aosong)', w: 32, d: 15, h: 10, mount: 'lid', ventW: 22, ventD: 9, note: 'Sits under lid vent slots so room air reaches it' }
        ] };
      }
    },

    /* ------------------------------------------------ plant monitor */
    {
      id: 'plant-monitor',
      name: 'Plant Watering Monitor',
      short: 'A soil-moisture probe watches your plant, lights up and beeps when the soil dries out — and can run a small pump to water it.',
      examplePrompt: 'Tell me when my plant needs watering',
      keywords: ['plant', 'water', 'watering', 'soil', 'moisture', 'garden', 'pot', 'dry soil', 'thirsty', 'greenhouse', 'seedling'],
      libraries: [],
      params: [
        { key: 'sensorPin', label: 'Soil sensor analog pin', type: 'apin', def: 'A0' },
        { key: 'dryThreshold', label: 'Dry threshold (reading at/above = dry)', type: 'number', def: 550, min: 100, max: 1000, help: 'Calibrate: note the reading in wet soil and in dry soil, then set this between them. On most modules the reading rises as soil dries.' },
        { key: 'ledPin', label: 'Alert LED pin', type: 'pin', def: 8 },
        { key: 'buzzerPin', label: 'Buzzer pin', type: 'pin', def: 9 },
        { key: 'checkSeconds', label: 'Seconds between checks', type: 'number', def: 30, min: 5, max: 3600, unit: 's' },
        { key: 'usePump', label: 'Also run a pump (via relay) when dry', type: 'bool', def: false },
        { key: 'pumpPin', label: 'Pump relay pin', type: 'pin', def: 10 }
      ],
      bom: function (p) {
        var items = [
          { item: 'Arduino Uno R3 (or compatible)', qty: 1, note: 'The brain of the project' },
          { item: 'Capacitive soil moisture sensor v1.2', qty: 1, note: 'Capacitive lasts far longer in soil than the fork type; the probe goes in the pot, the electronics board stays dry' },
          { item: 'LED, 5mm', qty: 1, note: 'The "water me" light' },
          { item: 'Resistor, 220 ohm', qty: 1, note: 'Protects the LED' },
          { item: 'Active buzzer, 5V', qty: 1, note: 'Beeps when the soil is dry' },
          { item: 'Solderless breadboard, 400-point', qty: 1, note: '' },
          { item: 'Jumper wires (male-to-male, assorted)', qty: 1, note: '' },
          { item: 'USB cable (A to B)', qty: 1, note: '' }
        ];
        if (p.usePump) {
          items.push({ item: 'Relay module, 1-channel, 5V (Songle SRD-05VDC-SL-C relay)', qty: 1, note: 'Switches the pump' });
          items.push({ item: 'Mini submersible water pump, 3-5V, with tube', qty: 1, note: 'Power it from a separate USB supply, not the Arduino pin' });
        }
        return items;
      },
      wiring: function (p) {
        var rows = [
          { from: 'Soil sensor v1.2 AOUT', to: 'Arduino ' + p.sensorPin, note: 'Moisture signal' },
          { from: 'Soil sensor v1.2 VCC', to: 'Arduino 5V', note: '' },
          { from: 'Soil sensor v1.2 GND', to: 'Arduino GND', note: '' },
          { from: 'Arduino D' + p.ledPin, to: '220 ohm resistor, then LED long leg (+)', note: '' },
          { from: 'LED short leg (-)', to: 'Arduino GND', note: '' },
          { from: 'Buzzer + ', to: 'Arduino D' + p.buzzerPin, note: '' },
          { from: 'Buzzer - ', to: 'Arduino GND', note: '' }
        ];
        if (p.usePump) {
          rows.push({ from: 'Relay module IN', to: 'Arduino D' + p.pumpPin, note: 'Pump switch signal' });
          rows.push({ from: 'Relay module VCC / GND', to: 'Arduino 5V / GND', note: '' });
          rows.push({ from: 'Pump power', to: 'Through the relay contacts, from a separate 5V USB supply', note: 'Never power a pump straight from an Arduino pin' });
        }
        return rows;
      },
      sketch: function (p) {
        var lines = [
          '// Reads the soil sensor on ' + p.sensorPin + ' every ' + p.checkSeconds + 's.',
          '// Readings RISE as the soil dries on most modules. Calibrate first:',
          '// run it once, note the reading in freshly watered soil and in dry soil,',
          '// then set DRY_THRESHOLD between the two.',
          '',
          'const int SOIL_PIN = ' + p.sensorPin + ';',
          'const int LED_PIN = ' + p.ledPin + ';',
          'const int BUZZER_PIN = ' + p.buzzerPin + ';'
        ];
        if (p.usePump) lines.push('const int PUMP_PIN = ' + p.pumpPin + ';');
        lines = lines.concat([
          'const int DRY_THRESHOLD = ' + p.dryThreshold + ';',
          'const unsigned long CHECK_MS = ' + (p.checkSeconds * 1000) + 'UL; // ' + p.checkSeconds + ' seconds',
          '',
          'void setup() {',
          '  Serial.begin(9600);',
          '  pinMode(LED_PIN, OUTPUT);',
          '  pinMode(BUZZER_PIN, OUTPUT);'
        ]);
        if (p.usePump) lines.push('  pinMode(PUMP_PIN, OUTPUT);', '  digitalWrite(PUMP_PIN, LOW);');
        lines = lines.concat([
          '  Serial.println("Plant monitor ready. Readings print every check.");',
          '}',
          '',
          'void beep(int times) {',
          '  for (int i = 0; i < times; i++) {',
          '    digitalWrite(BUZZER_PIN, HIGH);',
          '    delay(150);',
          '    digitalWrite(BUZZER_PIN, LOW);',
          '    delay(150);',
          '  }',
          '}',
          '',
          'void loop() {',
          '  int reading = analogRead(SOIL_PIN);',
          '  Serial.print("Soil reading: ");',
          '  Serial.println(reading);',
          '',
          '  if (reading >= DRY_THRESHOLD) {',
          '    Serial.println("Soil is DRY.");',
          '    digitalWrite(LED_PIN, HIGH);',
          '    beep(2);'
        ]);
        if (p.usePump) {
          lines = lines.concat([
            '    Serial.println("Watering for 3 seconds...");',
            '    digitalWrite(PUMP_PIN, HIGH);',
            '    delay(3000);',
            '    digitalWrite(PUMP_PIN, LOW);',
            '    delay(60000); // let the water soak in before checking again'
          ]);
        }
        lines = lines.concat([
          '  } else {',
          '    digitalWrite(LED_PIN, LOW);',
          '  }',
          '  delay(CHECK_MS);',
          '}'
        ]);
        return lines.join('\n');
      },
      steps: function (p) {
        var s = [
          'Push the soil sensor into the breadboard area (the probe end goes in the plant pot later). Connect AOUT to Arduino ' + p.sensorPin + ', VCC to 5V, GND to GND.',
          'Wire the alert LED: Arduino D' + p.ledPin + ' -> 220 ohm resistor -> LED long leg; short leg to GND.',
          'Wire the buzzer: + to Arduino D' + p.buzzerPin + ', - to GND.'
        ];
        if (p.usePump) s.push('Wire the relay: IN to Arduino D' + p.pumpPin + ', VCC to 5V, GND to GND. Put the pump in a cup of water with its tube aimed at the plant, and route its power through the relay contacts from a separate 5V supply.');
        s.push('Upload the sketch (see Upload steps) and open the Serial Monitor at 9600 baud.');
        s.push('Calibrate: read the number with the probe in dry soil, then in freshly watered soil. Set the dry threshold between them by regenerating with your value.');
        s.push('Push the probe into the plant pot, about halfway down the soil.');
        return s;
      },
      test: function (p) { return 'Pull the probe out of the soil (dry air reads as very dry): the LED lights and the buzzer beeps twice each check. Push it into watered soil and the alerts stop.'; },
      cad: function (p) {
        var parts = [
          { key: 'soil', name: 'Capacitive soil sensor v1.2 — electronics head', w: 22, d: 15, h: 6, mount: 'slot', slotW: 26, slotH: 9, note: 'Probe cable exits through the front-wall slot; the probe itself lives in the plant pot' },
          { key: 'buzzer', name: 'Active buzzer, 5V', w: 12, d: 12, h: 10, mount: 'lid', holeD: 6, note: 'Sound hole in the lid' }
        ];
        if (p.usePump) parts.push({ key: 'relay', name: 'Relay module (Songle SRD-05VDC-SL-C)', w: 51, d: 27, h: 19, mount: 'floor' });
        return { primary: 'soil', parts: parts };
      }
    },

    /* ------------------------------------------------ distance alarm */
    {
      id: 'distance-alarm',
      name: 'Ultrasonic Distance Alarm',
      short: 'An ultrasonic sensor measures how close things get — and buzzes when something crosses your line. Garage parking helper, door watcher, desk guardian.',
      examplePrompt: 'An alarm that buzzes when something gets too close',
      keywords: ['distance', 'ultrasonic', 'alarm', 'parking', 'garage', 'proximity', 'too close', 'gets close', 'door watcher', 'intruder', 'backup', 'hc-sr04', 'sonar', 'range'],
      libraries: [],
      params: [
        { key: 'trigPin', label: 'Ultrasonic TRIG pin', type: 'pin', def: 9 },
        { key: 'echoPin', label: 'Ultrasonic ECHO pin', type: 'pin', def: 10 },
        { key: 'buzzerPin', label: 'Buzzer pin', type: 'pin', def: 6 },
        { key: 'ledPin', label: 'LED pin', type: 'pin', def: 7 },
        { key: 'alarmCm', label: 'Alarm distance (cm)', type: 'number', def: 30, min: 5, max: 200, unit: 'cm' }
      ],
      bom: function (p) {
        return [
          { item: 'Arduino Uno R3 (or compatible)', qty: 1, note: 'The brain of the project' },
          { item: 'Ultrasonic distance sensor (HC-SR04)', qty: 1, note: 'The two "eyes" are the sender and receiver' },
          { item: 'Active buzzer, 5V', qty: 1, note: '' },
          { item: 'LED, 5mm', qty: 1, note: '' },
          { item: 'Resistor, 220 ohm', qty: 1, note: 'Protects the LED' },
          { item: 'Solderless breadboard, 400-point', qty: 1, note: '' },
          { item: 'Jumper wires (male-to-male, assorted)', qty: 1, note: '' },
          { item: 'USB cable (A to B)', qty: 1, note: '' }
        ];
      },
      wiring: function (p) {
        return [
          { from: 'HC-SR04 TRIG', to: 'Arduino D' + p.trigPin, note: 'Trigger pulse out' },
          { from: 'HC-SR04 ECHO', to: 'Arduino D' + p.echoPin, note: 'Echo pulse back' },
          { from: 'HC-SR04 VCC', to: 'Arduino 5V', note: '' },
          { from: 'HC-SR04 GND', to: 'Arduino GND', note: '' },
          { from: 'Buzzer + ', to: 'Arduino D' + p.buzzerPin, note: '' },
          { from: 'Buzzer - ', to: 'Arduino GND', note: '' },
          { from: 'Arduino D' + p.ledPin, to: '220 ohm resistor, then LED long leg (+)', note: '' },
          { from: 'LED short leg (-)', to: 'Arduino GND', note: '' }
        ];
      },
      sketch: function (p) {
        return [
          '// HC-SR04: send a 10us pulse on TRIG, time the ECHO reply, convert to cm.',
          '// Buzzer and LED fire when anything is within ' + p.alarmCm + ' cm.',
          '',
          'const int TRIG_PIN = ' + p.trigPin + ';',
          'const int ECHO_PIN = ' + p.echoPin + ';',
          'const int BUZZER_PIN = ' + p.buzzerPin + ';',
          'const int LED_PIN = ' + p.ledPin + ';',
          'const int ALARM_CM = ' + p.alarmCm + ';',
          '',
          'void setup() {',
          '  Serial.begin(9600);',
          '  pinMode(TRIG_PIN, OUTPUT);',
          '  pinMode(ECHO_PIN, INPUT);',
          '  pinMode(BUZZER_PIN, OUTPUT);',
          '  pinMode(LED_PIN, OUTPUT);',
          '}',
          '',
          'long readCm() {',
          '  digitalWrite(TRIG_PIN, LOW);',
          '  delayMicroseconds(2);',
          '  digitalWrite(TRIG_PIN, HIGH);',
          '  delayMicroseconds(10);',
          '  digitalWrite(TRIG_PIN, LOW);',
          '  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout',
          '  if (duration == 0) return -1; // nothing in range',
          '  return duration * 0.034 / 2; // speed of sound, round trip halved',
          '}',
          '',
          'void loop() {',
          '  long cm = readCm();',
          '  if (cm < 0) {',
          '    Serial.println("Out of range");',
          '    digitalWrite(LED_PIN, LOW);',
          '    noTone(BUZZER_PIN);',
          '  } else {',
          '    Serial.print(cm);',
          '    Serial.println(" cm");',
          '    if (cm <= ALARM_CM) {',
          '      digitalWrite(LED_PIN, HIGH);',
          '      tone(BUZZER_PIN, 1200);',
          '    } else {',
          '      digitalWrite(LED_PIN, LOW);',
          '      noTone(BUZZER_PIN);',
          '    }',
          '  }',
          '  delay(120);',
          '}'
        ].join('\n');
      },
      steps: function (p) {
        return [
          'Plug the HC-SR04 into the breadboard. Connect VCC to 5V and GND to GND.',
          'Connect TRIG to Arduino D' + p.trigPin + ' and ECHO to Arduino D' + p.echoPin + '.',
          'Wire the buzzer (+ to D' + p.buzzerPin + ', - to GND) and the LED (D' + p.ledPin + ' -> 220 ohm resistor -> LED long leg; short leg to GND).',
          'Upload the sketch (see Upload steps) and open the Serial Monitor at 9600 baud.',
          'Point the sensor at a wall and move your hand toward it slowly.'
        ];
      },
      test: function (p) { return 'Distances print in cm. Bring your hand inside ' + p.alarmCm + ' cm: the LED lights and the buzzer sounds until you move away.'; },
      cad: function (p) {
        return { primary: 'sr04', parts: [
          { key: 'sr04', name: 'HC-SR04 ultrasonic sensor', w: 45, d: 20, h: 15, mount: 'front', holeD: 16, holeGap: 26, note: 'Both transducer "eyes" look through the front-wall holes' },
          { key: 'buzzer', name: 'Active buzzer, 5V', w: 12, d: 12, h: 10, mount: 'lid', holeD: 6, note: 'Sound hole in the lid' }
        ] };
      }
    },

    /* ------------------------------------------------ sun tracker */
    {
      id: 'sun-tracker',
      name: 'Light-Tracking Servo',
      short: 'Two light sensors and a servo that turns toward the brightest light — the sunflower trick behind solar panel trackers.',
      examplePrompt: 'A servo that turns to follow the light',
      keywords: ['servo', 'track', 'sun', 'solar', 'follow the light', 'light follow', 'ldr', 'photoresistor', 'sunflower', 'panel', 'brightest', 'turns toward'],
      libraries: ['Servo (built into the Arduino IDE — nothing to install)'],
      params: [
        { key: 'servoPin', label: 'Servo signal pin', type: 'pin', def: 9 },
        { key: 'leftPin', label: 'Left light sensor pin', type: 'apin', def: 'A0' },
        { key: 'rightPin', label: 'Right light sensor pin', type: 'apin', def: 'A1' },
        { key: 'tolerance', label: 'Dead-band tolerance (bigger = calmer)', type: 'number', def: 40, min: 5, max: 300 },
        { key: 'updateMs', label: 'Update interval (ms)', type: 'number', def: 100, min: 20, max: 1000, unit: 'ms' }
      ],
      bom: function (p) {
        return [
          { item: 'Arduino Uno R3 (or compatible)', qty: 1, note: 'The brain of the project' },
          { item: 'Micro servo motor (TowerPro SG90)', qty: 1, note: 'The muscle — turns the sensor head' },
          { item: 'Photoresistor (LDR / GL5528)', qty: 2, note: 'The two "eyes" that compare light levels' },
          { item: 'Resistor, 10k ohm', qty: 2, note: 'One per LDR, forms the voltage divider' },
          { item: 'Solderless breadboard, 400-point', qty: 1, note: '' },
          { item: 'Jumper wires (male-to-male, assorted)', qty: 1, note: '' },
          { item: 'Cardboard or a small bracket', qty: 1, note: 'Mounts the LDRs on the servo horn, with a divider fin between them' },
          { item: 'USB cable (A to B)', qty: 1, note: '' }
        ];
      },
      wiring: function (p) {
        return [
          { from: 'SG90 servo signal (orange/yellow wire)', to: 'Arduino D' + p.servoPin, note: '' },
          { from: 'SG90 servo power (red wire)', to: 'Arduino 5V', note: 'A small SG90 is fine on USB power' },
          { from: 'SG90 servo ground (brown/black wire)', to: 'Arduino GND', note: '' },
          { from: 'Left LDR leg 1', to: 'Arduino 5V', note: '' },
          { from: 'Left LDR leg 2', to: 'Arduino ' + p.leftPin + ' AND one end of a 10k resistor', note: 'The divider midpoint is the signal' },
          { from: 'Left 10k resistor other end', to: 'Arduino GND', note: '' },
          { from: 'Right LDR leg 1', to: 'Arduino 5V', note: '' },
          { from: 'Right LDR leg 2', to: 'Arduino ' + p.rightPin + ' AND one end of a 10k resistor', note: '' },
          { from: 'Right 10k resistor other end', to: 'Arduino GND', note: '' }
        ];
      },
      sketch: function (p) {
        return [
          '// Two LDRs compare light left vs right. The servo nudges toward',
          '// whichever side is brighter, until both sides match.',
          '',
          '#include <Servo.h>',
          '',
          'Servo tracker;',
          '',
          'const int SERVO_PIN = ' + p.servoPin + ';',
          'const int LEFT_PIN = ' + p.leftPin + ';',
          'const int RIGHT_PIN = ' + p.rightPin + ';',
          'const int TOLERANCE = ' + p.tolerance + ';',
          'const int UPDATE_MS = ' + p.updateMs + ';',
          '',
          'int angle = 90; // start centered',
          '',
          'void setup() {',
          '  Serial.begin(9600);',
          '  tracker.attach(SERVO_PIN);',
          '  tracker.write(angle);',
          '}',
          '',
          'void loop() {',
          '  int left = analogRead(LEFT_PIN);',
          '  int right = analogRead(RIGHT_PIN);',
          '  int diff = left - right;',
          '',
          '  if (diff > TOLERANCE && angle < 180) {',
          '    angle++; // brighter on the left',
          '  } else if (diff < -TOLERANCE && angle > 0) {',
          '    angle--; // brighter on the right',
          '  }',
          '  tracker.write(angle);',
          '',
          '  Serial.print("L:");',
          '  Serial.print(left);',
          '  Serial.print(" R:");',
          '  Serial.print(right);',
          '  Serial.print(" angle:");',
          '  Serial.println(angle);',
          '',
          '  delay(UPDATE_MS);',
          '}'
        ].join('\n');
      },
      steps: function (p) {
        return [
          'Build the two LDR dividers on the breadboard: each LDR goes from 5V to its analog pin (' + p.leftPin + ' left, ' + p.rightPin + ' right), with a 10k resistor from the same pin to GND.',
          'Connect the servo: signal to Arduino D' + p.servoPin + ', red to 5V, brown/black to GND.',
          'Mount both LDRs on the servo horn (cardboard works) side by side, with a small upright fin between them so each sees its own side.',
          'Upload the sketch (see Upload steps) and open the Serial Monitor at 9600 baud.',
          'If the tracker turns AWAY from the light, swap the two LDR pin numbers — every bench is mirrored differently.'
        ];
      },
      test: function (p) { return 'Shine a phone flashlight from the left: the servo turns toward it. Move the light right and it follows. Shade one LDR with a finger and it turns that way too.'; },
      cad: function (p) {
        return { primary: 'servo', parts: [
          { key: 'servo', name: 'TowerPro SG90 micro servo', w: 22.2, d: 11.8, h: 31, mount: 'top', note: 'Drops into the lid-top bracket window' },
          { key: 'ldrpanel', name: 'GL5528 LDR pair + divider fin (rides on the servo horn)', w: 44, d: 12, h: 20, mount: 'horn', holeD: 5.2, holeGap: 24, note: 'Printed panel: two LDR holes with a shade fin between them' }
        ] };
      }
    },

    /* ------------------------------------------------ sound meter */
    {
      id: 'sound-meter',
      name: 'Sound Level Meter',
      short: 'A microphone module and a 5-LED bar graph that dances with the noise in the room — clap and it jumps.',
      examplePrompt: 'A meter that shows how loud the room is with LEDs',
      keywords: ['sound', 'noise', 'loud', 'volume', 'meter', 'microphone', 'mic', 'decibel', 'db', 'level', 'bar graph', 'voice', 'clap'],
      libraries: [],
      params: [
        { key: 'micPin', label: 'Microphone analog pin', type: 'apin', def: 'A0' },
        { key: 'firstLedPin', label: 'First LED pin (LEDs use this pin + the next 4)', type: 'pin', def: 3 },
        { key: 'threshold', label: 'Quiet threshold (raise in a noisy room)', type: 'number', def: 25, min: 5, max: 200 }
      ],
      bom: function (p) {
        return [
          { item: 'Arduino Uno R3 (or compatible)', qty: 1, note: 'The brain of the project' },
          { item: 'Analog sound sensor module (KY-038 or MAX4466)', qty: 1, note: 'Use its analog output (A0 on the module)' },
          { item: 'LED, 5mm (mixed colors look great)', qty: 5, note: 'The bar graph — green to red is the classic look' },
          { item: 'Resistor, 220 ohm', qty: 5, note: 'One per LED' },
          { item: 'Solderless breadboard, 400-point', qty: 1, note: '' },
          { item: 'Jumper wires (male-to-male, assorted)', qty: 1, note: '' },
          { item: 'USB cable (A to B)', qty: 1, note: '' }
        ];
      },
      wiring: function (p) {
        var rows = [
          { from: 'KY-038 mic A0 (analog out)', to: 'Arduino ' + p.micPin, note: '' },
          { from: 'KY-038 mic VCC', to: 'Arduino 5V', note: '' },
          { from: 'KY-038 mic GND', to: 'Arduino GND', note: '' }
        ];
        for (var i = 0; i < 5; i++) {
          rows.push({ from: 'Arduino D' + (p.firstLedPin + i), to: '220 ohm resistor, then LED ' + (i + 1) + ' long leg (+)', note: i === 0 ? 'LEDs run on consecutive pins from your first pin' : '' });
        }
        rows.push({ from: 'All LED short legs (-)', to: 'Arduino GND rail', note: 'Share one ground rail on the breadboard' });
        return rows;
      },
      sketch: function (p) {
        return [
          '// Samples the mic for 50ms windows, measures peak-to-peak loudness,',
          '// and lights 0-5 LEDs as a bar graph.',
          '',
          'const int MIC_PIN = ' + p.micPin + ';',
          'const int FIRST_LED = ' + p.firstLedPin + ';',
          'const int LED_COUNT = 5;',
          'const int QUIET = ' + p.threshold + '; // peak-to-peak below this = silence',
          '',
          'void setup() {',
          '  Serial.begin(9600);',
          '  for (int i = 0; i < LED_COUNT; i++) {',
          '    pinMode(FIRST_LED + i, OUTPUT);',
          '  }',
          '}',
          '',
          'void loop() {',
          '  int minVal = 1023;',
          '  int maxVal = 0;',
          '  unsigned long start = millis();',
          '  while (millis() - start < 50) {',
          '    int v = analogRead(MIC_PIN);',
          '    if (v < minVal) minVal = v;',
          '    if (v > maxVal) maxVal = v;',
          '  }',
          '  int amp = maxVal - minVal;',
          '  int level = 0;',
          '  if (amp > QUIET) {',
          '    level = map(amp, QUIET, 400, 1, LED_COUNT);',
          '    level = constrain(level, 1, LED_COUNT);',
          '  }',
          '  for (int i = 0; i < LED_COUNT; i++) {',
          '    digitalWrite(FIRST_LED + i, i < level ? HIGH : LOW);',
          '  }',
          '  Serial.println(amp); // watch this in the Serial Plotter (Tools menu)',
          '}'
        ].join('\n');
      },
      steps: function (p) {
        return [
          'Connect the mic module: A0 (analog out) to Arduino ' + p.micPin + ', VCC to 5V, GND to GND.',
          'Build the LED row: for each of the 5 LEDs, Arduino pin (starting at D' + p.firstLedPin + ', consecutive) -> 220 ohm resistor -> LED long leg. All short legs go to the GND rail.',
          'Upload the sketch (see Upload steps).',
          'Open Tools > Serial Plotter to see the loudness wave, or just watch the LEDs.'
        ];
      },
      test: function (p) { return 'Quiet room: no LEDs (or the first flickers). Clap once: the bar jumps to the top. If the room noise alone lights LEDs, regenerate with a higher quiet threshold.'; },
      cad: function (p) {
        return { primary: 'mic', parts: [
          { key: 'mic', name: 'KY-038 sound sensor module', w: 33, d: 15, h: 13, mount: 'lid', holeD: 10, note: 'Microphone capsule listens through the lid hole' },
          { key: 'ledbar', name: 'LED bar graph (5x 5mm LEDs)', w: 60, d: 8, h: 9, mount: 'lid', holes: 5, holeD: 5.2, holeGap: 12, note: 'The five bar-graph LEDs poke through the lid in a row' }
        ] };
      }
    }
  ];

  window.VFBlocks = blocks;
})();
