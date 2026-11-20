/* Voltforge — shared utilities.
   Security-relevant helpers live here so every surface uses the same ones:
   esc() for HTML output, sanitizeName() for free text that may reach a
   generated file, and strict numeric clamping for parameters. */
(function () {
  'use strict';

  var HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  /* Escape a string for safe insertion into HTML. */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return HTML_ESCAPES[c];
    });
  }

  /* Sanitize free text (project names, prompts echoed back).
     - caps length
     - strips control characters and anything that could break out of a
       C comment, an HTML context, or a filename
     Returns a plain, single-line string. */
  function sanitizeName(value, maxLen) {
    var s = String(value == null ? '' : value);
    s = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
    s = s.replace(/[*\/\\<>:"|?#&;`$]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen).trim();
    return s;
  }

  /* Clamp a value to a finite number in [min, max]; fallback if not numeric. */
  function clampNum(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  /* 'YYYY-MM' key for the calendar-month credit reset. */
  function monthKey(date) {
    var d = date || new Date();
    var m = String(d.getMonth() + 1);
    if (m.length < 2) m = '0' + m;
    return d.getFullYear() + '-' + m;
  }

  /* FNV-1a hash — DEMO-GRADE ONLY. Used to avoid storing plaintext passwords
     in localStorage for the demo account layer. It is NOT a password hash
     and must be replaced by a real server-side auth system at launch.
     See SECURITY.md. */
  function simpleHash(str) {
    var h = 0x811c9dc5;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* Trigger a browser download of generated content. Content is always
     produced by the engine's builders from whitelisted parameters. */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* Filename-safe slug from a sanitized project name. */
  function slug(name) {
    var s = sanitizeName(name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'voltforge-project';
  }

  window.VFUtil = {
    esc: esc,
    sanitizeName: sanitizeName,
    clampNum: clampNum,
    monthKey: monthKey,
    simpleHash: simpleHash,
    download: download,
    slug: slug
  };
})();
