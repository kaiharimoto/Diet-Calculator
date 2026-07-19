/* Lumière — app UI wiring. Vanilla JS, no dependencies. */
(function () {
  'use strict';
  var E = window.DietEngine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var CIRC = 326.7; // 2*pi*52

  var ACTIVITY = [
    { val: 'sedentary', label: 'Sedentary — desk job, little exercise' },
    { val: 'light', label: 'Lightly active — 1–3 workouts/week' },
    { val: 'moderate', label: 'Moderately active — 3–5 workouts/week' },
    { val: 'very', label: 'Very active — 6–7 workouts/week' },
    { val: 'extra', label: 'Athlete — hard training / physical job' }
  ];

  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('lumiere.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('lumiere.' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('lumiere.' + k); } catch (e) {} }
  };

  // ---- state ----
  var profile = LS.get('profile', {
    name: '', sex: 'female', age: '', unitSystem: 'imperial',
    heightFt: '', heightIn: '', height_cm: '',
    weight_lb: '', weight_kg: '', targetWeight_lb: '', targetWeight_kg: '',
    bodyFatPct: '', activityIdx: 1, goal: 'fatLoss', deficitAggressiveness: 'modest',
    contextFlags: [], healthFlags: []
  });
  var plan = LS.get('plan', null);

  // ===================================================================
  // FORM BINDING
  // ===================================================================
  function seg(name, val) {
    $$('[data-seg="' + name + '"] button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-val') === val));
    });
  }
  function bindSeg(name, onchange) {
    $$('[data-seg="' + name + '"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        seg(name, b.getAttribute('data-val'));
        onchange(b.getAttribute('data-val'));
      });
    });
  }
  function bindChips(name) {
    $$('[data-chips="' + name + '"] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-val');
        var arr = profile[name] || [];
        var i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        profile[name] = arr;
        b.setAttribute('aria-pressed', String(i < 0));
        saveProfile();
      });
    });
  }
  function bindInput(id, key, transform) {
    var el = $('#' + id); if (!el) return;
    el.addEventListener('input', function () {
      profile[key] = transform ? transform(el.value) : el.value;
      saveProfile();
    });
  }

  function applyUnits() {
    var imp = profile.unitSystem === 'imperial';
    $$('.imperial-only').forEach(function (e) { e.classList.toggle('hidden', !imp); });
    $$('.metric-only').forEach(function (e) { e.classList.toggle('hidden', imp); });
    seg('units', profile.unitSystem);
  }

  function hydrateForm() {
    $('#name').value = profile.name || '';
    $('#age').value = profile.age || '';
    $('#heightFt').value = profile.heightFt || '';
    $('#heightIn').value = profile.heightIn || '';
    $('#height_cm').value = profile.height_cm || '';
    $('#weight_lb').value = profile.weight_lb || '';
    $('#weight_kg').value = profile.weight_kg || '';
    $('#targetWeight_lb').value = profile.targetWeight_lb || '';
    $('#targetWeight_kg').value = profile.targetWeight_kg || '';
    $('#bodyFatPct').value = profile.bodyFatPct || '';
    seg('sex', profile.sex);
    seg('goal', profile.goal);
    seg('deficitAggressiveness', profile.deficitAggressiveness);
    $('#activity').value = profile.activityIdx;
    updateActivityLabel();
    (profile.contextFlags || []).forEach(function (v) { var b = $('[data-chips="contextFlags"] [data-val="' + v + '"]'); if (b) b.setAttribute('aria-pressed', 'true'); });
    (profile.healthFlags || []).forEach(function (v) { var b = $('[data-chips="healthFlags"] [data-val="' + v + '"]'); if (b) b.setAttribute('aria-pressed', 'true'); });
    applyUnits();
    updateDeficitVisibility();
  }

  function updateActivityLabel() { $('#activity-value').textContent = ACTIVITY[profile.activityIdx].label; }
  function updateDeficitVisibility() { $('#deficit-field').classList.toggle('hidden', profile.goal !== 'fatLoss'); }

  function saveProfile() { LS.set('profile', profile); }

  // ---- bind everything ----
  bindInput('name', 'name');
  bindInput('age', 'age');
  bindInput('heightFt', 'heightFt');
  bindInput('heightIn', 'heightIn');
  bindInput('height_cm', 'height_cm');
  bindInput('weight_lb', 'weight_lb');
  bindInput('weight_kg', 'weight_kg');
  bindInput('targetWeight_lb', 'targetWeight_lb');
  bindInput('targetWeight_kg', 'targetWeight_kg');
  bindInput('bodyFatPct', 'bodyFatPct');
  bindSeg('sex', function (v) { profile.sex = v; saveProfile(); });
  bindSeg('units', function (v) { profile.unitSystem = v; applyUnits(); saveProfile(); });
  bindSeg('goal', function (v) { profile.goal = v; updateDeficitVisibility(); saveProfile(); });
  bindSeg('deficitAggressiveness', function (v) { profile.deficitAggressiveness = v; saveProfile(); });
  bindChips('contextFlags');
  bindChips('healthFlags');
  $('#activity').addEventListener('input', function () { profile.activityIdx = +this.value; updateActivityLabel(); saveProfile(); });

  // ===================================================================
  // CALCULATE
  // ===================================================================
  function buildInput() {
    return {
      sex: profile.sex, age: profile.age, unitSystem: profile.unitSystem,
      heightFt: profile.heightFt, heightIn: profile.heightIn, height_cm: profile.height_cm,
      weight_lb: profile.weight_lb, weight_kg: profile.weight_kg,
      targetWeight: profile.unitSystem === 'imperial' ? profile.targetWeight_lb : profile.targetWeight_kg,
      bodyFatPct: profile.bodyFatPct,
      activityLevel: ACTIVITY[profile.activityIdx].val,
      goal: profile.goal, deficitAggressiveness: profile.deficitAggressiveness,
      contextFlags: profile.contextFlags, healthFlags: profile.healthFlags
    };
  }

  $('#calc-btn').addEventListener('click', function () {
    var res = E.computeDietPlan(buildInput());
    if (!res.ok) { $('#form-error').textContent = res.message; return; }
    $('#form-error').textContent = '';
    plan = res;
    LS.set('plan', plan);
    renderDashboard();
    renderFramework();
    renderToday();
    show('dashboard');
  });

  // ===================================================================
  // DASHBOARD
  // ===================================================================
  var MACROS = [
    { key: 'protein', label: 'Protein', color: 'var(--rose)', why: 'Collagen + lean mass', g: 'protein_g', p: 'pctP' },
    { key: 'fat', label: 'Fat', color: 'var(--honey)', why: 'Stable, saturated/mono', g: 'fat_g', p: 'pctF' },
    { key: 'carb', label: 'Carbs', color: 'var(--sage)', why: 'Mostly veg + low-sugar fruit', g: 'carb_g', p: 'pctC' }
  ];
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setRing(el, frac) {
    frac = Math.max(0, Math.min(1, frac));
    var off = CIRC * (1 - frac);
    if (reduce) { el.style.transition = 'none'; el.setAttribute('stroke-dashoffset', off); return; }
    el.setAttribute('stroke-dashoffset', CIRC);
    requestAnimationFrame(function () {
      el.style.transition = 'stroke-dashoffset 0.9s var(--ease)';
      el.setAttribute('stroke-dashoffset', off);
    });
  }

  function renderDashboard() {
    if (!plan) { $('#dash-empty').classList.remove('hidden'); $('#dash-content').classList.add('hidden'); return; }
    $('#dash-empty').classList.add('hidden'); $('#dash-content').classList.remove('hidden');

    var hr = new Date().getHours();
    var tod = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = tod + (profile.name ? ', ' + profile.name : '');
    $('#dash-title').textContent = 'Your plan';

    $('#cal-num').textContent = plan.calories.toLocaleString();
    setRing($('#cal-ring'), plan.calories / plan.tdee);
    var sub = plan.dailyDeficit > 0
      ? plan.deficitPct + '% below your ' + plan.tdee.toLocaleString() + ' maintenance'
      : 'At maintenance (' + plan.tdee.toLocaleString() + ' kcal)';
    $('#cal-sub').textContent = sub;

    var grid = $('#macro-grid'); grid.innerHTML = '';
    MACROS.forEach(function (m) {
      var g = plan.macros[m.g], p = plan.macros[m.p];
      var card = document.createElement('div');
      card.className = 'macro-card';
      card.innerHTML =
        '<div class="macro-ring"><svg viewBox="0 0 120 120" width="78" height="78">' +
        '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--hairline)" stroke-width="11"/>' +
        '<circle class="mr" cx="60" cy="60" r="52" fill="none" stroke="' + m.color + '" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="' + CIRC + '" stroke-dashoffset="' + CIRC + '"/>' +
        '</svg><div class="g"><span class="n">' + g + '</span><span class="p">g</span></div></div>' +
        '<div class="mlabel" style="color:' + m.color + '">' + m.label + ' · ' + p + '%</div>' +
        '<div class="mwhy">' + m.why + '</div>';
      grid.appendChild(card);
      setRing(card.querySelector('.mr'), p / 100);
    });

    $('#sugar-num').textContent = plan.striveFor.sugarCap_g + ' g';
    $('#sugar-meter').style.width = Math.min(100, plan.striveFor.sugarCap_g / 40 * 100) + '%';

    $('#bmr-v').textContent = plan.bmr.toLocaleString();
    $('#bmr-model').textContent = '· ' + plan.bmrModel;
    $('#tdee-v').textContent = plan.tdee.toLocaleString();
    $('#deficit-v').textContent = plan.dailyDeficit > 0 ? '−' + plan.dailyDeficit.toLocaleString() + ' kcal' : 'none';
    $('#loss-v').textContent = plan.weeklyLossKg > 0 ? (profile.unitSystem === 'imperial' ? plan.weeklyLossLb + ' lb' : plan.weeklyLossKg + ' kg') : '—';
    $('#ppk-v').textContent = plan.macros.protein_g + ' g (' + plan.macros.proteinPerKg + ' g/kg ' + plan.macros.refLabel + ')';
    $('#water-v').textContent = plan.striveFor.water_L;
    $('#cooking-text').textContent = plan.cooking;

    var nw = $('#notes-wrap'); nw.innerHTML = '';
    (plan.notes || []).forEach(function (n) {
      var msg = E.NOTE_MESSAGES[n]; if (!msg) return;
      var d = document.createElement('div'); d.className = 'note'; d.textContent = msg; nw.appendChild(d);
    });
  }

  // ===================================================================
  // FRAMEWORK
  // ===================================================================
  var currentCat = 'eat';
  bindSeg('cat', function (v) { currentCat = v; renderFrameworkList(); });

  function renderFrameworkList() {
    var list = E.FRAMEWORK[currentCat];
    var el = $('#framework-list'); el.innerHTML = '';
    list.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'food ' + currentCat;
      row.innerHTML = '<span class="dot"></span><div class="body"><div class="top"><span class="nm">' + item.name + '</span>' +
        (item.freq ? '<span class="fq">' + item.freq + '</span>' : '') + '</div><div class="wy">' + item.why + '</div></div>';
      el.appendChild(row);
    });
  }

  function renderFramework() {
    renderFrameworkList();
    if (!plan) { $('#strive-list').innerHTML = '<p class="muted" style="font-size:0.85rem">Calculate your plan to see personalized daily targets.</p>'; return; }
    var s = plan.striveFor;
    var items = [
      ['Protein', plan.macros.protein_g + ' g (~' + plan.plate.proteinServings + ' palm-size servings)'],
      ['Collagen / glycine', s.glycine_g + ' g — broth, connective cuts or ' + s.collagenPeptides_g + ' g peptides'],
      ['Omega-3 (EPA+DHA)', s.omega3_g + ' g — fatty fish ' + plan.plate.fattyFishPerWeek + '×/week'],
      ['Vitamin C', s.vitC],
      ['Vitamin A', s.vitaminA],
      ['Zinc + copper', s.zinc_mg + ' mg zinc · ' + s.copper_mg + ' mg copper (kept in balance)'],
      ['Sugar cap', 'under ' + s.sugarCap_g + ' g · honey ' + s.honeyCap],
      ['Hydration', s.water_L + ' L water']
    ];
    var el = $('#strive-list'); el.innerHTML = '';
    items.forEach(function (it) {
      var r = document.createElement('div'); r.className = 'stat-line';
      r.innerHTML = '<span class="k">' + it[0] + '</span><span class="v" style="max-width:58%;text-align:right;font-weight:500;font-size:0.82rem">' + it[1] + '</span>';
      el.appendChild(r);
    });
  }

  // ===================================================================
  // TODAY (checklist + streak)
  // ===================================================================
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function baseChecklist() {
    var p = plan;
    return [
      { t: 'Hit protein target', s: p ? p.macros.protein_g + ' g today' : 'your daily grams' },
      { t: 'Eat a collagen source', s: 'broth, gelatin, peptides or a skin-on cut' },
      { t: 'Omega-3 serving', s: 'fatty fish, roe or a fish-oil source' },
      { t: 'A little vitamin C', s: 'fresh/raw animal food, low-fructose fruit or bell pepper' },
      { t: 'Stay under the sugar budget', s: p ? '~' + p.striveFor.sugarCap_g + ' g fruit + honey' : 'keep free sugar modest' },
      { t: 'Cook gentle — no char', s: 'steam, poach, braise or slow-cook' },
      { t: 'Hydrate', s: p ? p.striveFor.water_L + ' L water' : '2–3 L water' }
    ];
  }

  function loadToday() {
    var t = LS.get('today', null);
    var key = todayKey();
    if (!t || t.date !== key) {
      // roll previous day into history
      if (t && t.checked) {
        var hist = LS.get('history', {});
        var done = t.checked.filter(Boolean).length;
        hist[t.date] = done / t.checked.length;
        LS.set('history', hist);
      }
      t = { date: key, checked: [] };
      LS.set('today', t);
    }
    return t;
  }

  function renderToday() {
    var items = baseChecklist();
    var t = loadToday();
    while (t.checked.length < items.length) t.checked.push(false);

    var list = $('#today-list'); list.innerHTML = '';
    items.forEach(function (it, i) {
      var row = document.createElement('div');
      row.className = 'check'; row.setAttribute('role', 'checkbox');
      row.setAttribute('aria-checked', String(!!t.checked[i]));
      row.innerHTML = '<span class="box"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>' +
        '<div class="txt"><div class="t">' + it.t + '</div><div class="s">' + it.s + '</div></div>';
      row.addEventListener('click', function () {
        t.checked[i] = !t.checked[i];
        row.setAttribute('aria-checked', String(t.checked[i]));
        LS.set('today', t);
        updateTodayRing(items, t);
      });
      list.appendChild(row);
    });
    updateTodayRing(items, t);
    renderStreak();
  }

  function updateTodayRing(items, t) {
    var done = t.checked.filter(Boolean).length;
    var frac = done / items.length;
    $('#today-count').textContent = done + ' of ' + items.length;
    $('#today-pct').textContent = Math.round(frac * 100) + '%';
    var el = $('#today-ring-fill');
    el.style.transition = reduce ? 'none' : 'stroke-dashoffset 0.5s var(--ease)';
    el.setAttribute('stroke-dashoffset', CIRC * (1 - frac));
    // live-update history for today so streak reflects current progress
    var hist = LS.get('history', {});
    hist[t.date] = frac;
    LS.set('history', hist);
  }

  function renderStreak() {
    var hist = LS.get('history', {});
    var wrap = $('#streak'); wrap.innerHTML = '';
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var frac = hist[dateKey(d)] || 0;
      var dot = document.createElement('span');
      dot.className = 'd' + (frac >= 0.7 ? ' on' : '');
      wrap.appendChild(dot);
    }
  }

  // ===================================================================
  // NAVIGATION
  // ===================================================================
  function show(name) {
    $$('.screen').forEach(function (s) { s.classList.toggle('active', s.getAttribute('data-screen') === name); });
    $$('.tabbar button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name)); });
    window.scrollTo(0, 0);
    if (name === 'dashboard') renderDashboard();
    if (name === 'framework') renderFramework();
    if (name === 'today') renderToday();
  }
  $$('.tabbar button').forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-tab')); }); });
  $$('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-goto')); }); });

  // ===================================================================
  // THEME
  // ===================================================================
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t || '');
    seg('theme', t || '');
    LS.set('theme', t || '');
  }
  bindSeg('theme', function (v) { applyTheme(v); });
  applyTheme(LS.get('theme', ''));

  // ===================================================================
  // RESET
  // ===================================================================
  $('#reset-btn').addEventListener('click', function () {
    if (!confirm('Reset all your data and start over?')) return;
    ['profile', 'plan', 'today', 'history'].forEach(LS.del);
    location.reload();
  });

  // ===================================================================
  // INSTALL COACH (iOS)
  // ===================================================================
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  (function coach() {
    var isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isiOS && !isStandalone() && !LS.get('coachDismissed', false)) {
      $('#install-coach').classList.remove('hidden');
    }
    $('#about-install').classList.toggle('hidden', isStandalone());
    $('#coach-close').addEventListener('click', function () {
      $('#install-coach').classList.add('hidden');
      LS.set('coachDismissed', true);
    });
  })();

  // ===================================================================
  // INIT
  // ===================================================================
  var todayLbl = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#today-date').textContent = todayLbl;

  hydrateForm();
  renderFrameworkList();

  // Start on dashboard if we have a plan, else profile
  show(plan ? 'dashboard' : 'profile');
  if (plan) { renderDashboard(); }

  // hide splash
  window.addEventListener('load', function () {
    setTimeout(function () { var s = $('#splash'); if (s) { s.classList.add('hide'); setTimeout(function () { s.remove(); }, 600); } }, 550);
  });
  if (document.readyState === 'complete') { setTimeout(function () { var s = $('#splash'); if (s) { s.classList.add('hide'); setTimeout(function () { s.remove(); }, 600); } }, 550); }

  // ---- service worker ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
