/* Voltforge — demo account + credit layer (localStorage).
   DEMO-GRADE BY DESIGN: accounts live only in this browser. There is no
   server, no real password security (passwords are obfuscated with a simple
   non-crypto hash so they are not stored as plaintext), and no real money.
   Real auth + payments are launch gates. See SECURITY.md.

   Credit model (Base44 pattern): a monthly pool that RESETS on the 1st.
   Generation costs 5 credits; each export costs 1. */
(function () {
  'use strict';

  var ACCOUNTS_KEY = 'vf_accounts_v1';
  var SESSION_KEY = 'vf_session_v1';

  var PLANS = {
    free:    { id: 'free',    name: 'Free',    price: 0,  credits: 25 },
    starter: { id: 'starter', name: 'Starter', price: 16, credits: 150 },
    builder: { id: 'builder', name: 'Builder', price: 40, credits: 400 },
    pro:     { id: 'pro',     name: 'Pro',     price: 80, credits: 1000 }
  };

  var COST_GENERATE = 5;
  var COST_EXPORT = 1;

  function loadAccounts() {
    try {
      var raw = localStorage.getItem(ACCOUNTS_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase().slice(0, 120);
  }

  function validEmail(email) {
    return /^[^\s@]{1,64}@[^\s@]{1,60}\.[^\s@]{2,24}$/.test(email);
  }

  /* The monthly reset: if the stored month is not the current calendar
     month, the pool refills to the plan's monthly credits. This is the
     core of the model — a resetting allowance, never a draining bucket. */
  function ensureMonthReset(acct) {
    var now = window.VFUtil.monthKey();
    if (acct.month !== now) {
      acct.credits = PLANS[acct.plan].credits;
      acct.month = now;
      return true;
    }
    return false;
  }

  function persist(acct) {
    var accounts = loadAccounts();
    accounts[acct.email] = acct;
    saveAccounts(accounts);
  }

  function signup(name, email, password) {
    email = normalizeEmail(email);
    name = window.VFUtil.sanitizeName(name, 40);
    password = String(password || '');
    if (!name) return { ok: false, error: 'Please enter your name.' };
    if (!validEmail(email)) return { ok: false, error: 'That email does not look right.' };
    if (password.length < 6 || password.length > 128) {
      return { ok: false, error: 'Password needs 6–128 characters (demo account — do not reuse a real password).' };
    }
    var accounts = loadAccounts();
    if (accounts[email]) return { ok: false, error: 'An account with that email already exists here. Try signing in.' };
    var acct = {
      name: name,
      email: email,
      pass: window.VFUtil.simpleHash(password + '::' + email),
      plan: 'free',
      credits: PLANS.free.credits,
      month: window.VFUtil.monthKey(),
      createdAt: new Date().toISOString()
    };
    accounts[email] = acct;
    saveAccounts(accounts);
    localStorage.setItem(SESSION_KEY, email);
    return { ok: true, account: acct };
  }

  function signin(email, password) {
    email = normalizeEmail(email);
    var accounts = loadAccounts();
    var acct = accounts[email];
    if (!acct) return { ok: false, error: 'No account with that email in this browser yet.' };
    if (acct.pass !== window.VFUtil.simpleHash(String(password || '') + '::' + email)) {
      return { ok: false, error: 'Wrong password for this demo account.' };
    }
    if (ensureMonthReset(acct)) persist(acct);
    localStorage.setItem(SESSION_KEY, email);
    return { ok: true, account: acct };
  }

  function signout() {
    localStorage.removeItem(SESSION_KEY);
  }

  /* Current signed-in account (with the monthly reset applied), or null. */
  function current() {
    var email = localStorage.getItem(SESSION_KEY);
    if (!email) return null;
    var accounts = loadAccounts();
    var acct = accounts[email];
    if (!acct) return null;
    if (ensureMonthReset(acct)) persist(acct);
    return acct;
  }

  /* Spend credits. Returns true and persists on success; false if the
     balance cannot cover it (caller shows the upgrade prompt). */
  function spend(n) {
    var acct = current();
    if (!acct) return false;
    if (acct.credits < n) return false;
    acct.credits -= n;
    persist(acct);
    return true;
  }

  function balance() {
    var acct = current();
    return acct ? acct.credits : 0;
  }

  window.VFAccount = {
    PLANS: PLANS,
    COST_GENERATE: COST_GENERATE,
    COST_EXPORT: COST_EXPORT,
    signup: signup,
    signin: signin,
    signout: signout,
    current: current,
    spend: spend,
    balance: balance,
    ensureMonthReset: ensureMonthReset
  };
})();
