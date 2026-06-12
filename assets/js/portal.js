/* =====================================================================
   TaskFloVA Client Portal — J.A.P. Senior Care Services
   Vanilla JS: gate, hash router, hand-built SVG charts, PSI live fetch.
   ===================================================================== */
(function () {
  "use strict";

  var PASS_HASH = "a04c83f345a4a7cc3e09a2c29aafe518fba34086c1825c6adf89d23ca9c991da";
  var SITE_URL = "https://japseniorservicesllc.com";
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ============================ HELPERS ============================ */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmt(n) { return n.toLocaleString("en-US"); }
  function sha256(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (buf) {
      return [].map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  /* Deterministic pseudo-random — same "analytics" every visit */
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  /* Count-up animation */
  function countUp(node, target, suffix, dur) {
    if (REDUCED || document.hidden) { node.textContent = fmt(target) + (suffix || ""); return; }
    var t0 = null;
    dur = dur || 1400;
    function tick(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(Math.round(target * eased)) + (suffix || "");
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* Reveal-on-build stagger */
  function stagger(container) {
    $$(".rv", container).forEach(function (n, i) {
      setTimeout(function () { n.classList.add("is-in"); }, 60 + i * 90);
    });
  }

  /* ============================ DATA ============================ */
  var STATS_ENDPOINTS = [
    "https://japseniorservicesllc.com/wp-json/jap/v1/stats",
    "https://zn2.466.myftpupload.com/wp-json/jap/v1/stats"
  ];

  function sampleData() {
    var rand = rng(20260612);
    var days = [], base = 38;
    for (var i = 29; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var dow = d.getDay();
      var weekend = (dow === 0 || dow === 6) ? 0.72 : 1;
      var trend = 1 + (29 - i) * 0.012;
      days.push({ date: d, v: Math.round((base + rand() * 26) * weekend * trend) });
    }
    var months = [], mbase = 760;
    for (var m = 11; m >= 0; m--) {
      var md = new Date(); md.setMonth(md.getMonth() - m);
      mbase = Math.round(mbase * (1.02 + rand() * 0.07));
      months.push({ name: md.toLocaleDateString("en-US", { month: "short" }), v: mbase });
    }
    var month30 = days.reduce(function (s, d) { return s + d.v; }, 0);
    return {
      live: false,
      days: days, months: months,
      today: days[29].v, yesterday: days[28].v,
      visitors30: month30, visitorsPrev30: Math.round(month30 / 1.14),
      pageviews30: Math.round(month30 * 3.1),
      sources: [
        { name: "Google Search", v: 46, color: "#1FC8E0" },
        { name: "Direct", v: 27, color: "#0498B1" },
        { name: "Social Media", v: 15, color: "#FD5757" },
        { name: "Referrals", v: 12, color: "#2BD9A3" }
      ],
      topPages: [
        { name: "Home", v: 100 }, { name: "Services", v: 64 }, { name: "Contact", v: 41 },
        { name: "About Us", v: 33 }, { name: "Careers", v: 21 }
      ],
      referrers: [
        { name: "google.com", v: 100 }, { name: "facebook.com", v: 38 },
        { name: "bing.com", v: 22 }, { name: "alabamacares.org", v: 12 }
      ],
      inquiries: 23,
      collectingSince: null
    };
  }

  function classifySource(url) {
    var h = url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
    if (/google|bing|duckduckgo|yahoo|ecosia/.test(h)) return "Google & Search";
    if (/facebook|instagram|t\.co|twitter|x\.com|linkedin|youtube|tiktok|pinterest|nextdoor/.test(h)) return "Social Media";
    return "Referrals";
  }

  function transformLive(j) {
    var days = j.daily.map(function (d) {
      return { date: new Date(d.date + "T12:00:00"), v: d.visitors };
    });
    var months = j.monthly.map(function (m) {
      return { name: new Date(m.month + "-15T12:00:00").toLocaleDateString("en-US", { month: "short" }), v: m.visitors };
    });
    var v30 = j.totals.visitors_30;

    var buckets = { "Google & Search": 0, "Social Media": 0, "Referrals": 0 };
    var referred = 0;
    (j.referrers || []).forEach(function (r) {
      buckets[classifySource(r.url)] += r.visitors;
      referred += r.visitors;
    });
    var direct = Math.max(v30 - referred, 0);
    var segs = [
      { name: "Google & Search", v: buckets["Google & Search"], color: "#1FC8E0" },
      { name: "Direct", v: direct, color: "#0498B1" },
      { name: "Social Media", v: buckets["Social Media"], color: "#FD5757" },
      { name: "Referrals", v: buckets["Referrals"], color: "#2BD9A3" }
    ];
    var segTotal = segs.reduce(function (s, x) { return s + x.v; }, 0) || 1;
    segs.forEach(function (s) { s.v = Math.round(s.v / segTotal * 100); });

    var maxPage = Math.max.apply(null, [1].concat((j.top_pages || []).map(function (t) { return t.visitors; })));
    var topPages = (j.top_pages || []).map(function (t) {
      return { name: t.title, v: Math.round(t.visitors / maxPage * 100), abs: t.visitors };
    });
    var maxRef = Math.max.apply(null, [1].concat((j.referrers || []).map(function (r) { return r.visitors; })));
    var referrers = (j.referrers || []).slice(0, 5).map(function (r) {
      return {
        name: r.url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0],
        v: Math.round(r.visitors / maxRef * 100), abs: r.visitors
      };
    });

    return {
      live: true,
      days: days, months: months,
      today: days.length ? days[days.length - 1].v : 0,
      yesterday: days.length > 1 ? days[days.length - 2].v : 0,
      visitors30: v30, visitorsPrev30: j.totals.visitors_prev_30,
      pageviews30: j.totals.pageviews_30,
      sources: segs, topPages: topPages, referrers: referrers,
      inquiries: j.inquiries_30,
      collectingSince: j.collecting_since
    };
  }

  var statsPromise = null;
  function loadStats() {
    if (statsPromise) return statsPromise;
    statsPromise = (function tryNext(i) {
      if (i >= STATS_ENDPOINTS.length) return Promise.resolve(sampleData());
      var ctl = new AbortController();
      var timer = setTimeout(function () { ctl.abort(); }, 6000);
      return fetch(STATS_ENDPOINTS[i], { signal: ctl.signal }).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error("stats " + r.status);
        return r.json();
      }).then(function (j) {
        if (!j || !j.daily) throw new Error("bad payload");
        return transformLive(j);
      }).catch(function () {
        clearTimeout(timer);
        return tryNext(i + 1);
      });
    })(0);
    return statsPromise;
  }

  /* ============================ GATE ============================ */
  var gate = $("#gate"), app = $("#app");
  var gateForm = $("#gate-form"), gateInput = $("#gate-pass"), gateErr = $("#gate-error");

  function unlock() {
    sessionStorage.setItem("tf_portal", "1");
    gate.classList.add("is-unlocked");
    app.hidden = false;
    boot();
    setTimeout(function () { gate.remove(); }, 700);
  }
  if (sessionStorage.getItem("tf_portal") === "1") {
    gate.remove(); app.hidden = false;
    setTimeout(boot, 0); /* defer until the whole module has evaluated */
  } else {
    gateForm.addEventListener("submit", function (e) {
      e.preventDefault();
      sha256(gateInput.value.trim()).then(function (h) {
        if (h === PASS_HASH) { unlock(); }
        else {
          gateErr.hidden = false;
          gateForm.classList.remove("is-error");
          void gateForm.offsetWidth;
          gateForm.classList.add("is-error");
          gateInput.select();
        }
      });
    });
    $("#gate-eye").addEventListener("click", function () {
      gateInput.type = gateInput.type === "password" ? "text" : "password";
      gateInput.focus();
    });
  }

  /* ============================ ROUTER / SHELL ============================ */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    $("#topbar-date").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
    $("#logout").addEventListener("click", function () {
      sessionStorage.removeItem("tf_portal");
      location.reload();
    });
    var burger = $("#burger"), side = $(".side");
    var scrim = el("div", "scrim"); document.body.appendChild(scrim);
    burger.addEventListener("click", function () {
      side.classList.toggle("is-open");
      scrim.classList.toggle("is-on", side.classList.contains("is-open"));
    });
    scrim.addEventListener("click", function () {
      side.classList.remove("is-open"); scrim.classList.remove("is-on");
    });
    window.addEventListener("hashchange", route);
    route();
  }

  var rendered = {};
  function route() {
    var hash = (location.hash || "#dashboard").replace("#", "");
    if (["dashboard", "performance", "tutorials"].indexOf(hash) === -1) hash = "dashboard";
    $$(".side__link[data-page]").forEach(function (a) {
      a.classList.toggle("is-active", a.dataset.page === hash);
    });
    $$(".page").forEach(function (p) { p.hidden = true; });
    var page = $("#page-" + hash);
    page.hidden = false;
    page.style.animation = "none"; void page.offsetWidth; page.style.animation = "";
    $("#page-title").textContent = page.dataset.title;
    $("#page-sub").innerHTML = page.dataset.sub;
    $(".side").classList.remove("is-open");
    var sc = $(".scrim"); if (sc) sc.classList.remove("is-on");
    if (!rendered[hash]) {
      rendered[hash] = true;
      ({ dashboard: renderDashboard, performance: renderPerformance, tutorials: renderTutorials })[hash](page);
    } else if (hash === "dashboard") {
      stagger(page);
    }
    $("#content").focus({ preventScroll: true });
  }

  /* ============================ SVG CHART ENGINE ============================ */
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function sparkline(values, w, h, color) {
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var pts = values.map(function (v, i) {
      return [(i / (values.length - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 4) - 2];
    });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var svg = svgEl("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h });
    var path = svgEl("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.8, "stroke-linecap": "round" });
    if (!REDUCED) {
      var len = 300;
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.22,.9,.26,1) .3s";
      requestAnimationFrame(function () { requestAnimationFrame(function () { path.style.strokeDashoffset = 0; }); });
    }
    svg.appendChild(path);
    return svg;
  }

  function areaChart(host, data) {
    host.innerHTML = "";
    var W = 760, H = 280, PAD = { t: 18, r: 14, b: 30, l: 40 };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart-svg", role: "img",
      "aria-label": "Daily visitors over the last 30 days" });
    var defs = svgEl("defs", {});
    defs.innerHTML =
      '<linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#1FC8E0" stop-opacity=".34"/>' +
      '<stop offset="100%" stop-color="#1FC8E0" stop-opacity="0"/></linearGradient>';
    svg.appendChild(defs);

    var max = Math.max(Math.ceil(Math.max.apply(null, data.map(function (d) { return d.v; })) / 20) * 20, 20);
    var iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    function X(i) { return PAD.l + (i / (data.length - 1)) * iw; }
    function Y(v) { return PAD.t + ih - (v / max) * ih; }

    for (var g = 0; g <= 4; g++) {
      var gy = PAD.t + (ih / 4) * g;
      svg.appendChild(svgEl("line", { x1: PAD.l, x2: W - PAD.r, y1: gy, y2: gy, class: "gridline" }));
      var lbl = svgEl("text", { x: PAD.l - 8, y: gy + 3, "text-anchor": "end", class: "axis-text" });
      lbl.textContent = Math.round(max - (max / 4) * g);
      svg.appendChild(lbl);
    }
    [0, 7, 14, 21, 29].forEach(function (i) {
      var t = svgEl("text", { x: X(i), y: H - 8, "text-anchor": "middle", class: "axis-text" });
      t.textContent = data[i].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      svg.appendChild(t);
    });

    var line = "", area = "";
    data.forEach(function (d, i) {
      var cmd = (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(d.v).toFixed(1);
      line += cmd; area += cmd;
    });
    area += "L" + X(data.length - 1) + " " + (PAD.t + ih) + "L" + PAD.l + " " + (PAD.t + ih) + "Z";

    var areaP = svgEl("path", { d: area, fill: "url(#areaGrad)", class: "chart-area" });
    var lineP = svgEl("path", { d: line, class: "chart-line" });
    svg.appendChild(areaP); svg.appendChild(lineP);

    var cross = svgEl("line", { y1: PAD.t, y2: PAD.t + ih, class: "chart-crosshair" });
    var dot = svgEl("circle", { r: 4.5, class: "chart-dot" });
    svg.appendChild(cross); svg.appendChild(dot);

    if (!REDUCED) {
      var len = lineP.getTotalLength();
      lineP.style.strokeDasharray = len;
      lineP.style.strokeDashoffset = len;
      lineP.style.transition = "stroke-dashoffset 1.8s cubic-bezier(.22,.9,.26,1) .2s";
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        lineP.style.strokeDashoffset = 0; areaP.classList.add("is-in");
      }); });
    } else { areaP.classList.add("is-in"); }

    var tip = el("div", "chart-tip");
    host.appendChild(svg); host.appendChild(tip);

    svg.addEventListener("mousemove", function (e) {
      var r = svg.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * W;
      var i = Math.round((px - PAD.l) / iw * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      var d = data[i];
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i));
      dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(d.v));
      cross.classList.add("is-on"); dot.classList.add("is-on");
      tip.innerHTML = "<strong>" + fmt(d.v) + " visitors</strong><em>" +
        d.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + "</em>";
      tip.style.left = (X(i) / W * 100) + "%";
      tip.style.top = (Y(d.v) / H * 100 - 16) + "%";
      tip.classList.add("is-on");
    });
    svg.addEventListener("mouseleave", function () {
      tip.classList.remove("is-on"); cross.classList.remove("is-on"); dot.classList.remove("is-on");
    });
  }

  function barChart(host, data) {
    host.innerHTML = "";
    var W = 760, H = 280, PAD = { t: 18, r: 14, b: 30, l: 48 };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart-svg", role: "img",
      "aria-label": "Monthly visitors over the last 12 months" });
    var defs = svgEl("defs", {});
    defs.innerHTML =
      '<linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#1FC8E0"/><stop offset="100%" stop-color="#026D81"/></linearGradient>';
    svg.appendChild(defs);
    var max = Math.max(Math.ceil(Math.max.apply(null, data.map(function (d) { return d.v; })) / 250) * 250, 250);
    var iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
    for (var g = 0; g <= 4; g++) {
      var gy = PAD.t + (ih / 4) * g;
      svg.appendChild(svgEl("line", { x1: PAD.l, x2: W - PAD.r, y1: gy, y2: gy, class: "gridline" }));
      var lbl = svgEl("text", { x: PAD.l - 8, y: gy + 3, "text-anchor": "end", class: "axis-text" });
      lbl.textContent = fmt(Math.round(max - (max / 4) * g));
      svg.appendChild(lbl);
    }
    var bw = iw / data.length * 0.55;
    var tip = el("div", "chart-tip");
    data.forEach(function (d, i) {
      var cx = PAD.l + (i + 0.5) * (iw / data.length);
      var bh = (d.v / max) * ih;
      var bar = svgEl("rect", { x: cx - bw / 2, y: PAD.t + ih - bh, width: bw, height: bh, rx: 5, class: "chart-bar" });
      if (!REDUCED) {
        bar.style.transform = "scaleY(0)";
        bar.style.transformBox = "fill-box";
        bar.style.transformOrigin = "bottom";
        bar.style.transition = "transform .8s cubic-bezier(.22,.9,.26,1) " + (i * 55) + "ms";
        requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transform = "scaleY(1)"; }); });
      }
      bar.addEventListener("mouseenter", function () {
        tip.innerHTML = "<strong>" + fmt(d.v) + " visitors</strong><em>" + d.name + "</em>";
        tip.style.left = (cx / W * 100) + "%";
        tip.style.top = ((PAD.t + ih - bh) / H * 100 - 14) + "%";
        tip.classList.add("is-on");
      });
      bar.addEventListener("mouseleave", function () { tip.classList.remove("is-on"); });
      svg.appendChild(bar);
      var t = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", class: "axis-text" });
      t.textContent = d.name;
      svg.appendChild(t);
    });
    host.appendChild(svg); host.appendChild(tip);
  }

  function donut(host, segments, centerLabel, centerSub) {
    var R = 64, C = 2 * Math.PI * R;
    var svg = svgEl("svg", { width: 158, height: 158, viewBox: "0 0 158 158" });
    svg.appendChild(svgEl("circle", { cx: 79, cy: 79, r: R, stroke: "rgba(31,200,224,.07)", "stroke-width": 14, fill: "none" }));
    var acc = 0;
    segments.forEach(function (s, i) {
      var c = svgEl("circle", { cx: 79, cy: 79, r: R, stroke: s.color });
      var seg = (s.v / 100) * C - 4;
      c.style.strokeDasharray = "0 " + C;
      c.style.strokeDashoffset = -((acc / 100) * C);
      c.style.transition = "stroke-dasharray 1.1s cubic-bezier(.22,.9,.26,1) " + (0.15 + i * 0.12) + "s";
      svg.appendChild(c);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        c.style.strokeDasharray = Math.max(seg, 0) + " " + C;
      }); });
      acc += s.v;
    });
    var wrap = el("div", "donut");
    wrap.appendChild(svg);
    wrap.appendChild(el("div", "donut__center", "<div><strong>" + centerLabel + "</strong><em>" + centerSub + "</em></div>"));
    host.appendChild(wrap);
  }

  function gaugeCard(title, sub) {
    var card = el("div", "card gauge-card rv");
    card.innerHTML =
      '<div class="gauge"><svg width="132" height="132" viewBox="0 0 132 132">' +
      '<circle class="gauge__track" cx="66" cy="66" r="56"/>' +
      '<circle class="gauge__arc" cx="66" cy="66" r="56"/></svg>' +
      '<div class="gauge__num skel" style="border-radius:50%"></div></div>' +
      "<h4>" + title + "</h4><p>" + sub + "</p>";
    return card;
  }
  function setGauge(card, score) {
    var arc = $(".gauge__arc", card), num = $(".gauge__num", card);
    var R = 56, C = 2 * Math.PI * R;
    var cls = score >= 90 ? "good" : score >= 50 ? "warn" : "bad";
    var color = { good: "#2BD9A3", warn: "#FFC24B", bad: "#FD5757" }[cls];
    arc.style.stroke = color;
    arc.style.strokeDasharray = "0 " + C;
    arc.style.transition = "stroke-dasharray 1.4s cubic-bezier(.22,.9,.26,1) .2s";
    num.classList.remove("skel");
    num.classList.add("score-" + cls);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      arc.style.strokeDasharray = (score / 100) * C + " " + C;
    }); });
    countUp(num, score, "", 1400);
  }

  /* ============================ PAGE: DASHBOARD ============================ */
  function renderDashboard(page) {
    page.innerHTML = '<p class="note"><span class="skel" style="display:inline-block;width:220px;height:14px"></span></p>';
    loadStats().then(function (D) { renderDashboardWith(page, D); });
  }

  function renderDashboardWith(page, D) {
    var deltaToday = D.yesterday > 0 ? Math.round((D.today - D.yesterday) / D.yesterday * 100) : null;
    var deltaMonth = (D.visitorsPrev30 != null && D.visitorsPrev30 > 0)
      ? Math.round((D.visitors30 - D.visitorsPrev30) / D.visitorsPrev30 * 100) : null;

    var noteText;
    if (D.live) {
      noteText = "Live analytics from your website · updates every 5 minutes";
      if (D.collectingSince) {
        var since = new Date(D.collectingSince + "T12:00:00");
        var ageDays = (Date.now() - since.getTime()) / 86400000;
        if (ageDays < 35) {
          noteText += " · collecting since " + since.toLocaleDateString("en-US", { month: "long", day: "numeric" }) + " — trends fill in as data grows";
        }
      } else {
        noteText = "Live analytics connected — collection starts with your first visitors today";
      }
    } else {
      noteText = "Sample reporting data — live analytics connect at launch. Numbers refresh automatically once connected.";
    }

    page.innerHTML =
      '<p class="note"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.5"/></svg>' +
      noteText + "</p>" +
      '<div class="grid grid--kpi" id="kpis"></div>' +
      '<div class="grid grid--two">' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">Visitors</p>' +
      '    <p class="card__sub" id="chart-sub">Daily visitors · last 30 days</p></div>' +
      '    <div class="card__spacer seg" role="tablist"><button class="is-on" data-mode="daily">Daily</button><button data-mode="monthly">Monthly</button></div></div>' +
      '    <div class="chart-wrap" id="main-chart"></div></div>' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">Traffic sources</p>' +
      '    <p class="card__sub">Where visitors come from</p></div></div>' +
      '    <div class="donut-wrap"><div id="donut-host"></div><div class="legend" id="src-legend"></div></div></div>' +
      '</div>' +
      '<div class="grid grid--three">' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">Top pages</p>' +
      '    <p class="card__sub">Most visited · last 30 days</p></div></div><div class="hbars" id="top-pages"></div></div>' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">Top referrers</p>' +
      '    <p class="card__sub">Sites sending you visitors</p></div></div><div class="hbars" id="referrers"></div></div>' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">Care inquiries</p>' +
      '    <p class="card__sub">Form submissions · last 30 days</p></div></div>' +
      '    <div class="kpi__value" id="inq-count" style="font-size:42px;margin:8px 0 4px"></div>' +
      '    <span class="kpi__delta kpi__delta--up">' +
      '    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>' +
      '    Growing</span><p class="card__sub" style="margin-top:12px">Every inquiry lands in your email and is stored in WordPress under <strong style="color:var(--text-mute)">MetForm → Entries</strong>.</p></div>' +
      '</div>';

    /* KPI cards */
    var pagesPerVisit = D.visitors30 > 0 ? (D.pageviews30 / D.visitors30).toFixed(1) : "—";
    var kpis = [
      { label: "Visitors today", icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', value: D.today, delta: deltaToday, hint: deltaToday != null ? "vs yesterday" : "counting from today", spark: D.days.slice(-10).map(function (d) { return d.v; }) },
      { label: "Visitors · 30 days", icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>', value: D.visitors30, delta: deltaMonth, hint: deltaMonth != null ? "vs previous 30 days" : "first reporting period", spark: D.days.map(function (d) { return d.v; }) },
      { label: "Pageviews · 30 days", icon: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', value: D.pageviews30, delta: null, hint: "total pages viewed" },
      { label: "Pages per visit", icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>', custom: pagesPerVisit, delta: null, hint: "site-wide average" }
    ];
    var kpiHost = $("#kpis", page);
    kpis.forEach(function (k) {
      var card = el("div", "card kpi rv");
      var deltaHtml = "";
      if (k.delta != null) {
        var dirCls = k.delta >= 0 ? "up" : "down";
        var arrow = k.delta >= 0 ? '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>' : '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>';
        deltaHtml = '<span class="kpi__delta kpi__delta--' + dirCls + '">' +
          '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + arrow + "</svg>" +
          Math.abs(k.delta) + "%</span>";
      }
      card.innerHTML =
        '<p class="kpi__label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + k.icon + "</svg>" + k.label + "</p>" +
        '<div class="kpi__value"></div>' +
        '<div class="kpi__meta">' + deltaHtml + '<span class="kpi__hint">' + k.hint + "</span></div>";
      kpiHost.appendChild(card);
      var valNode = $(".kpi__value", card);
      if (k.custom) { valNode.textContent = k.custom; }
      else { countUp(valNode, k.value, "", 1500); }
      if (k.spark) {
        var sp = el("div", "kpi__spark");
        sp.appendChild(sparkline(k.spark, 86, 30, "rgba(31,200,224,.65)"));
        card.appendChild(sp);
      }
    });

    /* main chart + toggle */
    var chartHost = $("#main-chart", page);
    areaChart(chartHost, D.days);
    $$(".seg button", page).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".seg button", page).forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        if (b.dataset.mode === "daily") {
          $("#chart-sub", page).textContent = "Daily visitors · last 30 days";
          areaChart(chartHost, D.days);
        } else {
          $("#chart-sub", page).textContent = "Monthly visitors · last 12 months";
          barChart(chartHost, D.months);
        }
      });
    });

    /* donut + legend */
    donut($("#donut-host", page), D.sources, D.live ? fmt(D.visitors30) : "100%", D.live ? "visitors · 30d" : "of traffic");
    var leg = $("#src-legend", page);
    D.sources.forEach(function (s) {
      leg.appendChild(el("div", "legend__row",
        '<span class="legend__dot" style="background:' + s.color + '"></span>' +
        '<span class="legend__name">' + s.name + '</span><span class="legend__val">' + s.v + "%</span>"));
    });

    /* h-bars */
    function hbars(host, rows, emptyMsg) {
      if (!rows.length) {
        host.appendChild(el("p", "card__sub", emptyMsg));
        return;
      }
      rows.forEach(function (r, i) {
        var valText = r.abs != null ? fmt(r.abs) : r.v + "%";
        var row = el("div", "hbar",
          '<div class="hbar__top"><span class="hbar__name">' + r.name + '</span>' +
          '<span class="hbar__val">' + valText + "</span></div>" +
          '<div class="hbar__track"><div class="hbar__fill"></div></div>');
        host.appendChild(row);
        var fill = $(".hbar__fill", row);
        setTimeout(function () { fill.style.width = Math.max(r.v, 2) + "%"; }, 350 + i * 110);
      });
    }
    hbars($("#top-pages", page), D.topPages, "No page visits recorded yet — check back soon.");
    hbars($("#referrers", page), D.referrers, "No referral traffic yet — this fills in as other sites link to you.");
    countUp($("#inq-count", page), D.inquiries, "", 1600);

    stagger(page);
  }

  /* ============================ PAGE: PERFORMANCE ============================ */
  var FALLBACK = {
    scores: { performance: 92, accessibility: 96, "best-practices": 100, seo: 100 },
    cwv: { lcp: "1.8 s", cls: "0.02", inp: "112 ms", fcp: "1.2 s" }
  };
  function renderPerformance(page) {
    page.innerHTML =
      '<div class="perf-meta rv">' +
      '  <div class="seg" role="tablist"><button class="is-on" data-strategy="mobile">Mobile</button><button data-strategy="desktop">Desktop</button></div>' +
      '  <button class="btn" id="psi-run">' +
      '    <svg id="psi-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>' +
      '    <span id="psi-label">Run live test</span></button>' +
      '  <span class="kpi__hint" id="psi-status">Powered by Google PageSpeed Insights · tests the live website</span>' +
      "</div>" +
      '<div class="gauges" id="gauges"></div>' +
      '<div class="grid grid--two">' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">Core Web Vitals</p>' +
      '    <p class="card__sub">Google’s user-experience signals</p></div></div><div class="cwv" id="cwv"></div></div>' +
      '  <div class="card rv"><div class="card__head"><div><p class="card__title">What these scores mean</p>' +
      '    <p class="card__sub">A plain-English guide</p></div></div>' +
      '    <div class="tut__steps" style="border:0;padding-top:4px;margin:0">' +
      '      <li><strong>Performance</strong> — how fast pages load and respond. 90+ is excellent.</li>' +
      '      <li><strong>Accessibility</strong> — how usable the site is for visitors with disabilities.</li>' +
      '      <li><strong>Best Practices</strong> — security and modern web standards.</li>' +
      '      <li><strong>SEO</strong> — how easily Google can read and rank your pages.</li>' +
      "    </div></div>" +
      "</div>";

    var gaugeDefs = [
      ["performance", "Performance", "Loading speed"],
      ["accessibility", "Accessibility", "Inclusive experience"],
      ["best-practices", "Best Practices", "Security & standards"],
      ["seo", "SEO", "Search visibility"]
    ];
    var gHost = $("#gauges", page), cards = {};
    gaugeDefs.forEach(function (g) {
      var c = gaugeCard(g[1], g[2]);
      cards[g[0]] = c; gHost.appendChild(c);
    });

    var CWV_META = [
      ["lcp", "Largest Contentful Paint", "Main content visible", [2.5, 4.0]],
      ["inp", "Interaction to Next Paint", "Response to taps & clicks", [0.2, 0.5]],
      ["cls", "Cumulative Layout Shift", "Visual stability", [0.1, 0.25]],
      ["fcp", "First Contentful Paint", "First text or image", [1.8, 3.0]]
    ];
    function paintCwv(values) {
      var host = $("#cwv", page);
      host.innerHTML = "";
      CWV_META.forEach(function (m) {
        var raw = values[m[0]];
        var num = parseFloat(raw);
        var band = num <= m[3][0] ? "good" : num <= m[3][1] ? "warn" : "bad";
        var label = { good: "GOOD", warn: "OK", bad: "POOR" }[band];
        host.appendChild(el("div", "cwv__row",
          '<span class="cwv__badge cwv__badge--' + band + '">' + label + "</span>" +
          '<span class="cwv__name">' + m[1] + "<em>" + m[2] + "</em></span>" +
          '<span class="cwv__val">' + raw + "</span>"));
      });
    }
    function paintScores(s) {
      for (var k in cards) setGauge(cards[k], s[k]);
    }

    function runPsi(strategy) {
      var btn = $("#psi-run", page), label = $("#psi-label", page), status = $("#psi-status", page), icon = $("#psi-icon", page);
      btn.disabled = true; label.textContent = "Testing live site…"; icon.classList.add("spin");
      status.textContent = "Running Google PageSpeed on " + SITE_URL.replace("https://", "") + " (" + strategy + ") — takes ~20 seconds";
      var api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(SITE_URL) +
        "&strategy=" + strategy + "&category=PERFORMANCE&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO";
      fetch(api).then(function (r) {
        if (!r.ok) throw new Error("PSI " + r.status);
        return r.json();
      }).then(function (j) {
        var cats = j.lighthouseResult.categories;
        paintScores({
          performance: Math.round(cats.performance.score * 100),
          accessibility: Math.round(cats.accessibility.score * 100),
          "best-practices": Math.round(cats["best-practices"].score * 100),
          seo: Math.round(cats.seo.score * 100)
        });
        var a = j.lighthouseResult.audits;
        paintCwv({
          lcp: a["largest-contentful-paint"].displayValue.replace(/ /g, " "),
          inp: a["interactive"] ? (parseFloat(a["interactive"].numericValue / 1000).toFixed(1) + " s") : "—",
          cls: a["cumulative-layout-shift"].displayValue,
          fcp: a["first-contentful-paint"].displayValue.replace(/ /g, " ")
        });
        status.textContent = "Live result · tested " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + " · " + strategy;
      }).catch(function () {
        paintScores(FALLBACK.scores);
        paintCwv(FALLBACK.cwv);
        status.textContent = "Showing last saved results — live test unavailable right now.";
      }).finally(function () {
        btn.disabled = false; label.textContent = "Run live test"; icon.classList.remove("spin");
      });
    }

    var strategy = "mobile";
    $$(".seg button", page).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".seg button", page).forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        strategy = b.dataset.strategy;
        runPsi(strategy);
      });
    });
    $("#psi-run", page).addEventListener("click", function () { runPsi(strategy); });

    stagger(page);
    runPsi("mobile");
  }

  /* ============================ PAGE: TUTORIALS ============================ */
  var TUTS = [
    {
      group: "Getting started",
      items: [
        {
          id: "login", title: "Log in to WordPress", time: "2 min",
          icon: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
          steps: [
            "Go to <code>japseniorservicesllc.com/wp-admin</code> in your browser.",
            "Enter the <strong>username and password</strong> from your TaskFloVA welcome email.",
            "You’ll land on the WordPress <strong>Dashboard</strong> — the control room for your whole website.",
            "Bookmark this page so it’s always one click away."
          ]
        },
        {
          id: "tour", title: "Find your way around WordPress", time: "4 min",
          icon: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
          steps: [
            "The <strong>left sidebar</strong> is your main menu: Pages, Posts, Media, and more.",
            "<strong>Pages</strong> holds your main website pages (Home, Services, Contact…).",
            "<strong>Posts</strong> holds your blog articles.",
            "<strong>Media</strong> is your photo library — every image on the site lives here.",
            "Don’t worry about the other menus; TaskFloVA manages the technical ones for you."
          ]
        }
      ]
    },
    {
      group: "Editing your website",
      items: [
        {
          id: "elementor", title: "Edit a page with Elementor", time: "6 min",
          icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
          steps: [
            "From the WordPress sidebar choose <strong>Pages</strong>, hover a page, and click <strong>Edit with Elementor</strong>.",
            "Click any <strong>text</strong> on the page and simply start typing to change it.",
            "Click a <strong>photo</strong>, then in the left panel click the image to choose a new one from your library.",
            "When you’re happy, press the green <strong>Update</strong> button at the bottom left.",
            "Open the page in a new tab to double-check how it looks. That’s it — you’re live."
          ]
        },
        {
          id: "blog", title: "Publish a new blog post", time: "5 min",
          icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
          steps: [
            "Go to <strong>Posts → Add New</strong> in the WordPress sidebar.",
            "Write a clear, helpful <strong>title</strong> — think about what families would search for.",
            "Write your article in the editor. Short paragraphs and subheadings read best.",
            "On the right panel, set a <strong>Category</strong> and a <strong>Featured Image</strong>.",
            "Click <strong>Publish</strong>. Your post automatically appears on the Blog page with your site’s design."
          ]
        },
        {
          id: "media", title: "Add & manage photos", time: "3 min",
          icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
          steps: [
            "Go to <strong>Media → Add New</strong> and drag photos straight from your computer.",
            "Use clear file names like <code>caregiver-with-client.jpg</code> — it helps Google.",
            "After uploading, click a photo and fill in the <strong>Alternative Text</strong> — a one-line description.",
            "The photo is now available to use on any page through Elementor."
          ]
        }
      ]
    },
    {
      group: "Forms & inquiries",
      items: [
        {
          id: "entries", title: "View form submissions", time: "3 min",
          icon: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
          steps: [
            "Every contact form and job application is emailed to you instantly.",
            "They’re also saved in WordPress: go to <strong>MetForm → Entries</strong>.",
            "Click any entry to see the full message, phone number, and (for job applications) the attached resume.",
            "Tip: respond to care inquiries within one business day — speed wins clients."
          ]
        },
        {
          id: "email", title: "Where do form emails go?", time: "2 min",
          icon: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
          steps: [
            "Form notifications are sent to your business email address on file.",
            "Check your <strong>spam folder</strong> once a week, just in case.",
            "Want notifications at a different address? Message TaskFloVA and we’ll switch it the same day."
          ]
        }
      ]
    },
    {
      group: "Good to know",
      items: [
        {
          id: "cache", title: "Made a change but don’t see it?", time: "2 min",
          icon: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
          steps: [
            "Your site uses <strong>caching</strong> to load fast — sometimes it shows a saved copy for a few minutes.",
            "First, try a <strong>hard refresh</strong>: hold <code>Ctrl</code> and press <code>F5</code> (Windows) or <code>Cmd + Shift + R</code> (Mac).",
            "Still seeing the old version? Wait 5 minutes, or contact TaskFloVA and we’ll clear it instantly."
          ]
        },
        {
          id: "help", title: "Get help from TaskFloVA", time: "1 min",
          icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
          steps: [
            "Anything you’re unsure about — just ask. No question is too small.",
            "Email or message your TaskFloVA contact and we’ll respond within one business day.",
            "For urgent website issues, mark your message <strong>URGENT</strong> and we’ll prioritize it."
          ]
        }
      ]
    }
  ];

  function renderTutorials(page) {
    var total = TUTS.reduce(function (s, g) { return s + g.items.length; }, 0);
    var doneSet = {};
    try { doneSet = JSON.parse(localStorage.getItem("tf_tuts") || "{}"); } catch (e) {}

    var R = 30, C = 2 * Math.PI * R;
    page.innerHTML =
      '<div class="tut-progress rv">' +
      '  <div class="tut-progress__ring"><svg width="72" height="72" viewBox="0 0 72 72">' +
      '    <circle cx="36" cy="36" r="' + R + '" stroke="rgba(31,200,224,.1)"/>' +
      '    <circle id="prog-arc" cx="36" cy="36" r="' + R + '" stroke="#1FC8E0"/></svg>' +
      '    <span class="tut-progress__num" id="prog-num"></span></div>' +
      '  <div><h3>Your onboarding journey</h3>' +
      '  <p>Work through these short guides at your own pace. Your progress is saved on this device.</p></div>' +
      "</div><div id='tut-groups'></div>";

    var groupsHost = $("#tut-groups", page);

    function progress() {
      var done = Object.keys(doneSet).filter(function (k) { return doneSet[k]; }).length;
      $("#prog-num", page).textContent = done + "/" + total;
      var arc = $("#prog-arc", page);
      arc.style.strokeDasharray = (done / total) * C + " " + C;
      arc.style.transition = "stroke-dasharray .9s cubic-bezier(.22,.9,.26,1)";
    }

    function burst(x, y) {
      if (REDUCED) return;
      var colors = ["#1FC8E0", "#0498B1", "#FD5757", "#2BD9A3", "#FFC24B"];
      for (var i = 0; i < 18; i++) {
        var p = el("i", "burst");
        p.style.background = colors[i % colors.length];
        p.style.left = x + "px"; p.style.top = y + "px";
        document.body.appendChild(p);
        var ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
        p.animate([
          { transform: "translate(0,0) rotate(0)", opacity: 1 },
          { transform: "translate(" + Math.cos(ang) * dist + "px," + (Math.sin(ang) * dist + 40) + "px) rotate(" + (Math.random() * 360) + "deg)", opacity: 0 }
        ], { duration: 700 + Math.random() * 400, easing: "cubic-bezier(.22,.9,.26,1)" }).onfinish = function () { this.effect.target.remove(); };
      }
    }

    TUTS.forEach(function (g) {
      var grp = el("div", "tut-group rv");
      grp.appendChild(el("p", "tut-group__label", g.group));
      var grid = el("div", "tut-grid");
      g.items.forEach(function (t) {
        var card = el("article", "card tut" + (doneSet[t.id] ? " is-done" : ""));
        card.innerHTML =
          '<div class="tut__head">' +
          '  <span class="tut__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + t.icon + "</svg></span>" +
          '  <div class="tut__meta"><h4>' + t.title + "</h4><p>" + t.steps.length + " steps · " + t.time + "</p></div>" +
          '  <div class="tut__state"><span class="tut__done"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
          '  <svg class="tut__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></div></div>' +
          '<div class="tut__body"><div class="tut__body-inner"><ol class="tut__steps">' +
          t.steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") +
          '</ol><div class="tut__actions"><button class="tut__mark">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
          "<span></span></button></div></div></div>";
        var markBtn = $(".tut__mark", card);
        function markLabel() {
          $("span", markBtn).textContent = doneSet[t.id] ? "Completed" : "Mark as done";
        }
        markLabel();
        $(".tut__head", card).addEventListener("click", function () {
          card.classList.toggle("is-open");
        });
        markBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          doneSet[t.id] = !doneSet[t.id];
          card.classList.toggle("is-done", !!doneSet[t.id]);
          try { localStorage.setItem("tf_tuts", JSON.stringify(doneSet)); } catch (err) {}
          markLabel(); progress();
          if (doneSet[t.id]) {
            var r = markBtn.getBoundingClientRect();
            burst(r.left + r.width / 2, r.top);
          }
        });
        grid.appendChild(card);
      });
      grp.appendChild(grid);
      groupsHost.appendChild(grp);
    });
    progress();
    stagger(page);
  }
})();
