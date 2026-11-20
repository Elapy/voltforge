/* 10 Benches — behavior simulator.
   Each block gets a small state machine that mirrors its sketch's logic
   exactly — same thresholds, same hold times, same pins — driven by the
   project's OWN validated parameters (VFSim.create receives the same
   params object the sketch was generated from, so changing a setting
   changes the sketch and the simulation together).

   Where a block measures a physical quantity, the simulated world moves
   over time: soil dries, rooms drift toward a temperature, objects
   approach and retreat, light sweeps, noise fluctuates. Sliders set the
   conditions; time does the rest.

   HONEST LABEL: this is a behavior/logic simulation. It is not an
   electrical or circuit simulation — no voltages, currents, or timing
   at the pin level. The panel says so, in those words.

   Structure: VFSim.create(blockId, params) is pure logic (no DOM) so the
   test harness can drive it directly. VFSim.mountPanel(container,
   project) builds the in-builder panel on top of a core, rendering only
   through createElement/textContent like the rest of the app. */
(function () {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ================================================= motion light
     Sketch logic: PIR HIGH -> light on, lastMotion = now; light off once
     now - lastMotion > HOLD_MS. Ambient light is NOT a device input in
     the sketch (there is no light sensor in the parts list) — here it
     only lights the scene, and the panel says so. */
  function createMotion(p) {
    var inputs = { motion: false, ambient: 300, dayCycle: false };
    var now = 0, lastMotion = -1e12, cycleT = 0, ambientNow = 300;
    return {
      inputs: inputs,
      setInput: function (k, v) { inputs[k] = v; },
      tick: function (dt) {
        now += dt;
        if (inputs.motion) lastMotion = now;
        if (inputs.dayCycle) {
          cycleT += dt;
          ambientNow = Math.round(clamp(500 + 460 * Math.sin((cycleT % 120) / 120 * Math.PI * 2 - Math.PI / 2), 5, 1000));
        } else {
          ambientNow = inputs.ambient;
        }
      },
      state: function () {
        var on = (now - lastMotion) <= p.holdSeconds;
        return {
          lightOn: on,
          countdown: on ? Math.max(0, p.holdSeconds - (now - lastMotion)) : 0,
          holdSeconds: p.holdSeconds,
          ambient: ambientNow,
          motion: !!inputs.motion,
          sensorPin: p.sensorPin,
          outputPin: p.outputPin,
          outputKind: p.useRelay ? 'Relay (lamp)' : 'LED (lamp)'
        };
      }
    };
  }

  /* ================================================= temp/humidity logger
     The room drifts toward the conditions you set, with sensor-like
     noise; a reading is logged every intervalSeconds of simulated time,
     in the same CSV shape the sketch prints. DHT11 reports whole
     numbers, DHT22 tenths — like the real sensors. */
  function createTemp(p) {
    var inputs = { tempTarget: 22, humTarget: 45 };
    var now = 0, sinceLog = 0, temp = 21.4, hum = 43.2, log = [];
    function q(v) { return p.sensorType === 'DHT11' ? Math.round(v) : Math.round(v * 10) / 10; }
    return {
      inputs: inputs,
      setInput: function (k, v) { inputs[k] = v; },
      tick: function (dt) {
        now += dt;
        sinceLog += dt;
        temp += (inputs.tempTarget - temp) * Math.min(1, dt * 0.08) + (Math.random() - 0.5) * 0.1 * dt;
        hum += (inputs.humTarget - hum) * Math.min(1, dt * 0.08) + (Math.random() - 0.5) * 0.25 * dt;
        temp = clamp(temp, -5, 50);
        hum = clamp(hum, 5, 99);
        if (sinceLog >= p.intervalSeconds) {
          sinceLog -= p.intervalSeconds;
          var tc = q(temp), h = q(hum);
          log.push({ t: Math.round(now), h: h, tc: tc, tf: Math.round((tc * 9 / 5 + 32) * 10) / 10 });
          if (log.length > 48) log.shift();
        }
      },
      state: function () {
        return {
          log: log.slice(),
          tempNow: q(temp), humNow: q(hum),
          nextIn: Math.max(0, Math.ceil(p.intervalSeconds - sinceLog)),
          intervalSeconds: p.intervalSeconds,
          sensorType: p.sensorType,
          dataPin: p.dataPin
        };
      }
    };
  }

  /* ================================================= plant monitor
     Soil dries gradually: the analog reading RISES over time (the
     sketch's semantics) until a check finds it at/above the dry
     threshold — then LED on, two beeps, and (if fitted) the pump runs
     3 s and the sketch waits 60 s for the soak, exactly like the code. */
  function createPlant(p) {
    var inputs = { reading: 380 };
    var reading = 380, sinceCheck = 0, dry = false, ledOn = false;
    var pumpOn = false, pumpT = 0, soakT = 0, beeps = 0, checks = 0;
    var DRY_RATE = 0.55; // analog points per simulated second
    return {
      inputs: inputs,
      setInput: function (k, v) {
        if (k === 'reading') { reading = clamp(Number(v) || 0, 60, 1023); inputs.reading = reading; }
        else if (k === 'water') { reading = 315; inputs.reading = 315; }
        else inputs[k] = v;
      },
      tick: function (dt) {
        if (pumpOn) {
          pumpT -= dt;
          reading -= 45 * dt;
          if (pumpT <= 0) { pumpOn = false; soakT = 60; }
        } else if (soakT > 0) {
          soakT -= dt;
          reading -= 4 * dt;
        } else {
          reading += DRY_RATE * dt;
        }
        reading = clamp(reading, 60, 1023);
        sinceCheck += dt;
        if (sinceCheck >= p.checkSeconds && soakT <= 0 && !pumpOn) {
          sinceCheck = 0;
          checks++;
          dry = reading >= p.dryThreshold;
          ledOn = dry;
          if (dry) {
            beeps += 2;
            if (p.usePump) { pumpOn = true; pumpT = 3; }
          }
        }
      },
      state: function () {
        return {
          reading: Math.round(reading),
          dry: dry, ledOn: ledOn, pumpOn: pumpOn, soaking: soakT > 0,
          beeps: beeps, checks: checks,
          threshold: p.dryThreshold, sensorPin: p.sensorPin,
          usePump: !!p.usePump,
          status: pumpOn ? 'Watering (pump running)' : soakT > 0 ? 'Soaking in — checks paused, like the sketch' : dry ? 'DRY — water me' : 'Moist — all good'
        };
      }
    };
  }

  /* ================================================= distance alarm
     Mirrors the sketch: within alarmCm -> LED + buzzer; beyond the
     HC-SR04's range -> "Out of range". Auto mode walks an object toward
     and away from the sensor on its own. */
  function createDistance(p) {
    var inputs = { distance: 120, auto: false };
    var phase = 0, dist = 120;
    return {
      inputs: inputs,
      setInput: function (k, v) { inputs[k] = v; },
      tick: function (dt) {
        if (inputs.auto) {
          phase += dt;
          dist = 215 + 195 * Math.sin(phase * 0.45);
        } else {
          dist = Number(inputs.distance);
        }
      },
      state: function () {
        var out = dist > 400;
        var alarm = !out && dist <= p.alarmCm;
        return {
          distanceCm: Math.round(dist),
          outOfRange: out, alarm: alarm, ledOn: alarm, buzzerOn: alarm,
          alarmCm: p.alarmCm, trigPin: p.trigPin, echoPin: p.echoPin
        };
      }
    };
  }

  /* ================================================= sun tracker
     Mirrors the sketch loop: every updateMs, compare the two LDR
     readings; if the difference beats the tolerance, nudge the angle
     one degree toward the brighter side (angle++ when the LEFT is
     brighter — the sketch's own convention). Sun mode sweeps a virtual
     light across the sky and derives both LDR readings from it. */
  function createServo(p) {
    var inputs = { left: 500, right: 500, sun: false };
    var angle = 90, acc = 0, sunPos = -70, sunDir = 1, curL = 500, curR = 500;
    function readings() {
      if (inputs.sun) {
        return [clamp(620 - sunPos * 3.4, 0, 1023), clamp(620 + sunPos * 3.4, 0, 1023)];
      }
      return [Number(inputs.left), Number(inputs.right)];
    }
    return {
      inputs: inputs,
      setInput: function (k, v) { inputs[k] = v; },
      tick: function (dt) {
        if (inputs.sun) {
          sunPos += sunDir * dt * 14;
          if (sunPos > 80) { sunPos = 80; sunDir = -1; }
          if (sunPos < -80) { sunPos = -80; sunDir = 1; }
        }
        acc += dt;
        var step = p.updateMs / 1000;
        var guard = 0;
        while (acc >= step && guard < 200) {
          acc -= step;
          guard++;
          var r = readings();
          curL = r[0]; curR = r[1];
          var diff = curL - curR;
          if (diff > p.tolerance && angle < 180) angle++;
          else if (diff < -p.tolerance && angle > 0) angle--;
        }
      },
      state: function () {
        var r = readings();
        return {
          angle: angle,
          left: Math.round(r[0]), right: Math.round(r[1]),
          diff: Math.round(r[0] - r[1]),
          tolerance: p.tolerance, servoPin: p.servoPin
        };
      }
    };
  }

  /* ================================================= sound meter
     Mirrors the sketch: peak-to-peak amplitude per window; below the
     quiet threshold -> no LEDs; above -> map(amp, threshold, 400, 1, 5).
     Room noise wanders around the level you set; a clap is a spike. */
  function createSound(p) {
    var inputs = { loudness: 60 };
    var amp = 0, level = 0, clapT = 0, walk = 0;
    return {
      inputs: inputs,
      setInput: function (k, v) {
        if (k === 'clap') clapT = 0.35;
        else inputs[k] = v;
      },
      tick: function (dt) {
        walk = clamp(walk + (Math.random() - 0.5) * 26, -25, 25);
        var target = Number(inputs.loudness) + walk;
        if (clapT > 0) { clapT -= dt; target = 470; }
        amp += (target - amp) * Math.min(1, dt * 9);
        if (amp > p.threshold) {
          level = clamp(Math.floor((amp - p.threshold) / (400 - p.threshold) * 4) + 1, 1, 5);
        } else {
          level = 0;
        }
      },
      state: function () {
        return {
          amp: Math.round(amp), level: level,
          leds: [level > 0, level > 1, level > 2, level > 3, level > 4],
          threshold: p.threshold, micPin: p.micPin
        };
      }
    };
  }

  var CORES = {
    'motion-light': createMotion,
    'temp-logger': createTemp,
    'plant-monitor': createPlant,
    'distance-alarm': createDistance,
    'sun-tracker': createServo,
    'sound-meter': createSound
  };

  var DESCRIPTORS = {
    'motion-light': {
      blurb: 'The sketch switches on motion alone — there is no light sensor in this build — so ambient light here only lights the scene, letting you watch the lamp work at night. The hold countdown is the sketch\'s own.',
      speed: 10,
      inputs: [
        { key: 'motion', label: 'Motion in the room', type: 'toggle', def: false },
        { key: 'ambient', label: 'Ambient light (scene only)', type: 'range', min: 0, max: 1000, def: 300 },
        { key: 'dayCycle', label: 'Run a compressed day/night cycle', type: 'toggle', def: false }
      ]
    },
    'temp-logger': {
      blurb: 'Set the room you want; the simulated room drifts toward it and the logger records a reading every interval — same CSV shape the sketch prints to the Serial Monitor.',
      speed: 10,
      inputs: [
        { key: 'tempTarget', label: 'Room temperature', type: 'range', min: 5, max: 40, def: 22, unit: '°C' },
        { key: 'humTarget', label: 'Room humidity', type: 'range', min: 10, max: 95, def: 45, unit: '%' }
      ]
    },
    'plant-monitor': {
      blurb: 'Soil dries on its own here: the reading climbs until a check finds it at or above your dry threshold. Drag the reading to change conditions instantly (that is you pulling the probe into dry air), or water the plant.',
      speed: 60,
      inputs: [
        { key: 'reading', label: 'Soil reading right now', type: 'range', min: 60, max: 1023, def: 380 },
        { key: 'water', label: 'Water the plant', type: 'button' }
      ]
    },
    'distance-alarm': {
      blurb: 'Move the object yourself, or let it wander. The alarm line is your alarm distance from the settings — cross it and the buzzer fires, exactly like the sketch.',
      speed: 10,
      inputs: [
        { key: 'distance', label: 'Object distance', type: 'range', min: 2, max: 450, def: 120, unit: 'cm' },
        { key: 'auto', label: 'Object moves on its own', type: 'toggle', def: false }
      ]
    },
    'sun-tracker': {
      blurb: 'Feed the two light sensors yourself, or sweep a virtual sun across and watch the head hunt for it. The dead-band is your tolerance setting — inside it, the servo holds still.',
      speed: 10,
      inputs: [
        { key: 'left', label: 'Left light sensor', type: 'range', min: 0, max: 1023, def: 500 },
        { key: 'right', label: 'Right light sensor', type: 'range', min: 0, max: 1023, def: 500 },
        { key: 'sun', label: 'Sweep a virtual sun', type: 'toggle', def: false }
      ]
    },
    'sound-meter': {
      blurb: 'Room noise fluctuates around the level you set, the way a real room does. The bar uses the sketch\'s own mapping and your quiet threshold.',
      speed: 10,
      inputs: [
        { key: 'loudness', label: 'Room loudness (peak-to-peak)', type: 'range', min: 0, max: 500, def: 60 },
        { key: 'clap', label: 'Clap!', type: 'button' }
      ]
    }
  };

  function create(blockId, params) {
    var core = CORES[blockId];
    return core ? core(params || {}) : null;
  }

  /* ================================================= the panel */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function ledDot() { return el('span', 'sim-led'); }
  function outRow(label) {
    var row = el('div', 'sim-out-row');
    var lab = el('span', 'sim-out-label', label);
    row.appendChild(lab);
    return { row: row, label: lab };
  }

  function buildOutputs(host, blockId, refs) {
    var i, r;
    if (blockId === 'motion-light') {
      refs.scene = el('div', 'sim-scene');
      refs.lamp = el('div', 'sim-lamp');
      refs.scene.appendChild(refs.lamp);
      refs.sceneText = el('div', 'sim-scene-text', '');
      refs.scene.appendChild(refs.sceneText);
      host.appendChild(refs.scene);
      r = outRow('Lamp'); refs.lampState = el('strong', null, ''); r.row.appendChild(refs.lampState); host.appendChild(r.row);
      r = outRow('Hold countdown'); refs.count = el('strong', null, ''); r.row.appendChild(refs.count); host.appendChild(r.row);
      refs.countBar = el('div', 'sim-bar'); refs.countFill = el('div', 'fill'); refs.countBar.appendChild(refs.countFill); host.appendChild(refs.countBar);
      r = outRow('Ambient'); refs.amb = el('strong', null, ''); r.row.appendChild(refs.amb); host.appendChild(r.row);
    } else if (blockId === 'temp-logger') {
      r = outRow('Latest'); refs.latest = el('strong', null, ''); r.row.appendChild(refs.latest); host.appendChild(r.row);
      r = outRow('Next reading in'); refs.next = el('strong', null, ''); r.row.appendChild(refs.next); host.appendChild(r.row);
      refs.graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      refs.graph.setAttribute('class', 'sim-graph');
      refs.graph.setAttribute('viewBox', '0 0 220 64');
      refs.graphLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      refs.graphLine.setAttribute('fill', 'none');
      refs.graphLine.setAttribute('stroke', '#FF6B1A');
      refs.graphLine.setAttribute('stroke-width', '2');
      refs.graph.appendChild(refs.graphLine);
      host.appendChild(refs.graph);
      refs.logBox = el('div', 'sim-log'); host.appendChild(refs.logBox);
    } else if (blockId === 'plant-monitor') {
      r = outRow('Status'); refs.status = el('strong', null, ''); r.row.appendChild(refs.status); host.appendChild(r.row);
      r = outRow('Soil reading'); refs.reading = el('strong', null, ''); r.row.appendChild(refs.reading); host.appendChild(r.row);
      refs.bar = el('div', 'sim-bar'); refs.barFill = el('div', 'fill'); refs.barMark = el('div', 'marker'); refs.bar.appendChild(refs.barFill); refs.bar.appendChild(refs.barMark); host.appendChild(refs.bar);
      r = outRow('Alert LED'); refs.led = ledDot(); r.row.appendChild(refs.led); host.appendChild(r.row);
      r = outRow('Beeps so far'); refs.beeps = el('strong', null, '0'); r.row.appendChild(refs.beeps); host.appendChild(r.row);
      r = outRow('Pump'); refs.pump = el('strong', null, ''); r.row.appendChild(refs.pump); host.appendChild(r.row);
    } else if (blockId === 'distance-alarm') {
      r = outRow('Distance'); refs.dist = el('strong', null, ''); r.row.appendChild(refs.dist); host.appendChild(r.row);
      refs.track = el('div', 'sim-track'); refs.zone = el('div', 'sim-zone'); refs.obj = el('div', 'sim-obj'); refs.track.appendChild(refs.zone); refs.track.appendChild(refs.obj); host.appendChild(refs.track);
      r = outRow('Alarm'); refs.alarmLed = ledDot(); refs.alarmText = el('strong', null, ''); r.row.appendChild(refs.alarmLed); r.row.appendChild(refs.alarmText); host.appendChild(r.row);
    } else if (blockId === 'sun-tracker') {
      refs.dial = el('div', 'sim-dial'); refs.arm = el('div', 'sim-arm'); refs.dial.appendChild(refs.arm); host.appendChild(refs.dial);
      r = outRow('Servo angle'); refs.angle = el('strong', null, ''); r.row.appendChild(refs.angle); host.appendChild(r.row);
      r = outRow('Left / right light'); refs.lr = el('strong', null, ''); r.row.appendChild(refs.lr); host.appendChild(r.row);
      r = outRow('Difference vs tolerance'); refs.diff = el('strong', null, ''); r.row.appendChild(refs.diff); host.appendChild(r.row);
    } else if (blockId === 'sound-meter') {
      refs.leds = [];
      var barRow = el('div', 'sim-out-row');
      barRow.appendChild(el('span', 'sim-out-label', 'LED bar'));
      for (i = 0; i < 5; i++) { var d = ledDot(); refs.leds.push(d); barRow.appendChild(d); }
      host.appendChild(barRow);
      r = outRow('Amplitude (peak-to-peak)'); refs.amp = el('strong', null, ''); r.row.appendChild(refs.amp); host.appendChild(r.row);
      r = outRow('Level'); refs.level = el('strong', null, ''); r.row.appendChild(refs.level); host.appendChild(r.row);
    }
  }

  function renderOutputs(refs, blockId, st, project) {
    var i;
    if (blockId === 'motion-light') {
      var shade = Math.round(st.ambient / 1000 * 100);
      refs.scene.style.background = 'linear-gradient(180deg, rgb(' + (20 + shade) + ',' + (20 + shade) + ',' + (30 + shade) + '), rgb(' + (30 + shade) + ',' + (28 + shade) + ',' + (36 + shade) + '))';
      refs.lamp.className = 'sim-lamp' + (st.lightOn ? ' on' : '');
      refs.sceneText.textContent = st.motion ? 'Someone is moving in the room' : 'The room is quiet';
      refs.lampState.textContent = st.lightOn ? 'ON — ' + st.outputKind + ' on D' + st.outputPin : 'OFF';
      refs.count.textContent = st.lightOn ? Math.ceil(st.countdown) + ' s left of the ' + st.holdSeconds + ' s hold' : '—';
      refs.countFill.style.width = st.lightOn ? (st.countdown / st.holdSeconds * 100) + '%' : '0%';
      refs.amb.textContent = st.ambient + ' (scene only — the sketch has no light sensor)';
    } else if (blockId === 'temp-logger') {
      refs.latest.textContent = st.log.length ? st.tempNow + ' °C · ' + st.humNow + ' %RH — ' + st.sensorType + ' on D' + st.dataPin : 'warming up…';
      refs.next.textContent = st.nextIn + ' s (simulated)';
      while (refs.logBox.firstChild) refs.logBox.removeChild(refs.logBox.firstChild);
      st.log.slice(-8).forEach(function (row) {
        refs.logBox.appendChild(el('div', null, row.t + 's, ' + row.h + '%, ' + row.tc + 'C, ' + row.tf + 'F'));
      });
      if (!st.log.length) refs.logBox.appendChild(el('div', null, 'Time(s), Humidity(%), Temp(C), Temp(F)'));
      var pts = st.log.map(function (row, idx) {
        var x = st.log.length > 1 ? idx / (st.log.length - 1) * 214 + 3 : 110;
        var y = 60 - clamp((row.tc - 0) / 45, 0, 1) * 54;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      refs.graphLine.setAttribute('points', pts);
    } else if (blockId === 'plant-monitor') {
      refs.status.textContent = st.status;
      refs.reading.textContent = st.reading + ' (dry at ' + st.threshold + '+, sensor on ' + st.sensorPin + ')';
      refs.barFill.style.width = clamp(st.reading / 1023 * 100, 0, 100) + '%';
      refs.barMark.style.left = clamp(st.threshold / 1023 * 100, 0, 100) + '%';
      refs.led.className = 'sim-led' + (st.ledOn ? ' on' : '');
      refs.beeps.textContent = String(st.beeps);
      refs.pump.textContent = st.usePump ? (st.pumpOn ? 'RUNNING' : st.soaking ? 'off — soaking' : 'off') : 'not fitted in this build';
    } else if (blockId === 'distance-alarm') {
      refs.dist.textContent = st.outOfRange ? 'Out of range (HC-SR04 hears nothing back)' : st.distanceCm + ' cm — TRIG D' + st.trigPin + ' · ECHO D' + st.echoPin;
      refs.zone.style.width = clamp(st.alarmCm / 450 * 100, 0, 100) + '%';
      refs.obj.style.left = clamp(st.distanceCm / 450 * 100, 0, 100) + '%';
      refs.alarmLed.className = 'sim-led' + (st.alarm ? ' on' : '');
      refs.alarmText.textContent = st.alarm ? 'BUZZING — inside your ' + st.alarmCm + ' cm line' : 'quiet';
    } else if (blockId === 'sun-tracker') {
      refs.arm.style.transform = 'rotate(' + (st.angle - 90) + 'deg)';
      refs.angle.textContent = st.angle + '° (servo on D' + st.servoPin + ')';
      refs.lr.textContent = st.left + ' / ' + st.right;
      refs.diff.textContent = st.diff + ' vs ±' + st.tolerance + (Math.abs(st.diff) <= st.tolerance ? ' — inside the dead-band, holding' : ' — outside, nudging');
    } else if (blockId === 'sound-meter') {
      for (i = 0; i < 5; i++) refs.leds[i].className = 'sim-led' + (st.leds[i] ? ' on' : '');
      refs.amp.textContent = st.amp + ' (quiet threshold ' + st.threshold + ', mic on ' + st.micPin + ')';
      refs.level.textContent = st.level + ' / 5';
    }
  }

  function mountPanel(container, project) {
    var desc = DESCRIPTORS[project.blockId];
    var sim = create(project.blockId, project.params);
    if (!desc || !sim) return null;

    var panel = el('div', 'sim-panel');
    panel.appendChild(el('h3', null, 'Simulate this build'));
    panel.appendChild(el('p', 'sim-note',
      'Behavior simulation: it runs the same logic and the same settings as the sketch you downloaded — ' +
      'thresholds, hold times, and pins included — against a virtual room. It is not an electrical simulation: ' +
      'no voltages or currents, just the device behaving. Change a setting, regenerate, and the simulation changes with it.'));
    panel.appendChild(el('p', 'sub', desc.blurb));

    var controls = el('div', 'sim-controls');
    var speedLabel = el('label', null, 'Simulated speed ');
    var speedSel = document.createElement('select');
    [1, 10, 60].forEach(function (sp) {
      var o = document.createElement('option');
      o.value = String(sp);
      o.textContent = sp + '×';
      if (sp === desc.speed) o.selected = true;
      speedSel.appendChild(o);
    });
    speedLabel.appendChild(speedSel);
    controls.appendChild(speedLabel);
    var runBtn = el('button', 'btn btn-ghost btn-small', 'Pause');
    controls.appendChild(runBtn);
    panel.appendChild(controls);

    var grid = el('div', 'sim-grid');
    var inputsHost = el('div', 'sim-inputs');
    inputsHost.appendChild(el('h4', null, 'Conditions'));
    var valueSpans = {};
    desc.inputs.forEach(function (def) {
      var wrap = el('div', 'sim-input');
      if (def.type === 'range') {
        var lab = el('label', null, def.label + (def.unit ? ' (' + def.unit + ')' : ''));
        var input = document.createElement('input');
        input.type = 'range';
        input.min = def.min; input.max = def.max; input.value = def.def;
        input.setAttribute('data-sim-input', def.key);
        var val = el('span', 'sim-input-value', String(def.def));
        valueSpans[def.key] = val;
        input.addEventListener('input', function () {
          sim.setInput(def.key, Number(input.value));
          val.textContent = input.value;
        });
        wrap.appendChild(lab);
        wrap.appendChild(input);
        wrap.appendChild(val);
      } else if (def.type === 'toggle') {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!def.def;
        cb.setAttribute('data-sim-input', def.key);
        cb.addEventListener('change', function () { sim.setInput(def.key, cb.checked); });
        wrap.appendChild(cb);
        wrap.appendChild(el('label', null, ' ' + def.label));
      } else if (def.type === 'button') {
        var b = el('button', 'btn btn-dark btn-small', def.label);
        b.setAttribute('data-sim-input', def.key);
        b.addEventListener('click', function () { sim.setInput(def.key, true); });
        wrap.appendChild(b);
      }
      inputsHost.appendChild(wrap);
    });
    grid.appendChild(inputsHost);

    var outputsHost = el('div', 'sim-outputs');
    outputsHost.appendChild(el('h4', null, 'The device'));
    var refs = {};
    buildOutputs(outputsHost, project.blockId, refs);
    grid.appendChild(outputsHost);
    panel.appendChild(grid);
    container.appendChild(panel);

    var running = true;
    var speed = desc.speed;
    speedSel.addEventListener('change', function () { speed = Number(speedSel.value); });
    runBtn.addEventListener('click', function () {
      running = !running;
      runBtn.textContent = running ? 'Pause' : 'Run';
    });
    renderOutputs(refs, project.blockId, sim.state(), project);
    var timer = setInterval(function () {
      if (!running) return;
      sim.tick(0.12 * speed);
      renderOutputs(refs, project.blockId, sim.state(), project);
    }, 120);

    var handle = {
      sim: sim,
      panel: panel,
      stop: function () { clearInterval(timer); }
    };
    container._simHandle = handle;
    return handle;
  }

  window.VFSim = {
    create: create,
    DESCRIPTORS: DESCRIPTORS,
    mountPanel: mountPanel
  };
})();

