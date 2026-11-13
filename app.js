// TourGuard AI front end. Data lives in /data/*.js (window.TG_*); SOS, queue and phrases work offline.
(function () {
  "use strict";
  var PAL = ["#ffd9a8", "#cfe8c8", "#cfe0f7", "#f6cfdc", "#e2d5f3", "#fbf0b8", "#c4e8e4"];
  var VIEW = window.TG_VIEW, STATES = window.TG_STATES, SECTIONS = window.TG_SECTIONS,
      PLACES = window.TG_PLACES, SOURCES = window.TG_SOURCES, REGIONS = window.TG_REGIONS,
      STYLES = window.TG_STYLES, PLANNING = window.TG_PLANNING;
  PLACES.forEach(function (p) { if (!p.st) p.st = "Rajasthan"; });
  var QUEUE_KEY = "tg.sosQueue", CONTACT_KEY = "tg.contact", HOLD_MS = 2000;

  var byId = {};
  PLACES.forEach(function (p) { byId[p.id] = p; });
  var secByKey = {};
  SECTIONS.forEach(function (s) { secByKey[s.key] = s; });
  var countByState = {};
  PLACES.forEach(function (p) { if (!p.hub) countByState[p.st] = (countByState[p.st] || 0) + 1; });

  var route = [];
  var selected = null;
  var selState = null;
  var mapMode = "india";
  var NS = "http://www.w3.org/2000/svg";

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function hasPin(p) { return typeof p.lat === "number" && typeof p.lng === "number"; }
  function timeText(p) { return p.mins ? " · about " + p.mins + " min" : ""; }

  // ---- Tabs
  function show(name) {
    $$("[data-screen]").forEach(function (s) { s.hidden = s.getAttribute("data-screen") !== name; });
    $$(".tab").forEach(function (t) { t.classList.toggle("on", t.getAttribute("data-tab") === name); });
    window.scrollTo(0, 0);
  }
  $$(".tab").forEach(function (t) {
    t.addEventListener("click", function () { show(t.getAttribute("data-tab")); });
  });

  // ---- Explore
  function renderSections() {
    var box = $("#sections");
    box.innerHTML = "";
    SECTIONS.forEach(function (sec) {
      var items = PLACES.filter(function (p) { return p.sec === sec.key; });
      if (!items.length) return;

      var wrap = document.createElement("div"); wrap.className = "section";
      var head = document.createElement("div"); head.className = "section-head";
      var h = document.createElement("h3"); h.textContent = sec.title;
      var b = document.createElement("span"); b.className = "blurb"; b.textContent = sec.blurb;
      head.append(h, b);

      var row = document.createElement("div"); row.className = "row";
      items.forEach(function (p) {
        var card = document.createElement("article"); card.className = "pcard theme-" + sec.key;
        var art = document.createElement("div"); art.className = "art";
        var tag = document.createElement("span"); tag.textContent = sec.title;
        art.append(tag);
        var body = document.createElement("div"); body.className = "pbody";
        var t = document.createElement("h4"); t.textContent = p.name;
        var d = document.createElement("div"); d.className = "desc"; d.textContent = p.desc;
        var m = document.createElement("div"); m.className = "meta";
        m.textContent = p.st + " · " + (hasPin(p) ? "On map" : "Not on map yet") + timeText(p);
        var acts = document.createElement("div"); acts.className = "acts";
        var inRoute = route.indexOf(p.id) !== -1;
        var add = document.createElement("button"); add.type = "button";
        add.className = "btn " + (inRoute ? "done" : "route");
        add.textContent = inRoute ? "In route ✓" : "Add to route";
        add.disabled = !hasPin(p);
        add.addEventListener("click", function () { addOrRemove(p.id); renderSections(); });
        var info = document.createElement("button"); info.type = "button"; info.className = "btn ghost"; info.textContent = "Details";
        info.addEventListener("click", function () { showGuide(p.id); show("guide"); });
        acts.append(add, info);
        body.append(t, d, m, acts);
        card.append(art, body);
        row.append(card);
      });

      wrap.append(head, row);
      box.append(wrap);
    });

    var sl = $("#sourceList");
    sl.innerHTML = "";
    var title = document.createElement("div"); title.style.fontWeight = "700"; title.textContent = "Sources";
    sl.append(title);
    Object.keys(SOURCES).forEach(function (k) {
      var a = document.createElement("a"); a.href = SOURCES[k].url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = SOURCES[k].title;
      var line = document.createElement("div"); line.append(a);
      sl.append(line);
    });
  }

  // ---- Map projections
  function projIndia(p) { return [ (p.lng - VIEW.minLng) * VIEW.kx + VIEW.pad, (VIEW.maxLat - p.lat) * VIEW.ky + VIEW.pad ]; }
  function projJaipur(p) { return [ (p.lng - 75.78) / 0.12 * 560 + 20, (27.02 - p.lat) / 0.14 * 380 + 20 ]; }
  function inJaipur(p) { return hasPin(p) && p.lat >= 26.88 && p.lat <= 27.02 && p.lng >= 75.78 && p.lng <= 75.90; }
  function f1(n) { return n.toFixed(1); }

  // ---- India political map: states, labels, count badges
  var mapIndia = $("#mapIndia");
  mapIndia.setAttribute("viewBox", "0 0 " + VIEW.w + " " + VIEW.h);
  var statesG = $("#statesG");
  var statePaths = {};
  STATES.forEach(function (s) {
    var path = el("path", { d: s.d, "class": "state", "data-state": s.n, fill: PAL[s.c % PAL.length],
                            tabindex: "0", role: "button", "aria-label": s.n });
    path.addEventListener("click", function () { selectState(s.n); });
    path.addEventListener("keydown", function (e) { if (e.key === "Enter") selectState(s.n); });
    statesG.appendChild(path);
    statePaths[s.n] = path;
  });

  var SHORT = { "Jammu and Kashmir": "J&K", "Andaman and Nicobar Islands": "", "Dadra and Nagar Haveli and Daman and Diu": "",
                "Lakshadweep": "", "Puducherry": "", "Chandigarh": "", "Delhi": "", "Goa": "", "Sikkim": "" };
  var labelsG = $("#labelsG");
  var hasLabel = {};
  var NUDGE = { "Goa": [-9, 1], "Delhi": [9, 2], "Meghalaya": [-1, 8], "Kerala": [-3, 0], "Puducherry": [8, 2] };
  STATES.forEach(function (s) {
    var txt = SHORT.hasOwnProperty(s.n) ? SHORT[s.n] : s.n;
    var lines = 0;
    if (txt && s.a >= 420) {
      var words = txt.length > 11 && txt.indexOf(" ") > 0 ? [txt.slice(0, txt.lastIndexOf(" ")), txt.slice(txt.lastIndexOf(" ") + 1)] : [txt];
      lines = words.length;
      hasLabel[s.n] = true;
      var shift = countByState[s.n] ? (lines > 1 ? 12 : 8) : 0; // leave room for the count badge above the name
      var t = el("text", { "class": "slabel", x: f1(s.x), y: f1(s.y + shift - (lines - 1) * 4) });
      words.forEach(function (w, i) {
        var ts = el("tspan", { x: f1(s.x), dy: i === 0 ? "0" : "8" });
        ts.textContent = w;
        t.appendChild(ts);
      });
      labelsG.appendChild(t);
    }
  });

  var badgesG = $("#badgesG");
  var badgeEls = {};
  STATES.forEach(function (s) {
    var c = countByState[s.n];
    if (!c) return;
    var nd = NUDGE[s.n] || [0, 0];
    var cx = s.x + nd[0], cy = s.y + nd[1] - (hasLabel[s.n] ? 4 : 0);
    var g = el("g", { "class": "badge", "data-state": s.n, tabindex: "0", role: "button",
                      "aria-label": s.n + ", " + c + " places" });
    g.appendChild(el("circle", { cx: f1(cx), cy: f1(cy), r: 7 }));
    var t = el("text", { x: f1(cx), y: f1(cy) });
    t.textContent = String(c);
    g.appendChild(t);
    g.addEventListener("click", function () { selectState(s.n); });
    g.addEventListener("keydown", function (e) { if (e.key === "Enter") selectState(s.n); });
    badgesG.appendChild(g);
    badgeEls[s.n] = g;
  });

  // ---- Jaipur close-up pins
  var pinsJ = $("#pinsJaipur");
  // Spread out places that sit almost on top of each other and keep a thin line to the true spot.
  var jlist = PLACES.filter(inJaipur);
  var jtrue = {}, jpos = {};
  jlist.forEach(function (p, i) {
    var t = projJaipur(p);
    jtrue[p.id] = t;
    jpos[p.id] = [t[0] + Math.cos(i * 2.4) * 0.5, t[1] + Math.sin(i * 2.4) * 0.5];
  });
  for (var it = 0; it < 150; it++) {
    for (var a = 0; a < jlist.length; a++) {
      for (var b = a + 1; b < jlist.length; b++) {
        var A = jpos[jlist[a].id], B = jpos[jlist[b].id];
        var dx = B[0] - A[0], dy = B[1] - A[1], d = Math.sqrt(dx * dx + dy * dy) || 0.01, MIN = 30;
        if (d < MIN) { var k = (MIN - d) / 2 / d; A[0] -= dx * k; A[1] -= dy * k; B[0] += dx * k; B[1] += dy * k; }
      }
    }
  }
  jlist.forEach(function (p) {
    var q = jpos[p.id];
    q[0] = Math.max(24, Math.min(576, q[0]));
    q[1] = Math.max(44, Math.min(396, q[1]));
    var t = jtrue[p.id];
    if (Math.abs(q[0] - t[0]) + Math.abs(q[1] - t[1]) > 5) {
      pinsJ.appendChild(el("line", { "class": "leader", x1: f1(t[0]), y1: f1(t[1]), x2: f1(q[0]), y2: f1(q[1]) }));
      pinsJ.appendChild(el("circle", { "class": "truedot", cx: f1(t[0]), cy: f1(t[1]), r: 2.5 }));
    }
  });
  var placedLabels = [];
  function labelFree(x, y, name) {
    var w = name.length * 5.8 + 6, r = { x1: x - w / 2, x2: x + w / 2, y1: y - 30, y2: y - 14 };
    for (var i = 0; i < placedLabels.length; i++) {
      var q = placedLabels[i];
      if (r.x1 < q.x2 && r.x2 > q.x1 && r.y1 < q.y2 && r.y2 > q.y1) return false;
    }
    placedLabels.push(r);
    return true;
  }
  jlist.forEach(function (p) {
    var pt = jpos[p.id];
    var showLabel = labelFree(pt[0], pt[1], p.name);
    var g = el("g", { "class": "pin c-" + p.sec + (showLabel ? "" : " nolabel"), "data-id": p.id, tabindex: "0", role: "button", "aria-label": p.name });
    g.appendChild(el("circle", { cx: f1(pt[0]), cy: f1(pt[1]), r: 12 }));
    g.appendChild(el("text", { "class": "n", x: f1(pt[0]), y: f1(pt[1]) }));
    var l = el("text", { "class": "l", x: f1(pt[0]), y: f1(pt[1] - 18) });
    l.textContent = p.name;
    g.appendChild(l);
    g.addEventListener("click", function () { selectPlace(p.id); });
    g.addEventListener("keydown", function (e) { if (e.key === "Enter") selectPlace(p.id); });
    pinsJ.appendChild(g);
  });

  // ---- Legend (Jaipur view only)
  (function buildLegend() {
    var box = $("#legend");
    SECTIONS.forEach(function (s) {
      var span = document.createElement("span");
      var i = document.createElement("i"); i.style.borderColor = s.color;
      span.append(i, document.createTextNode(s.title));
      box.append(span);
    });
  })();

  // ---- Map view switch
  function setMode(mode) {
    mapMode = mode;
    $$(".segbtn").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === mode)); });
    // SVG elements have no .hidden property, so toggle the attribute instead.
    $("#mapIndia").toggleAttribute("hidden", mode !== "india");
    $("#mapJaipur").toggleAttribute("hidden", mode !== "jaipur");
    $("#legend").hidden = mode !== "jaipur";
    $("#stateCard").hidden = mode !== "india" || !selState;
    $("#mapNote").textContent = mode === "india"
      ? "Tap a state to see its places. The number on a state is how many places we have listed there."
      : "Jaipur close-up. Stylised and not to scale. Only places inside the city are shown here.";
    renderMap();
  }
  $$(".segbtn").forEach(function (btn) {
    btn.addEventListener("click", function () { setMode(btn.getAttribute("data-mode")); });
  });

  // ---- State selection and card
  function selectState(name) {
    selState = name;
    $$("#statesG .state").forEach(function (p) { p.classList.toggle("sel", p.getAttribute("data-state") === name); });
    if (statePaths[name]) statesG.appendChild(statePaths[name]); // draw selected outline on top
    renderStateCard();
  }

  function placeRow(p, label) {
    var row = document.createElement("div"); row.className = "sc-row";
    var info = document.createElement("div");
    var n = document.createElement("div"); n.className = "sc-name"; n.textContent = p.name;
    var d = document.createElement("div"); d.className = "sc-desc"; d.textContent = p.desc;
    info.append(n, d);
    var acts = document.createElement("div"); acts.className = "sc-acts";
    var inRoute = route.indexOf(p.id) !== -1;
    var add = document.createElement("button"); add.type = "button";
    add.className = "btn " + (inRoute ? "done" : "route");
    add.textContent = inRoute ? "✓" : "+ Route";
    add.setAttribute("aria-label", (inRoute ? "Remove " : "Add ") + p.name + (inRoute ? " from route" : " to route"));
    add.disabled = !hasPin(p);
    add.addEventListener("click", function () { addOrRemove(p.id); renderSections(); });
    var det = document.createElement("button"); det.type = "button"; det.className = "btn ghost"; det.textContent = "Details";
    det.addEventListener("click", function () { showGuide(p.id); show("guide"); });
    acts.append(add, det);
    row.append(info, acts);
    return row;
  }

  function renderStateCard() {
    var card = $("#stateCard");
    if (!selState || mapMode !== "india") { card.hidden = true; return; }
    card.hidden = false;
    card.innerHTML = "";
    var items = PLACES.filter(function (p) { return p.st === selState && !p.hub; });
    var base = PLACES.filter(function (p) { return p.st === selState && p.hub; })[0];
    var reg = REGIONS[selState];

    var head = document.createElement("div"); head.className = "sc-head";
    var h = document.createElement("h3"); h.textContent = selState;
    var c = document.createElement("span"); c.className = "sc-count";
    c.textContent = items.length ? items.length + (items.length === 1 ? " place" : " places") : "Guide only";
    head.append(h, c);
    card.append(head);

    if (reg) {
      var g = document.createElement("div"); g.className = "sc-guide";
      var best = document.createElement("div"); best.className = "best"; best.textContent = "Best time: " + reg.best;
      var hl = document.createElement("div"); hl.className = "hl"; hl.textContent = "Highlights: " + reg.highlights.join(", ") + ".";
      g.append(best, hl);
      if (reg.tip) { var tip = document.createElement("div"); tip.className = "tip"; tip.textContent = reg.tip; g.append(tip); }
      var tags = document.createElement("div"); tags.className = "tags";
      (reg.styles || []).forEach(function (k) {
        var s = STYLES.filter(function (x) { return x.key === k; })[0];
        if (s) { var t = document.createElement("span"); t.className = "tag"; t.textContent = s.label; tags.append(t); }
      });
      g.append(tags);
      card.append(g);
    }

    if (selState === "Rajasthan" && items.some(inJaipur)) {
      var zoom = document.createElement("button"); zoom.type = "button"; zoom.className = "btn route";
      zoom.textContent = "Open Jaipur close-up";
      zoom.addEventListener("click", function () { setMode("jaipur"); });
      card.append(zoom);
    }

    SECTIONS.forEach(function (sec) {
      var inSec = items.filter(function (p) { return p.sec === sec.key; });
      if (!inSec.length) return;
      var st = document.createElement("div"); st.className = "sc-sec";
      var sw = document.createElement("i"); sw.style.background = sec.color;
      st.append(sw, document.createTextNode(sec.title));
      card.append(st);
      inSec.forEach(function (p) { card.append(placeRow(p)); });
    });

    if (!items.length) {
      var p0 = document.createElement("p"); p0.className = "muted";
      p0.textContent = "No researched places for " + selState + " yet; the highlights above come from the starter guide." +
        (base ? " You can still add its base city to a route." : "");
      card.append(p0);
    }
    if (base) {
      var bs = document.createElement("div"); bs.className = "sc-sec";
      var bi = document.createElement("i"); bi.style.background = "#4a5d70";
      bs.append(bi, document.createTextNode("Base city for routes"));
      card.append(bs, placeRow(base));
    }
  }

  function selectPlace(id) { selected = id; renderMap(); }

  function addOrRemove(id) {
    if (!hasPin(byId[id])) return;
    var i = route.indexOf(id);
    if (i === -1) route.push(id); else route.splice(i, 1);
    renderMap();
  }

  function haversineKm(a, b) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function renderMap() {
    // Jaipur pins
    $$("#pinsJaipur .pin").forEach(function (g) {
      var id = g.getAttribute("data-id");
      var i = route.indexOf(id);
      g.classList.toggle("in", i !== -1);
      g.classList.toggle("sel", selected === id);
      g.querySelector("text.n").textContent = i === -1 ? "" : String(i + 1);
      if (selected === id) pinsJ.appendChild(g);
    });
    // India: numbered stops for the route only
    var pi = $("#pinsIndia");
    pi.innerHTML = "";
    route.forEach(function (id, idx) {
      var pt = projIndia(byId[id]);
      var g = el("g", { "class": "rpin" });
      g.appendChild(el("circle", { cx: f1(pt[0]), cy: f1(pt[1]), r: 6.5 }));
      var t = el("text", { x: f1(pt[0]), y: f1(pt[1]) });
      t.textContent = String(idx + 1);
      g.appendChild(t);
      pi.appendChild(g);
    });
    $("#rlIndia").setAttribute("points", route.map(function (id) { return projIndia(byId[id]).map(f1).join(","); }).join(" "));
    $("#rlJaipur").setAttribute("points", route.filter(function (id) { return inJaipur(byId[id]); })
      .map(function (id) { return jpos[id].map(f1).join(","); }).join(" "));

    var km = 0;
    for (var i = 1; i < route.length; i++) km += haversineKm(byId[route[i - 1]], byId[route[i]]);
    $("#statStops").textContent = String(route.length);
    $("#statKm").textContent = Math.round(km) + " km";
    if (km <= 30) {
      $("#statMin").textContent = Math.round(km / 4.5 * 60) + " min";
      $("#statMinLbl").textContent = "walking, about 4.5 km/h";
    } else {
      $("#statMin").textContent = "—";
      $("#statMinLbl").textContent = "too far to walk";
    }

    var list = $("#stepList");
    list.innerHTML = "";
    if (!route.length) {
      var li = document.createElement("li"); li.className = "muted";
      li.textContent = "Add places with “+ Route” to build a route. Stops are joined in the order you add them.";
      list.append(li);
    }
    route.forEach(function (id, idx) {
      var li = document.createElement("li");
      var d = document.createElement("span"); d.className = "dot"; d.textContent = String(idx + 1);
      var t = document.createElement("span"); t.textContent = byId[id].name + " · " + byId[id].st;
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "btn ghost";
      rm.style.marginLeft = "auto"; rm.textContent = "Remove";
      rm.addEventListener("click", function () { addOrRemove(id); renderSections(); });
      li.append(d, t, rm);
      list.append(li);
    });

    renderStateCard();

    // Selected-place card (Jaipur view)
    var card = $("#selCard");
    if (!selected || mapMode !== "jaipur") { card.hidden = true; return; }
    var p = byId[selected];
    card.hidden = false;
    card.innerHTML = "";
    var h = document.createElement("h3"); h.textContent = p.name;
    var m = document.createElement("p"); m.className = "muted";
    m.textContent = secByKey[p.sec].title + " · " + p.desc + timeText(p);
    var row = document.createElement("div"); row.style.display = "flex"; row.style.gap = "8px"; row.style.flexWrap = "wrap";
    var inRoute = route.indexOf(p.id) !== -1;
    var add = document.createElement("button"); add.type = "button";
    add.className = "btn " + (inRoute ? "ghost" : "route");
    add.textContent = inRoute ? "Remove from route" : "Add to route";
    add.addEventListener("click", function () { addOrRemove(p.id); renderSections(); });
    var guide = document.createElement("button"); guide.type = "button"; guide.className = "btn ghost"; guide.textContent = "Details";
    guide.addEventListener("click", function () { showGuide(p.id); show("guide"); });
    row.append(add, guide);
    card.append(h, m, row);
  }

  $("#clearRoute").addEventListener("click", function () { route = []; renderMap(); renderSections(); });

  // ---- Explore: travel styles and state cards, planning tips
  var styleSel = "all";
  function renderStyles() {
    var chips = $("#styleChips");
    chips.innerHTML = "";
    [{ key: "all", label: "All styles" }].concat(STYLES).forEach(function (s) {
      var b = document.createElement("button"); b.type = "button"; b.className = "chip";
      b.setAttribute("aria-pressed", String(styleSel === s.key)); b.textContent = s.label;
      b.addEventListener("click", function () { styleSel = s.key; renderStyles(); });
      chips.append(b);
    });
    var row = $("#stateRow");
    row.innerHTML = "";
    Object.keys(REGIONS).forEach(function (name) {
      var r = REGIONS[name];
      if (styleSel !== "all" && (r.styles || []).indexOf(styleSel) === -1) return;
      var card = document.createElement("article"); card.className = "pcard theme-state";
      var art = document.createElement("div"); art.className = "art";
      var tag = document.createElement("span"); tag.textContent = "Best " + r.best;
      art.append(tag);
      var body = document.createElement("div"); body.className = "pbody";
      var t = document.createElement("h4"); t.textContent = name;
      var d = document.createElement("div"); d.className = "desc";
      d.textContent = r.highlights.slice(0, 4).join(", ") + (r.highlights.length > 4 ? " and more" : "");
      var acts = document.createElement("div"); acts.className = "acts";
      var go = document.createElement("button"); go.type = "button"; go.className = "btn route"; go.textContent = "See on map";
      go.addEventListener("click", function () { show("map"); setMode("india"); selectState(name); });
      acts.append(go);
      body.append(t, d, acts);
      card.append(art, body);
      row.append(card);
    });
    if (!row.children.length) {
      var e = document.createElement("p"); e.className = "muted"; e.textContent = "No states match.";
      row.append(e);
    }
  }
  function renderIntro() {
    $("#guideIntro").textContent = window.TG_GUIDE_INTRO || "";
    var box = $("#planTips");
    PLANNING.forEach(function (it, i) {
      var d = document.createElement("div"); d.className = "item";
      var b = document.createElement("b"); b.textContent = (i + 1) + ". " + it.t;
      var s = document.createElement("span"); s.textContent = it.x;
      d.append(b, s);
      box.append(d);
    });
  }

  // ---- Guide: place notes (offline) and AI tools
  function showGuide(id) {
    var p = byId[id];
    if (!p) return;
    setSub("notes");
    $("#guideSelect").value = id;
    var out = $("#notesOut");
    out.innerHTML = "";
    var strong = document.createElement("strong"); strong.textContent = p.name;
    var src = document.createElement("span"); src.className = "src";
    src.textContent = p.st + " · " + p.desc + timeText(p) + (SOURCES[p.src] ? " · Source: " + SOURCES[p.src].title : "");
    out.append(strong, document.createTextNode("\n\n" + p.note), src);
  }
  function buildSelect() {
    var sel = $("#guideSelect");
    var byState = {};
    PLACES.forEach(function (p) { (byState[p.st] = byState[p.st] || []).push(p); });
    Object.keys(byState).sort().forEach(function (st) {
      var g = document.createElement("optgroup"); g.label = st;
      byState[st].forEach(function (p) {
        var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; g.append(o);
      });
      sel.append(g);
    });
    sel.addEventListener("change", function () { showGuide(sel.value); });
  }
  function setSub(name) {
    $$("#guideTabs .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-sub") === name)); });
    $$("[data-sub]").forEach(function (s) {
      if (s.classList.contains("chip")) return;
      s.hidden = s.getAttribute("data-sub") !== name;
    });
  }
  $$("#guideTabs .chip").forEach(function (c) {
    c.addEventListener("click", function () { setSub(c.getAttribute("data-sub")); });
  });

  // ---- Online status
  function renderStatus() {
    var el = $("#status");
    if (navigator.onLine) { el.textContent = "Online"; el.className = "pill ok"; }
    else { el.textContent = "Offline mode"; el.className = "pill warn"; }
  }
  window.addEventListener("online", function () { renderStatus(); flushQueue(); });
  window.addEventListener("offline", renderStatus);
  renderStatus();
  if (navigator.onLine) {
    fetch("/api/health").then(function (r) { return r.json(); }).then(function (d) {
      if (d.demoMode) $("#banner").hidden = false;
    }).catch(function () {});
  }

  // ---- Phrases (offline)
  function renderPhrases(q) {
    var box = $("#phraseList");
    box.innerHTML = "";
    var raw = (q || "").trim(), s = raw.toLowerCase();
    window.PHRASES.filter(function (p) {
      return !s || p.en.toLowerCase().indexOf(s) !== -1 || p.ro.toLowerCase().indexOf(s) !== -1 || p.hi.indexOf(raw) !== -1;
    }).forEach(function (p) {
      var card = document.createElement("div"); card.className = "phrase";
      var hi = document.createElement("div"); hi.className = "hi"; hi.textContent = p.hi;
      var en = document.createElement("div"); en.className = "en"; en.textContent = p.en;
      var ro = document.createElement("div"); ro.className = "ro"; ro.textContent = p.ro;
      card.append(en, hi, ro);
      box.append(card);
    });
  }
  $("#phraseSearch").addEventListener("input", function (e) { renderPhrases(e.target.value); });
  renderPhrases("");

  // ---- SOS: press and hold, local queue, sync
  var hold = $("#hold"), holdTimer = null;
  function startHold(e) {
    e.preventDefault();
    hold.classList.add("holding");
    $("#sosMsg").textContent = "Keep holding to send…";
    holdTimer = setTimeout(function () {
      hold.classList.remove("holding");
      holdTimer = null;
      triggerSos();
    }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer); holdTimer = null;
      $("#sosMsg").textContent = "Hold cancelled. Press and hold for 2 seconds to send.";
    }
    hold.classList.remove("holding");
  }
  hold.addEventListener("pointerdown", startHold);
  ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { hold.addEventListener(ev, cancelHold); });
  hold.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  function getLocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }); },
        function () { resolve(null); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }
  function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; } }
  function saveQueue(q) {
    var queued = q.filter(function (r) { return r.status === "queued"; });
    var sent = q.filter(function (r) { return r.status === "sent"; }).slice(-20);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queued.concat(sent))); } catch (e) {}
  }
  function loadContact() { try { return JSON.parse(localStorage.getItem(CONTACT_KEY)) || null; } catch (e) { return null; } }

  async function triggerSos() {
    $("#sosMsg").textContent = "Getting your location…";
    var location = await getLocation();
    var report = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2),
      createdAt: new Date().toISOString(),
      location: location,
      note: $("#sosNote").value.trim(),
      contact: loadContact(),
      status: "queued"
    };
    var queue = loadQueue();
    queue.push(report);
    saveQueue(queue);
    renderQueue();
    var tail = " Call 112, 100 (police) or 108 (ambulance) if you can.";
    if (navigator.onLine) {
      $("#sosMsg").textContent = location ? "SOS saved and sending. Your location is attached."
        : "SOS saved and sending. Location unavailable, so the report has no map position.";
    } else {
      $("#sosMsg").textContent = (location ? "Saved on this phone with your location. It will send when you're online."
        : "Saved on this phone, but location is unavailable. It will send when you're online.") + tail;
    }
    flushQueue();
  }

  var flushing = false;
  async function flushQueue() {
    if (flushing) return;
    if (!navigator.onLine) return renderQueue();
    flushing = true;
    try {
      var queue = loadQueue();
      for (var i = 0; i < queue.length; i++) {
        var r = queue[i];
        if (r.status !== "queued") continue;
        try {
          var res = await fetch("/api/sos", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id, createdAt: r.createdAt, location: r.location, note: r.note, contact: r.contact })
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          r.status = "sent";
        } catch (e) { break; }
      }
      saveQueue(queue);
    } finally { flushing = false; renderQueue(); }
  }
  $("#sendNow").addEventListener("click", flushQueue);

  function renderQueue() {
    var list = $("#queue");
    var queue = loadQueue().slice().reverse();
    list.innerHTML = "";
    if (!queue.length) {
      var e = document.createElement("li"); e.innerHTML = '<span class="empty">No SOS reports yet.</span>';
      list.append(e);
      return;
    }
    queue.forEach(function (r) {
      var li = document.createElement("li");
      var left = document.createElement("div");
      var title = document.createElement("div"); title.textContent = "SOS · " + new Date(r.createdAt).toLocaleString();
      var sub = document.createElement("div"); sub.className = "when";
      sub.textContent = (r.location ? "with location" : "no location") + (r.note ? " · " + r.note : "");
      left.append(title, sub);
      var badge = document.createElement("span"); badge.className = "pbadge " + r.status;
      badge.textContent = r.status === "sent" ? "Sent" : "Waiting for signal";
      li.append(left, badge);
      list.append(li);
    });
  }

  (function initContact() {
    var c = loadContact();
    if (c) { $("#cName").value = c.name || ""; $("#cPhone").value = c.phone || ""; }
  })();
  $("#contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#cName").value.trim(), phone = $("#cPhone").value.trim();
    if (!phone) { $("#contactMsg").textContent = "Enter a phone number."; return; }
    try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ name: name, phone: phone })); } catch (er) {}
    $("#contactMsg").textContent = "Saved on this phone.";
  });

  // ---- Online AI features
  async function api(url, body) {
    if (!navigator.onLine) throw new Error("You're offline. This needs internet. SOS, the map and the phrasebook still work.");
    var res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  }
  function showOut(el, text, isError) { el.className = isError ? "output error" : "output"; el.textContent = text; }
  async function run(btn, outEl, fn) {
    btn.disabled = true; showOut(outEl, "Thinking…");
    try { await fn(); } catch (e) { showOut(outEl, e.message, true); } finally { btn.disabled = false; }
  }
  $("#guideBtn").addEventListener("click", function () {
    var place = $("#place").value.trim(), city = $("#city").value.trim();
    if (!place) return showOut($("#guideOut"), "Enter a place name.", true);
    $("#guideMeta").textContent = "";
    run($("#guideBtn"), $("#guideOut"), async function () {
      var data = await api("/api/guide", { place: place, city: city });
      showOut($("#guideOut"), data.guide);
      if (data.place) {
        var p = data.place;
        $("#guideMeta").textContent = [p.name, p.address, p.rating ? "Rating " + p.rating : null].filter(Boolean).join(" · ");
      }
    });
  });
  $("#planBtn").addEventListener("click", function () {
    var city = $("#pCity").value.trim();
    if (!city) return showOut($("#itineraryOut"), "Enter a city.", true);
    run($("#planBtn"), $("#itineraryOut"), async function () {
      var data = await api("/api/itinerary", {
        city: city, days: Number($("#days").value) || 2,
        interests: $("#interests").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        budget: $("#budget").value
      });
      showOut($("#itineraryOut"), data.itinerary);
    });
  });
  $("#askBtn").addEventListener("click", function () {
    var question = $("#question").value.trim();
    if (!question) return showOut($("#askOut"), "Type a question.", true);
    run($("#askBtn"), $("#askOut"), async function () {
      var data = await api("/api/chat", { question: question });
      showOut($("#askOut"), data.answer);
    });
  });

  // ---- Start
  buildSelect();
  renderIntro();
  renderStyles();
  renderSections();
  renderQueue();
  setMode("india");
  selectState("Rajasthan");
  showGuide("hawa");
  flushQueue();
})();
