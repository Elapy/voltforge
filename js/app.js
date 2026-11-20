/* Voltforge — builder studio UI.
   Rendering rule: every dynamic string reaches the DOM through textContent
   or createElement — never innerHTML — so user text cannot become markup. */
(function () {
  'use strict';

  var U = window.VFUtil;
  var E = window.VFEngine;
  var A = window.VFAccount;

  var chatLog, chatForm, promptInput, accountBar, creditPill;
  var authModal, authForm, authError, authTitle, authNameField, authSwitchBtn, authSubmitBtn;
  var upgradeModal, upgradeNote;
  var authMode = 'signup';
  var pendingPrompt = null;
  var lastProject = null;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------ chat */
  function addMsg(kind, text) {
    var m = el('div', 'msg ' + kind, text);
    chatLog.appendChild(m);
    m.scrollIntoView({ block: 'end' });
    return m;
  }

  function addNode(node) {
    chatLog.appendChild(node);
    node.scrollIntoView({ block: 'end' });
    return node;
  }

  /* ------------------------------------------------ account bar */
  function refreshAccountBar() {
    while (accountBar.firstChild) accountBar.removeChild(accountBar.firstChild);
    var acct = A.current();
    if (acct) {
      var who = el('span', 'who', acct.name + ' · ' + A.PLANS[acct.plan].name + ' plan');
      var out = el('button', 'btn btn-ghost btn-small', 'Sign out');
      out.addEventListener('click', function () {
        A.signout();
        refreshAccountBar();
        addMsg('bot', 'Signed out. Your demo account and projects stay in this browser.');
      });
      accountBar.appendChild(who);
      accountBar.appendChild(out);
    } else {
      var inBtn = el('button', 'btn btn-ghost btn-small', 'Sign in');
      inBtn.addEventListener('click', function () { openAuth('signin'); });
      var upBtn = el('button', 'btn btn-dark btn-small', 'Create free account');
      upBtn.addEventListener('click', function () { openAuth('signup'); });
      accountBar.appendChild(inBtn);
      accountBar.appendChild(upBtn);
    }
    refreshCredits();
  }

  function refreshCredits() {
    var acct = A.current();
    creditPill.textContent = '';
    var dot = el('span', 'dot');
    creditPill.appendChild(dot);
    creditPill.appendChild(document.createTextNode(
      acct ? acct.credits + ' credits' : '25 free credits / month'
    ));
  }

  /* ------------------------------------------------ auth modal */
  function openAuth(mode) {
    authMode = mode || 'signup';
    authError.textContent = '';
    authTitle.textContent = authMode === 'signup' ? 'Create your free account' : 'Welcome back';
    authNameField.style.display = authMode === 'signup' ? '' : 'none';
    authSubmitBtn.textContent = authMode === 'signup' ? 'Create account — 25 free credits' : 'Sign in';
    authSwitchBtn.textContent = authMode === 'signup' ? 'Sign in instead' : 'Create an account instead';
    authModal.classList.add('open');
  }
  function closeAuth() { authModal.classList.remove('open'); }

  function handleAuthSubmit(ev) {
    ev.preventDefault();
    var name = document.getElementById('auth-name').value;
    var email = document.getElementById('auth-email').value;
    var password = document.getElementById('auth-password').value;
    var res = authMode === 'signup' ? A.signup(name, email, password) : A.signin(email, password);
    if (!res.ok) {
      authError.textContent = res.error;
      return;
    }
    closeAuth();
    refreshAccountBar();
    addMsg('bot', 'You are in, ' + res.account.name + '. You have ' + res.account.credits +
      ' credits — a generation uses ' + A.COST_GENERATE + ', each export ' + A.COST_EXPORT +
      '. Credits reset on the 1st of every month.');
    if (pendingPrompt) {
      var p = pendingPrompt;
      pendingPrompt = null;
      handlePrompt(p);
    }
  }

  /* ------------------------------------------------ upgrade modal */
  function openUpgrade() {
    upgradeNote.textContent = '';
    upgradeModal.classList.add('open');
  }
  function closeUpgrade() { upgradeModal.classList.remove('open'); }

  function buildUpgradePlans() {
    var host = document.getElementById('upgrade-plans');
    ['starter', 'builder', 'pro'].forEach(function (id) {
      var plan = A.PLANS[id];
      var card = el('div', 'plan');
      card.appendChild(el('div', 'pname', plan.name));
      var price = el('div', 'price', '$' + plan.price);
      price.appendChild(el('span', null, ' / month'));
      card.appendChild(price);
      card.appendChild(el('div', 'credits', plan.credits + ' credits / month'));
      card.appendChild(el('p', null, 'Credits reset on the 1st — never a bucket that runs dry.'));
      var btn = el('button', 'btn btn-primary', 'Upgrade to ' + plan.name);
      btn.addEventListener('click', function () {
        upgradeNote.textContent = 'Paid plans launch soon — checkout is not live yet, and we never collect card details on this page. Your free credits reset on the 1st.';
      });
      card.appendChild(btn);
      host.appendChild(card);
    });
  }

  /* ------------------------------------------------ prompt flow */
  function handlePrompt(rawText) {
    var text = String(rawText || '').slice(0, E.MAX_PROMPT).trim();
    if (!text) return;
    addMsg('user', text);

    if (!A.current()) {
      pendingPrompt = text;
      addMsg('bot', 'Love it. To generate the full project — code, parts, wiring, guide — create a free account first. It takes ten seconds and comes with 25 credits every month.');
      openAuth('signup');
      return;
    }

    var result = E.match(text);
    if (!result.best) {
      addMsg('bot', 'Honest answer: nothing in the current block library builds that — yet. Voltforge only generates projects it has verified blocks for, because a wrong board is dead money. Here is what I can build today; tap one, or describe something closer to it:');
      addSuggestions();
      return;
    }
    var block = result.best.block;
    addMsg('bot', 'That is a "' + block.name + '". ' + block.short + '\n\nSet it up below, then generate — I will assemble the sketch, parts list, wiring map, and build guide from the verified ' + block.name + ' block.');
    addNode(buildParamsCard(block, text));
  }

  function addSuggestions() {
    var wrap = el('div', 'card');
    wrap.appendChild(el('h3', null, 'What I can build today'));
    window.VFBlocks.forEach(function (block) {
      var b = el('button', 'chip', block.name);
      b.style.margin = '0 6px 8px 0';
      b.addEventListener('click', function () { handlePrompt(block.examplePrompt); });
      wrap.appendChild(b);
    });
    addNode(wrap);
  }

  function paramInput(def) {
    var input;
    if (def.type === 'pin' || def.type === 'apin') {
      input = document.createElement('select');
      var opts = def.type === 'pin' ? E.DIGITAL_PINS : E.ANALOG_PINS;
      opts.forEach(function (pin) {
        var o = document.createElement('option');
        o.value = String(pin);
        o.textContent = def.type === 'pin' ? 'D' + pin : pin;
        if (String(def.def) === String(pin)) o.selected = true;
        input.appendChild(o);
      });
    } else if (def.type === 'enum') {
      input = document.createElement('select');
      def.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.v;
        o.textContent = opt.label;
        if (opt.v === def.def) o.selected = true;
        input.appendChild(o);
      });
    } else if (def.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!def.def;
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.min = def.min;
      input.max = def.max;
      input.value = def.def;
    }
    input.id = 'param-' + def.key;
    input.setAttribute('data-key', def.key);
    return input;
  }

  function buildParamsCard(block, promptText) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, block.name));
    card.appendChild(el('p', 'sub', 'From your words: "' + promptText + '" — every setting below is optional; the defaults already build a working project.'));

    var nameWrap = el('div', 'param');
    nameWrap.style.marginBottom = '14px';
    nameWrap.appendChild(el('label', null, 'Project name'));
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'text-input';
    nameInput.maxLength = 60;
    nameInput.value = block.name;
    nameInput.id = 'project-name';
    nameWrap.appendChild(nameInput);
    card.appendChild(nameWrap);

    var grid = el('div', 'param-grid');
    block.params.forEach(function (def) {
      var wrap = el('div', 'param' + (def.type === 'bool' ? ' bool' : ''));
      var input = paramInput(def);
      if (def.type === 'bool') {
        wrap.appendChild(input);
        wrap.appendChild(el('label', null, def.label));
      } else {
        wrap.appendChild(el('label', null, def.label + (def.unit ? ' (' + def.unit + ')' : '')));
        wrap.appendChild(input);
      }
      if (def.help) wrap.appendChild(el('div', 'help', def.help));
      grid.appendChild(wrap);
    });
    card.appendChild(grid);

    var actions = el('div', 'actions');
    var genBtn = el('button', 'btn btn-primary', 'Generate project');
    var cost = el('span', 'cost-note', 'Uses ' + A.COST_GENERATE + ' credits');
    actions.appendChild(genBtn);
    actions.appendChild(cost);
    card.appendChild(actions);

    genBtn.addEventListener('click', function () {
      var raw = {};
      block.params.forEach(function (def) {
        var input = card.querySelector('[data-key="' + def.key + '"]');
        raw[def.key] = def.type === 'bool' ? input.checked : input.value;
      });
      var projectName = nameInput.value;
      if (!A.spend(A.COST_GENERATE)) {
        addMsg('bot', 'You are out of credits for this month — generation needs ' + A.COST_GENERATE + '. Your pool resets on the 1st, or upgrade for a bigger pool.');
        openUpgrade();
        return;
      }
      var project = E.generate(block, raw, projectName);
      lastProject = project;
      refreshCredits();
      genBtn.disabled = true;
      cost.textContent = 'Generated — ' + A.COST_GENERATE + ' credits used.';
      addMsg('bot', 'Forged: "' + project.name + '". Working sketch, parts list, wiring map, and build steps are in the card below. Exports are ' + A.COST_EXPORT + ' credit each.');
      addNode(buildProjectCard(project));
    });

    return card;
  }

  /* ------------------------------------------------ project card */
  function tableFrom(rows, headers) {
    var table = document.createElement('table');
    var thead = document.createElement('tr');
    headers.forEach(function (h) { thead.appendChild(el('th', null, h)); });
    table.appendChild(thead);
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      row.forEach(function (cell) { tr.appendChild(el('td', null, String(cell))); });
      table.appendChild(tr);
    });
    return table;
  }

  function buildProjectCard(project) {
    var card = el('div', 'card');
    card.appendChild(el('h3', null, project.name));
    card.appendChild(el('p', 'sub', project.blockName + ' · Arduino Uno R3 · Libraries: ' +
      (project.libraries.length ? project.libraries.join('; ') : 'none beyond the Arduino core')));

    var panes = {};
    var tabs = el('div', 'project-tabs');
    [['sketch', 'Sketch (.ino)'], ['parts', 'Parts list'], ['wiring', 'Wiring map'], ['steps', 'Build steps']].forEach(function (pair, idx) {
      var chip = el('button', 'chip' + (idx === 0 ? ' active' : ''), pair[1]);
      chip.addEventListener('click', function () {
        tabs.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        Object.keys(panes).forEach(function (k) { panes[k].style.display = k === pair[0] ? '' : 'none'; });
      });
      tabs.appendChild(chip);
    });
    card.appendChild(tabs);

    var sketchPane = el('div', 'project-pane');
    var pre = el('pre', null, project.sketch);
    sketchPane.appendChild(pre);
    panes.sketch = sketchPane;

    var partsPane = el('div', 'project-pane');
    partsPane.style.display = 'none';
    partsPane.appendChild(tableFrom(project.bom.map(function (r) { return [r.item, r.qty, r.note]; }), ['Item', 'Qty', 'Note']));
    panes.parts = partsPane;

    var wiringPane = el('div', 'project-pane');
    wiringPane.style.display = 'none';
    wiringPane.appendChild(tableFrom(project.wiring.map(function (r) { return [r.from, r.to, r.note]; }), ['From', 'To', 'Note']));
    panes.wiring = wiringPane;

    var stepsPane = el('div', 'project-pane');
    stepsPane.style.display = 'none';
    var ol = document.createElement('ol');
    project.steps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
    stepsPane.appendChild(el('h3', null, 'Assembly'));
    stepsPane.appendChild(ol);
    stepsPane.appendChild(el('h3', null, 'Upload the code'));
    var ol2 = document.createElement('ol');
    E.UPLOAD_STEPS.forEach(function (s) { ol2.appendChild(el('li', null, s)); });
    stepsPane.appendChild(ol2);
    stepsPane.appendChild(el('h3', null, 'Test it'));
    stepsPane.appendChild(el('p', null, project.test));
    panes.steps = stepsPane;

    Object.keys(panes).forEach(function (k) { card.appendChild(panes[k]); });

    var status = el('span', 'cost-note', '');
    var actions = el('div', 'actions');
    var slug = U.slug(project.name);
    var exports = [
      ['Download sketch (.ino)', function () { return { file: slug + '.ino', content: E.buildSketchFile(project), mime: 'text/x-arduino;charset=utf-8' }; }],
      ['Parts list (.csv)', function () { return { file: slug + '-parts.csv', content: E.buildBomCsv(project), mime: 'text/csv;charset=utf-8' }; }],
      ['Project file (.json)', function () { return { file: slug + '.voltforge.json', content: E.buildProjectJson(project), mime: 'application/json;charset=utf-8' }; }],
      ['Build guide (printable)', function () { return { file: slug + '-build-guide.html', content: E.buildGuideHtml(project), mime: 'text/html;charset=utf-8' }; }]
    ];
    exports.forEach(function (pair) {
      var btn = el('button', 'btn btn-ghost btn-small', pair[0] + ' · ' + A.COST_EXPORT + ' credit');
      btn.addEventListener('click', function () {
        if (!A.spend(A.COST_EXPORT)) {
          status.textContent = 'Out of credits — exports need ' + A.COST_EXPORT + ' credit each. Pool resets on the 1st.';
          openUpgrade();
          return;
        }
        var out = pair[1]();
        U.download(out.file, out.content, out.mime);
        refreshCredits();
        status.textContent = 'Exported ' + out.file + ' — share it and it carries Voltforge with it.';
      });
      actions.appendChild(btn);
    });
    actions.appendChild(status);
    card.appendChild(actions);
    return card;
  }

  /* ------------------------------------------------ examples */
  function buildExamples() {
    var host = document.getElementById('examples');
    host.appendChild(el('span', 'examples-label', 'Try one of these — every one is a verified build:'));
    window.VFBlocks.forEach(function (block) {
      var chip = el('button', 'chip', block.examplePrompt);
      chip.addEventListener('click', function () {
        promptInput.value = block.examplePrompt;
        handlePrompt(block.examplePrompt);
      });
      host.appendChild(chip);
    });
  }

  /* ------------------------------------------------ init */
  function init() {
    chatLog = document.getElementById('chat-log');
    chatForm = document.getElementById('chat-form');
    promptInput = document.getElementById('prompt-input');
    accountBar = document.getElementById('account-bar');
    creditPill = document.getElementById('credit-pill');
    authModal = document.getElementById('auth-modal');
    authForm = document.getElementById('auth-form');
    authError = document.getElementById('auth-error');
    authTitle = document.getElementById('auth-title');
    authNameField = document.getElementById('auth-name-field');
    authSwitchBtn = document.getElementById('auth-switch');
    authSubmitBtn = document.getElementById('auth-submit');
    upgradeModal = document.getElementById('upgrade-modal');
    upgradeNote = document.getElementById('upgrade-note');

    authForm.addEventListener('submit', handleAuthSubmit);
    authSwitchBtn.addEventListener('click', function () {
      openAuth(authMode === 'signup' ? 'signin' : 'signup');
    });
    document.getElementById('auth-close').addEventListener('click', closeAuth);
    document.getElementById('upgrade-close').addEventListener('click', closeUpgrade);
    authModal.addEventListener('click', function (e) { if (e.target === authModal) closeAuth(); });
    upgradeModal.addEventListener('click', function (e) { if (e.target === upgradeModal) closeUpgrade(); });

    chatForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = promptInput.value;
      promptInput.value = '';
      handlePrompt(text);
    });
    promptInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        chatForm.requestSubmit();
      }
    });

    buildExamples();
    buildUpgradePlans();
    refreshAccountBar();

    var acct = A.current();
    addMsg('bot', 'Describe it. Forge it.\n\nTell me the device you want — in plain words — and I will turn it into a buildable hardware project: working Arduino code, a parts list, a wiring map, and a step-by-step guide.' +
      (acct ? '\n\nWelcome back, ' + acct.name + '. You have ' + acct.credits + ' credits this month.' : '\n\nNew here? You get 25 free credits every month — they reset on the 1st, so they are yours to spend, not save.'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
