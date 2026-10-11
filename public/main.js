/* Homepage interactions. Menu and account state mirror SiteHeader.tsx; both
   load /site.css so the header behaves identically across the whole site. */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------------------------------------------------- shared mobile menu */
  var button = document.getElementById("site-menu-button");
  var menu = document.getElementById("site-menu");
  var previousOverflow = "";
  function opened() { return button && button.getAttribute("aria-expanded") === "true"; }
  function setMenu(open, restoreFocus) {
    if (!button || !menu || opened() === open) return;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.hidden = !open;
    if (open) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(function () { var first = menu.querySelector("a"); if (first) first.focus(); });
    } else {
      document.body.style.overflow = previousOverflow;
      if (restoreFocus !== false) button.focus();
    }
  }
  if (button && menu) {
    button.addEventListener("click", function () { setMenu(!opened()); });
    menu.addEventListener("click", function (e) { if (e.target === menu) setMenu(false); });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false, false); }); });
    document.addEventListener("keydown", function (e) {
      if (!opened()) return;
      if (e.key === "Escape") { e.preventDefault(); setMenu(false); }
      if (e.key === "Tab") {
        var items = [button].concat(Array.prototype.slice.call(menu.querySelectorAll("a")));
        var index = items.indexOf(document.activeElement);
        if (e.shiftKey && index <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
        else if (!e.shiftKey && (index === items.length - 1 || index < 0)) { e.preventDefault(); items[0].focus(); }
      }
    });
    window.matchMedia("(min-width:1041px)").addEventListener("change", function (e) { if (e.matches) setMenu(false, false); });
  }

  function syncAccount() {
    var token = null;
    try { token = localStorage.getItem("token"); } catch (_) { /* storage unavailable */ }
    var signedIn = Boolean(token);
    Array.prototype.forEach.call(document.querySelectorAll(".site-account,.site-menu__account"), function (a) {
      a.textContent = signedIn ? "Account" : "Sign in";
      a.setAttribute("href", signedIn ? "/profile" : "/auth");
    });
  }
  syncAccount();
  window.addEventListener("storage", syncAccount);

  /* ---------------------------------------------------- theme synchronization */
  function syncTheme() {
    var theme = "dark";
    try {
      theme = localStorage.getItem("safepath-theme") === "light" ? "light" : "dark";
    } catch (_) {}
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
      toggle.setAttribute("title", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    }
    var mobileIndicator = document.querySelector("#site-menu-theme .theme-indicator");
    if (mobileIndicator) {
      mobileIndicator.textContent = theme === "light" ? "Light" : "Dark";
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    var next = current === "light" ? "dark" : "light";
    try {
      localStorage.setItem("safepath-theme", next);
    } catch (_) {}
    syncTheme();
    window.dispatchEvent(new CustomEvent("safepath-theme-change", { detail: next }));
  }

  var themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }
  var mobileThemeBtn = document.getElementById("site-menu-theme");
  if (mobileThemeBtn) {
    mobileThemeBtn.addEventListener("click", function() {
      toggleTheme();
      setMenu(false, false);
    });
  }

  syncTheme();
  window.addEventListener("storage", syncTheme);
  window.addEventListener("safepath-theme-change", syncTheme);

  /* ------------------------------------------------------ background video */
  var video = document.querySelector(".bg-video");
  if (video) {
    var videoMotion = function () { if (reduced.matches) video.pause(); else video.play().catch(function () {}); };
    videoMotion();
    reduced.addEventListener("change", videoMotion);
  }

  /* -------------------------------------------------- live search drawing */
  var canvas = document.getElementById("plan-canvas");
  var consoleEl = document.getElementById("console-log");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var COLS = 34, ROWS = 22;
  var walls = {}, exploredOrder = [], path = [];
  var person = { x: 17, y: 3 }, exits = [{ x: 0, y: 10 }, { x: COLS - 1, y: 10 }];

  function put(x, y) { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) walls[x + "," + y] = 1; }
  function buildPlan() {
    for (var x = 0; x < COLS; x++) { put(x, 0); put(x, ROWS - 1); }
    for (var y = 0; y < ROWS; y++) { if (y !== 10) { put(0, y); put(COLS - 1, y); } }
    for (var y2 = 1; y2 <= 5; y2++) { put(11, y2); put(22, y2); }
    for (var y3 = 16; y3 <= ROWS - 2; y3++) { put(11, y3); put(22, y3); }
    for (var x2 = 1; x2 < COLS - 1; x2++) if (x2 !== 5 && x2 !== 16 && x2 !== 27) { put(x2, 6); put(x2, 15); }
  }
  function search() {
    var key = function (p) { return p.x + "," + p.y; };
    var seen = {}, came = {}, queue = [person];
    seen[key(person)] = 1; exploredOrder = [person]; path = [];
    while (queue.length) {
      var cur = queue.shift(), found = false;
      for (var e = 0; e < exits.length; e++) if (exits[e].x === cur.x && exits[e].y === cur.y) { found = true; break; }
      if (found) {
        var p = cur;
        while (p) { path.push(p); p = came[key(p)]; }
        path.reverse();
        break;
      }
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var n = { x: cur.x + dirs[d][0], y: cur.y + dirs[d][1] }, k = key(n);
        if (n.x < 0 || n.y < 0 || n.x >= COLS || n.y >= ROWS || walls[k] || seen[k]) continue;
        seen[k] = 1; came[k] = cur; exploredOrder.push(n); queue.push(n);
      }
    }
  }
  buildPlan(); search();

  var start = 0, lastT = 0, statusEl = document.getElementById("plan-status"), lastStatus = "";
  function setStatus(text) {
    if (!statusEl || text === lastStatus) return;
    lastStatus = text; statusEl.textContent = text;
  }
  
  function addConsoleLine(text, typeClass) {
    if (!consoleEl) return;
    var div = document.createElement("div");
    div.className = "terminal-row " + (typeClass || "sys");
    div.textContent = text;
    consoleEl.appendChild(div);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    
    // limit lines
    while (consoleEl.children.length > 25) {
      consoleEl.removeChild(consoleEl.firstChild);
    }
  }

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function rounded(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  var loggedState = "";
  function draw(t) {
    lastT = t;
    if (t < 420) {
      setStatus("Grid 34 × 22 · walls and rooms");
      if (loggedState !== "grid") {
        loggedState = "grid";
        if (consoleEl) consoleEl.innerHTML = "";
        addConsoleLine("[SYS] Initializing SafePath A* routing engine...", "sys");
        addConsoleLine("[SYS] Blueprints loaded. Width: 34, Height: 22.", "sys");
        addConsoleLine("[SYS] Grid graph vertices: 748, edges: 1496.", "sys");
        addConsoleLine("[MAP] Standing at start coordinate (17, 3).", "sys");
      }
    } else if (t < 1980) {
      var count = Math.min(exploredOrder.length, Math.floor(clamp((t - 420) / 1500) * exploredOrder.length));
      setStatus("Exploring · " + count + " of " + exploredOrder.length + " cells");
      if (loggedState !== "exploring_" + count && count > 0) {
        loggedState = "exploring_" + count;
        var p = exploredOrder[count - 1];
        addConsoleLine("[A*] Pop (" + p.x + "," + p.y + ") from MinHeap; scoring neighbors...", "run");
      }
    } else {
      setStatus("Route selected · " + (path.length ? path.length - 1 : 0) + " steps · nearest exit");
      if (loggedState !== "completed") {
        loggedState = "completed";
        addConsoleLine("[A*] Popped goal exit node!", "route");
        addConsoleLine("[PATH] Reconstructing parent chain from exit...", "route");
        addConsoleLine("[PATH] Safest route computed successfully: " + (path.length - 1) + " steps.", "route");
      }
    }

    var W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isLight ? "#f0f2f5" : "#06070a"; ctx.fillRect(0, 0, W, H);
    var s = Math.min(W / COLS, H / ROWS), ox = (W - s * COLS) / 2, oy = (H - s * ROWS) / 2;

    ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.08)" : "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
    for (var gx = 0; gx <= COLS; gx++) { ctx.beginPath(); ctx.moveTo(ox + gx * s, oy); ctx.lineTo(ox + gx * s, oy + ROWS * s); ctx.stroke(); }
    for (var gy = 0; gy <= ROWS; gy++) { ctx.beginPath(); ctx.moveTo(ox, oy + gy * s); ctx.lineTo(ox + COLS * s, oy + gy * s); ctx.stroke(); }

    var wallAlpha = clamp(t / 430);
    ctx.fillStyle = isLight
      ? "rgba(100, 116, 139, " + (0.45 + wallAlpha * 0.45) + ")"
      : "rgba(58,64,73," + (0.35 + wallAlpha * 0.65) + ")";
    for (var k in walls) {
      var parts = k.split(","), wx = +parts[0], wy = +parts[1];
      rounded(ox + wx * s + 0.7, oy + wy * s + 0.7, s - 1.4, s - 1.4, 2);
      ctx.fill();
    }

    var explored = Math.floor(clamp((t - 420) / 1500) * exploredOrder.length);
    for (var i = 0; i < explored; i++) {
      var c = exploredOrder[i];
      ctx.fillStyle = "rgba(90, 179, 125, 0.16)";
      ctx.fillRect(ox + c.x * s, oy + c.y * s, s, s);
    }
    if (explored < exploredOrder.length && explored > 0) {
      var frontier = exploredOrder[explored];
      ctx.fillStyle = "rgba(90, 179, 125, 0.45)";
      ctx.fillRect(ox + frontier.x * s, oy + frontier.y * s, s, s);
    }

    if (path.length > 1) {
      var progress = clamp((t - 1980) / 760);
      if (progress > 0) {
        var segments = path.length - 1, shown = progress * segments;
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ox + path[0].x * s + s / 2, oy + path[0].y * s + s / 2);
        for (var j = 1; j < path.length && j <= shown; j++) ctx.lineTo(ox + path[j].x * s + s / 2, oy + path[j].y * s + s / 2);
        if (shown < segments) {
          var index = Math.floor(shown), frac = shown - index, a = path[index], b = path[Math.min(path.length - 1, index + 1)];
          ctx.lineTo(ox + (a.x + (b.x - a.x) * frac) * s + s / 2, oy + (a.y + (b.y - a.y) * frac) * s + s / 2);
        }
        ctx.strokeStyle = "rgba(90, 179, 125, 0.26)"; ctx.lineWidth = s * 0.62; ctx.stroke();
        ctx.strokeStyle = "#5cb37d"; ctx.lineWidth = Math.max(1.6, s * 0.24); ctx.stroke();
      }
    }

    exits.forEach(function (p) {
      var px = ox + p.x * s, py = oy + p.y * s;
      ctx.fillStyle = "#3c6c52"; rounded(px + s * .16, py + s * .16, s * .68, s * .68, 3); ctx.fill();
      ctx.strokeStyle = "#7cbca6"; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = "#eaf6ee"; ctx.fillRect(px + s * .34, py + s * .3, s * .32, s * .07);
    });

    var hx = ox + person.x * s + s / 2, hy = oy + person.y * s + s / 2;
    ctx.beginPath(); ctx.arc(hx, hy, s * .38, 0, Math.PI * 2); ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.14)" : "rgba(240,241,238,.16)"; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, s * .25, 0, Math.PI * 2); ctx.fillStyle = isLight ? "#0f172a" : "#f0f1ee"; ctx.fill();

    if (path.length > 1) {
      var travel = clamp((t - 2760) / 1000);
      if (travel > 0) {
        var along = travel * (path.length - 1), at = Math.floor(along), af = along - at;
        var from = path[at], to = path[Math.min(path.length - 1, at + 1)];
        var dx = ox + (from.x + (to.x - from.x) * af) * s + s / 2, dy = oy + (from.y + (to.y - from.y) * af) * s + s / 2;
        ctx.beginPath(); ctx.arc(dx, dy, s * .42, 0, Math.PI * 2); ctx.fillStyle = "rgba(90, 179, 125, 0.22)"; ctx.fill();
        ctx.beginPath(); ctx.arc(dx, dy, s * .2, 0, Math.PI * 2); ctx.fillStyle = "#bdf2d2"; ctx.fill();
      }
    }
  }
  function frame(now) {
    if (!start) start = now;
    var t = now - start;
    if (t > 5400) { start = now; t = 0; }
    draw(t);
    requestAnimationFrame(frame);
  }
  function fit() { draw(reduced.matches ? 9999 : lastT); }
  window.addEventListener("resize", fit);
  window.addEventListener("safepath-theme-change", fit);
  if (reduced.matches) draw(9999);
  else requestAnimationFrame(frame);
  reduced.addEventListener("change", function () {
    if (reduced.matches) { start = 0; draw(9999); }
    else requestAnimationFrame(frame);
  });
})();
