/* 10 Benches — verification harness.
   Drives the REAL site files in jsdom: landing statics, the generation
   engine, all six exports, the simulator logic cores and panels, the
   demo account/credit layer, the full builder UI end-to-end, the
   rebrand, and the security invariants.
   Run: NODE_PATH=/tmp/vf-test/node_modules node tests/run-tests.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.log('FAIL: ' + name); }
}
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function balancedDelims(src) {
  const stripped = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const count = ch => stripped.split(ch).length - 1;
  return count('{') === count('}') && count('(') === count(')') && count('[') === count(']');
}

function makeWindow() {
  const html = read('builder.html');
  const dom = new JSDOM(html, { url: 'https://10benches.com/builder.html', runScripts: 'dangerously', pretendToBeVisual: true });
  const win = dom.window;
  win.HTMLElement.prototype.scrollIntoView = function () {};
  const downloads = [];
  win.URL.createObjectURL = function (blob) {
    const url = 'blob:mock-' + downloads.length;
    downloads.push({ url, blob, filename: null });
    return url;
  };
  win.URL.revokeObjectURL = function () {};
  win.HTMLAnchorElement.prototype.click = function () {
    const rec = downloads[downloads.length - 1];
    if (rec && rec.url === this.href) rec.filename = this.download;
  };
  ['util', 'blocks', 'engine', 'sim', 'account', 'app'].forEach(n => {
    const s = win.document.createElement('script');
    s.textContent = read('js/' + n + '.js');
    win.document.body.appendChild(s);
  });
  return { dom, win, downloads };
}
function blobText(win, blob) {
  return new Promise((res, rej) => {
    const fr = new win.FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsText(blob);
  });
}
function submitForm(win, form) {
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}
function topUp(win, credits) {
  const key = 'vf_accounts_v1';
  const accounts = JSON.parse(win.localStorage.getItem(key));
  const email = win.localStorage.getItem('vf_session_v1');
  accounts[email].credits = credits;
  win.localStorage.setItem(key, JSON.stringify(accounts));
}

(async function main() {
  /* ================= landing statics ================= */
  const index = read('index.html');
  const css = read('css/styles.css');
  const idx = new JSDOM(index, { url: 'https://10benches.com/' }).window.document;
  check('landing: brand name present', index.includes('10 Benches'));
  check('landing: tagline verbatim', index.includes('Describe it. Build it.'));
  check('landing: domain present', index.includes('10benches.com'));
  check('landing: CSP meta', index.includes('Content-Security-Policy') && index.includes("default-src 'self'"));
  check('landing: referrer meta', index.includes('strict-origin-when-cross-origin'));
  check('landing: Google Fonts links', index.includes('fonts.googleapis.com') && index.includes('Space+Grotesk'));
  ['#181820', '#FF6B1A', '#FFC531', '#FAF6EF'].forEach(hex => check('landing: palette ' + hex + ' in CSS', css.includes(hex)));
  check('landing: header logo img is the mark icon', !!idx.querySelector('img.logo-icon') && fs.existsSync(path.join(REPO, 'assets/icon-256.png')));
  check('landing: header does not use the old wordmark lockup image', !idx.querySelector('img.logo-lockup'));
  check('landing: real sample showcase', index.includes('Hallway Motion Light') && index.includes('HC-SR501'));
  check('landing: pricing reset copy', /resets on the 1st/i.test(index) && index.includes('25 credits'));
  check('landing: exactly one Make-it-real teaser', (index.match(/Make it real/g) || []).length === 1);
  check('landing: no inline scripts', !/<script/.test(index));
  check('landing: demo chips name CAD + simulator', index.includes('Enclosure CAD (.scad)') && index.includes('Simulator'));

  /* ================= rebrand ================= */
  const served = ['index.html', 'builder.html', 'css/styles.css', 'js/util.js', 'js/blocks.js', 'js/engine.js', 'js/sim.js', 'js/account.js', 'js/app.js', 'README.md', 'SECURITY.md'];
  served.forEach(f => check('rebrand: no old name in ' + f, !/voltforge/i.test(read(f))));
  check('rebrand: CNAME is 10benches.com', read('CNAME').trim() === '10benches.com');
  check('rebrand: builder loads sim.js', read('builder.html').includes('js/sim.js'));
  check('rebrand: engine constants', read('js/engine.js').includes("SITE_NAME = '10 Benches'") && read('js/engine.js').includes("SITE_URL = '10benches.com'") && read('js/engine.js').includes("TAGLINE = 'Describe it. Build it.'"));

  /* ================= security invariants ================= */
  ['js/util.js', 'js/blocks.js', 'js/engine.js', 'js/sim.js', 'js/account.js', 'js/app.js'].forEach(f => {
    const src = read(f);
    check('security: no innerHTML assignment in ' + f, !/\.innerHTML\s*=/.test(src));
    check('security: no eval in ' + f, !/\beval\s*\(/.test(src));
  });
  check('security: builder CSP meta intact', read('builder.html').includes("connect-src 'none'"));

  /* ================= engine: matching + params ================= */
  const W1 = makeWindow();
  const win = W1.win;
  await sleep(60);
  const E = win.VFEngine, A = win.VFAccount, S = win.VFSim;
  check('engine: globals loaded', !!E && !!A && !!S && Array.isArray(win.VFBlocks) && win.VFBlocks.length === 6);

  win.VFBlocks.forEach(block => {
    const res = E.match(block.examplePrompt);
    check('match: "' + block.id + '" example prompt', res.best && res.best.block.id === block.id);
  });
  check('match: nonsense prompt returns no best', E.match('quantum flux capacitor for my spaceship').best === null);

  const motion = E.blockById('motion-light');
  const customMotion = E.generate(motion, { sensorPin: 7, outputPin: 12, holdSeconds: 45, useRelay: true }, 'Hallway Test');
  check('sketch: contains setup()/loop()', /void setup\(\)/.test(customMotion.sketch) && /void loop\(\)/.test(customMotion.sketch));
  check('sketch: honors custom pins', customMotion.sketch.includes('PIR_PIN = 7') && customMotion.sketch.includes('OUT_PIN = 12'));
  check('sketch: honors custom hold', customMotion.sketch.includes('HOLD_MS = 45000UL'));
  const clamped = E.validateParams(E.blockById('distance-alarm'), { alarmCm: 9999, trigPin: 99, echoPin: 'x' });
  check('params: number clamped to range', clamped.alarmCm === 200);
  check('params: invalid pin falls back to whitelist default', clamped.trigPin === 9 && clamped.echoPin === 10);
  const enumBad = E.validateParams(E.blockById('temp-logger'), { sensorType: 'DHT99' });
  check('params: invalid enum falls back', enumBad.sensorType === 'DHT11');
  const enumOk = E.validateParams(E.blockById('temp-logger'), { sensorType: 'DHT22' });
  check('params: valid enum honored', enumOk.sensorType === 'DHT22');

  /* ================= exports: the original four ================= */
  const proj = E.generate(motion, {}, 'Hallway Motion Light');
  check('export sketch: is the project sketch', E.buildSketchFile(proj) === proj.sketch);
  const csv = E.buildBomCsv(proj);
  check('export csv: header + brand line', csv.includes('Item,Qty,Note') && csv.includes('10 Benches (10benches.com)'));
  const json = JSON.parse(E.buildProjectJson(proj));
  check('export json: parses with block + params', json.blockId === 'motion-light' && json.params.holdSeconds === 30);
  const guide = E.buildGuideHtml(proj);
  check('export guide: branded, script-free', guide.includes('10 Benches') && guide.includes('Describe it. Build it.') && !/<script/.test(guide));
  const xss = E.generate(motion, {}, '<img src=x onerror=alert(1)>');
  check('export xss: sketch comment neutralized', !E.buildSketchFile(xss).includes('<img'));
  check('export xss: guide neutralized', !E.buildGuideHtml(xss).includes('<img src=x'));

  /* ================= parts: real + consistent ================= */
  const consistency = [
    ['motion-light', {}, ['HC-SR501'], ['HC-SR501']],
    ['motion-light', { useRelay: true }, ['SRD-05VDC'], []],
    ['temp-logger', { sensorType: 'DHT22' }, ['DHT22', 'AM2302'], ['DHT22']],
    ['plant-monitor', {}, ['v1.2'], ['v1.2']],
    ['plant-monitor', { usePump: true }, ['SRD-05VDC'], []],
    ['distance-alarm', {}, ['HC-SR04'], ['HC-SR04']],
    ['sun-tracker', {}, ['SG90', 'GL5528'], ['SG90']],
    ['sound-meter', {}, ['KY-038'], ['KY-038']]
  ];
  consistency.forEach(([id, params, bomTokens, wireTokens]) => {
    const b = E.blockById(id);
    const p = E.validateParams(b, params);
    const bomText = b.bom(p).map(r => r.item).join(' | ');
    const wireText = b.wiring(p).map(r => r.from + ' ' + r.to).join(' | ');
    bomTokens.forEach(t => check('parts: ' + id + ' BOM names ' + t, bomText.includes(t)));
    wireTokens.forEach(t => check('parts: ' + id + ' wiring references ' + t, wireText.includes(t)));
  });
  const sr04Sketch = E.generate(E.blockById('distance-alarm'), {}, 'x').sketch;
  check('parts: distance sketch references HC-SR04', sr04Sketch.includes('HC-SR04'));

  /* ================= CAD export (.scad) ================= */
  const scadMotion = E.buildScadFile(customMotion);
  check('scad: balanced delimiters (motion)', balancedDelims(scadMotion));
  check('scad: has shell + lid modules', scadMotion.includes('module shell()') && scadMotion.includes('module lid()'));
  check('scad: Uno dimensions from the real part', scadMotion.includes('uno_w = 68.6') && scadMotion.includes('uno_d = 53.4'));
  check('scad: PIR hole from the HC-SR501 dome', scadMotion.includes('pir_hole_d = 23'));
  check('scad: PIR retaining-ring mount module', scadMotion.includes('module pir_mount()'));
  check('scad: relay joins the floor when fitted', scadMotion.includes('relay_w = 51'));
  check('scad: echoes the user\'s own settings', scadMotion.includes('holdSeconds = 45') && scadMotion.includes('sensorPin = D7'));
  check('scad: carries project name + brand', scadMotion.includes('Hallway Test') && scadMotion.includes('10 Benches (10benches.com)'));
  check('scad: wall + inner dims are variables', /wall = 2\.4;/.test(scadMotion) && /inner_w = \d/.test(scadMotion));

  const distProj = E.generate(E.blockById('distance-alarm'), { alarmCm: 45 }, 'Garage Guardian');
  const scadDist = E.buildScadFile(distProj);
  check('scad: balanced delimiters (distance)', balancedDelims(scadDist));
  check('scad: HC-SR04 front holes sized from the part', scadDist.includes('sr04_hole_d = 16') && scadDist.includes('sr04_hole_gap = 26') && scadDist.includes('module sr04_bezel()'));
  check('scad: echoes custom alarm distance', scadDist.includes('alarmCm = 45'));

  const servoProj = E.generate(E.blockById('sun-tracker'), {}, 'Sun Follower');
  const scadServo = E.buildScadFile(servoProj);
  check('scad: balanced delimiters (servo)', balancedDelims(scadServo));
  check('scad: SG90 bracket from the real servo dims', scadServo.includes('servo_w = 22.2') && scadServo.includes('module servo_bracket()') && scadServo.includes('module ldr_panel()'));

  const plantProj = E.generate(E.blockById('plant-monitor'), {}, 'Fern Friend');
  const scadPlant = E.buildScadFile(plantProj);
  check('scad: balanced delimiters (plant)', balancedDelims(scadPlant));
  check('scad: soil probe exit slot', scadPlant.includes('soil_slot_w = 26') && scadPlant.includes('soil_slot_h = 9'));

  const tempProj = E.generate(E.blockById('temp-logger'), { sensorType: 'DHT22' }, 'Room Log');
  const scadTemp = E.buildScadFile(tempProj);
  check('scad: balanced delimiters (temp)', balancedDelims(scadTemp));
  check('scad: DHT22 vent slots + sensor named', scadTemp.includes('dht_vent_d = 9') && scadTemp.includes('DHT22'));

  const soundProj = E.generate(E.blockById('sound-meter'), {}, 'Noise Watch');
  const scadSound = E.buildScadFile(soundProj);
  check('scad: balanced delimiters (sound)', balancedDelims(scadSound));
  check('scad: LED bar holes from the build (5 x 5.2mm)', scadSound.includes('ledbar_holes = 5') && scadSound.includes('ledbar_hole_d = 5.2'));

  /* ================= wiring diagram (.svg) ================= */
  const svgMotion = E.buildWiringSvg(customMotion);
  check('svg: standalone XML document', svgMotion.startsWith('<?xml') && svgMotion.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  check('svg: no scripts', !/<script/.test(svgMotion));
  check('svg: shows the custom pins the user chose', svgMotion.includes('>D7<') && svgMotion.includes('>D12<'));
  check('svg: names the real sensor', svgMotion.includes('HC-SR501 PIR OUT'));
  check('svg: branded footer', svgMotion.includes('10 Benches') && svgMotion.includes('Describe it. Build it.') && svgMotion.includes('10benches.com'));
  const svgParsed = new win.DOMParser().parseFromString(svgMotion, 'image/svg+xml');
  check('svg: parses as XML with an svg root', svgParsed.documentElement.tagName === 'svg' && !svgParsed.querySelector('parsererror'));
  const svgPlant = E.buildWiringSvg(E.generate(E.blockById('plant-monitor'), { sensorPin: 'A3' }, 'Fern'));
  check('svg: analog pin from settings appears', svgPlant.includes('>A3<'));

  /* ================= accounts + credits (API level) ================= */
  const W2 = makeWindow();
  const win2 = W2.win;
  await sleep(60);
  const A2 = win2.VFAccount;
  const su = A2.signup('Test Person', 'test@example.com', 'hunter2x');
  check('account: signup ok with 25 credits', su.ok && su.account.credits === 25);
  check('account: duplicate signup rejected', !A2.signup('Other', 'test@example.com', 'hunter2x').ok);
  check('account: wrong password rejected', !A2.signin('test@example.com', 'nope-nope').ok);
  check('account: spend 5 -> 20', A2.spend(5) && A2.balance() === 20);
  check('account: spend to 0 then blocked', A2.spend(20) && A2.balance() === 0 && !A2.spend(1));
  const store2 = JSON.parse(win2.localStorage.getItem('vf_accounts_v1'));
  store2['test@example.com'].month = '2020-01';
  store2['test@example.com'].credits = 3;
  win2.localStorage.setItem('vf_accounts_v1', JSON.stringify(store2));
  const after = A2.current();
  check('account: month rollover refills to 25', after.credits === 25 && after.month !== '2020-01');
  A2.signout();
  check('account: signout clears session', A2.current() === null);

  /* ================= simulator logic cores ================= */
  // motion light: hold logic follows the user's holdSeconds
  const simM = S.create('motion-light', { sensorPin: 2, outputPin: 8, holdSeconds: 10, useRelay: false });
  check('sim motion: starts off', simM.state().lightOn === false);
  simM.setInput('motion', true); simM.tick(0.2);
  check('sim motion: motion turns the lamp on', simM.state().lightOn === true);
  simM.setInput('motion', false); simM.tick(9);
  check('sim motion: still on inside the hold', simM.state().lightOn === true && simM.state().countdown > 0);
  simM.tick(1.5);
  check('sim motion: off after the hold expires', simM.state().lightOn === false);
  const simM2 = S.create('motion-light', { sensorPin: 2, outputPin: 8, holdSeconds: 60, useRelay: false });
  simM2.setInput('motion', true); simM2.tick(0.2); simM2.setInput('motion', false); simM2.tick(10.5);
  check('sim motion: a longer hold setting keeps it on longer', simM2.state().lightOn === true);

  // temp logger: streams over time, CSV-shaped, sensor-faithful quantization
  const simT = S.create('temp-logger', { sensorType: 'DHT22', dataPin: 2, intervalSeconds: 10 });
  for (let i = 0; i < 35; i++) simT.tick(1);
  const tLog = simT.state().log;
  check('sim temp: readings stream over simulated time', tLog.length >= 3);
  check('sim temp: rows carry t/h/tc/tf like the sketch CSV', tLog.every(r => typeof r.t === 'number' && typeof r.h === 'number' && typeof r.tc === 'number' && Math.abs(r.tf - (r.tc * 9 / 5 + 32)) < 0.25));
  simT.setInput('tempTarget', 31);
  for (let i = 0; i < 120; i++) simT.tick(1);
  const tLast = simT.state().log[simT.state().log.length - 1];
  check('sim temp: room drifts toward the set temperature', Math.abs(tLast.tc - 31) < 3.5);
  const simT11 = S.create('temp-logger', { sensorType: 'DHT11', dataPin: 2, intervalSeconds: 5 });
  for (let i = 0; i < 20; i++) simT11.tick(1);
  check('sim temp: DHT11 reports whole numbers like the real sensor', simT11.state().log.every(r => Number.isInteger(r.tc) && Number.isInteger(r.h)));

  // plant monitor: dries over time, threshold triggers, pump cycle mirrors the sketch
  const simP = S.create('plant-monitor', { sensorPin: 'A0', dryThreshold: 550, ledPin: 8, buzzerPin: 9, checkSeconds: 5, usePump: false, pumpPin: 10 });
  const pStart = simP.state().reading;
  for (let i = 0; i < 100; i++) simP.tick(1);
  check('sim plant: soil dries gradually over time', simP.state().reading > pStart + 30);
  simP.setInput('reading', 700);
  for (let i = 0; i < 6; i++) simP.tick(1);
  check('sim plant: crossing the threshold triggers dry + LED + beeps', simP.state().dry === true && simP.state().ledOn === true && simP.state().beeps >= 2);
  simP.setInput('water', true);
  for (let i = 0; i < 6; i++) simP.tick(1);
  check('sim plant: watering clears the dry state', simP.state().dry === false && simP.state().reading < 400);
  const simPP = S.create('plant-monitor', { sensorPin: 'A0', dryThreshold: 550, ledPin: 8, buzzerPin: 9, checkSeconds: 5, usePump: true, pumpPin: 10 });
  simPP.setInput('reading', 800);
  for (let i = 0; i < 6; i++) simPP.tick(1);
  check('sim plant: pump runs when dry (pump build)', simPP.state().pumpOn === true || simPP.state().soaking === true);
  for (let i = 0; i < 75; i++) simPP.tick(1);
  check('sim plant: pump + soak brings the reading back under threshold', simPP.state().dry === false && simPP.state().reading < 550);

  // distance alarm: zones follow the user's alarmCm
  const simD = S.create('distance-alarm', { trigPin: 9, echoPin: 10, buzzerPin: 6, ledPin: 7, alarmCm: 30 });
  simD.setInput('distance', 100); simD.tick(0.2);
  check('sim distance: quiet beyond the line', simD.state().alarm === false);
  simD.setInput('distance', 20); simD.tick(0.2);
  check('sim distance: alarm inside the line', simD.state().alarm === true && simD.state().ledOn === true);
  simD.setInput('distance', 440); simD.tick(0.2);
  check('sim distance: out of range past the sensor\'s reach', simD.state().outOfRange === true && simD.state().alarm === false);
  const simD2 = S.create('distance-alarm', { trigPin: 9, echoPin: 10, buzzerPin: 6, ledPin: 7, alarmCm: 30 });
  simD2.setInput('auto', true);
  let dMin = 1e9, dMax = -1;
  for (let i = 0; i < 60; i++) { simD2.tick(0.5); const d = simD2.state().distanceCm; if (d < dMin) dMin = d; if (d > dMax) dMax = d; }
  check('sim distance: auto mode sweeps near and far', dMin < 60 && dMax > 300);

  // sun tracker: angle hunts the brighter side, dead-band holds
  const simS = S.create('sun-tracker', { servoPin: 9, leftPin: 'A0', rightPin: 'A1', tolerance: 40, updateMs: 100 });
  simS.setInput('left', 900); simS.setInput('right', 200);
  for (let i = 0; i < 30; i++) simS.tick(0.1);
  check('sim servo: turns toward the brighter (left) side', simS.state().angle > 100);
  simS.setInput('left', 200); simS.setInput('right', 900);
  for (let i = 0; i < 60; i++) simS.tick(0.1);
  check('sim servo: follows when the light moves right', simS.state().angle < 80);
  const simS2 = S.create('sun-tracker', { servoPin: 9, leftPin: 'A0', rightPin: 'A1', tolerance: 40, updateMs: 100 });
  simS2.setInput('left', 520); simS2.setInput('right', 500);
  for (let i = 0; i < 20; i++) simS2.tick(0.1);
  check('sim servo: dead-band tolerance holds it still', simS2.state().angle === 90);

  // sound meter: threshold + mapping from the sketch
  const simN = S.create('sound-meter', { micPin: 'A0', firstLedPin: 3, threshold: 200 });
  simN.setInput('loudness', 60);
  for (let i = 0; i < 20; i++) simN.tick(0.12);
  check('sim sound: below the quiet threshold, no LEDs', simN.state().level === 0);
  const simN2 = S.create('sound-meter', { micPin: 'A0', firstLedPin: 3, threshold: 25 });
  simN2.setInput('loudness', 300);
  for (let i = 0; i < 20; i++) simN2.tick(0.12);
  check('sim sound: loud room lights most of the bar', simN2.state().level >= 3);
  simN2.setInput('loudness', 0); simN2.setInput('clap', true); simN2.tick(0.12);
  check('sim sound: a clap spikes the bar to the top', simN2.state().level === 5);

  /* ================= simulator panels (all 6 blocks, in the DOM) ================= */
  const EW = win.VFEngine;
  for (const block of win.VFBlocks) {
    const project = EW.generate(block, {}, 'Panel Test ' + block.id);
    const host = win.document.createElement('div');
    win.document.body.appendChild(host);
    const handle = win.VFSim.mountPanel(host, project);
    check('sim panel: mounts for ' + block.id, !!handle && !!host.querySelector('.sim-panel'));
    check('sim panel: honest behavior-simulation label for ' + block.id, host.textContent.includes('Behavior simulation') && host.textContent.includes('not an electrical simulation'));
    check('sim panel: has condition controls for ' + block.id, host.querySelectorAll('[data-sim-input]').length >= 2);
    const range = host.querySelector('input[type="range"][data-sim-input]');
    if (range) {
      range.value = range.max;
      range.dispatchEvent(new win.Event('input', { bubbles: true }));
      check('sim panel: slider drives the core for ' + block.id, handle.sim.inputs[range.getAttribute('data-sim-input')] === Number(range.max));
    } else {
      check('sim panel: slider drives the core for ' + block.id, false);
    }
    handle.stop();
  }

  /* ================= builder UI end-to-end ================= */
  const doc = win.document;
  check('ui: welcome message present', doc.getElementById('chat-log').textContent.includes('Describe it. Build it.'));
  const promptInput = doc.getElementById('prompt-input');
  promptInput.value = 'A light that turns on when someone walks into the room';
  submitForm(win, doc.getElementById('chat-form'));
  check('ui: signed-out prompt opens the auth modal', doc.getElementById('auth-modal').classList.contains('open'));
  doc.getElementById('auth-name').value = 'UI Tester';
  doc.getElementById('auth-email').value = 'ui@example.com';
  doc.getElementById('auth-password').value = 'hunter2x';
  submitForm(win, doc.getElementById('auth-form'));
  await sleep(30);
  check('ui: signup resumes the pending prompt with a params card', !!doc.querySelector('[data-key="holdSeconds"]'));
  check('ui: credit pill shows 25', doc.getElementById('credit-pill').textContent.includes('25'));
  const holdInput = doc.querySelector('[data-key="holdSeconds"]');
  holdInput.value = '45';
  const cards = doc.querySelectorAll('.card');
  const paramsCard = holdInput.closest('.card');
  const genBtn = Array.from(paramsCard.querySelectorAll('button')).find(b => b.textContent === 'Generate project');
  genBtn.click();
  await sleep(30);
  check('ui: generation spends 5 (25 -> 20)', A.current().credits === 20);
  const projectCard = Array.from(doc.querySelectorAll('.card')).pop();
  check('ui: project card shows the generated sketch with custom hold', projectCard.textContent.includes('HOLD_MS = 45000UL'));
  const tabLabels = Array.from(projectCard.querySelectorAll('.project-tabs .chip')).map(c => c.textContent);
  check('ui: project card has all 5 tabs incl. Simulate', ['Sketch (.ino)', 'Parts list', 'Wiring map', 'Build steps', 'Simulate'].every(t => tabLabels.includes(t)));

  // exports through the real buttons: all six download real blobs, 1 credit each
  const exportCases = [
    ['Download sketch (.ino)', '.ino', c => c.includes('void setup()')],
    ['Parts list (.csv)', '-parts.csv', c => c.includes('Item,Qty,Note')],
    ['Project file (.json)', '.10benches.json', c => { try { return JSON.parse(c).blockId === 'motion-light'; } catch (e) { return false; } }],
    ['Build guide (printable)', '-build-guide.html', c => c.includes('10 Benches') && !/<script/.test(c)],
    ['Wiring diagram (.svg)', '-wiring.svg', c => c.startsWith('<?xml') && c.includes('>D2<')],
    ['Enclosure CAD (.scad)', '-enclosure.scad', c => c.includes('module shell()') && c.includes('pir_hole_d = 23')]
  ];
  let expectedCredits = 20;
  for (const [label, suffix, test] of exportCases) {
    const btn = Array.from(projectCard.querySelectorAll('button')).find(b => b.textContent.startsWith(label));
    check('ui: export button exists: ' + label, !!btn);
    const before = W1.downloads.length;
    btn.click();
    await sleep(20);
    expectedCredits -= 1;
    check('ui: export spends 1 credit: ' + label, A.current().credits === expectedCredits);
    const rec = W1.downloads[W1.downloads.length - 1];
    check('ui: export downloads a file: ' + label, W1.downloads.length === before + 1 && !!rec && rec.filename.endsWith(suffix));
    const content = await blobText(win, rec.blob);
    check('ui: export content valid: ' + label, test(content));
  }

  // simulate tab through the real UI
  const simChip = Array.from(projectCard.querySelectorAll('.project-tabs .chip')).find(c => c.textContent === 'Simulate');
  simChip.click();
  await sleep(30);
  const simPane = Array.from(projectCard.querySelectorAll('.project-pane')).find(p => p.querySelector('.sim-panel'));
  check('ui: Simulate tab mounts the panel in the project card', !!simPane);
  const motionToggle = simPane.querySelector('[data-sim-input="motion"]');
  motionToggle.checked = true;
  motionToggle.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(450);
  check('ui: sim panel shows the lamp ON after motion', simPane.textContent.includes('ON — LED (lamp) on D8'));
  if (simPane._simHandle) simPane._simHandle.stop();

  // no-match honesty in the UI
  promptInput.value = 'a robot butler that folds laundry';
  submitForm(win, doc.getElementById('chat-form'));
  await sleep(20);
  check('ui: no-match answered honestly with suggestions', doc.getElementById('chat-log').textContent.includes('nothing in the current block library builds that'));

  // drained account is blocked at generation, upgrade modal opens
  topUp(win, 3);
  promptInput.value = 'An alarm that buzzes when something gets too close';
  submitForm(win, doc.getElementById('chat-form'));
  await sleep(20);
  const drainCard = Array.from(doc.querySelectorAll('.card')).pop();
  const drainGen = Array.from(drainCard.querySelectorAll('button')).find(b => b.textContent === 'Generate project');
  drainGen.click();
  await sleep(20);
  check('ui: drained account blocked at generation', A.current().credits === 3 && doc.getElementById('upgrade-modal').classList.contains('open'));

  console.log('\n' + pass + ' passed, ' + fail + ' failed (' + (pass + fail) + ' checks)');
  if (failures.length) { console.log('Failures:\n - ' + failures.join('\n - ')); }
  W1.dom.window.close(); W2.dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
