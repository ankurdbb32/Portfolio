/* ===================== WALLPAPER — AUTO ROTATION =====================
   Three wallpapers, crossfading into one another every 30 seconds. Two stacked
   fixed layers sit behind the desktop (z-index -1, same as the old video
   wallpaper) and swap opacity, so a change never snaps or flashes. */
(function () {
  // bg is each image's own average colour, so the layer matches while it loads
  const WALLPAPERS = [
    { id: "bg11", name: "Wallpaper 1", img: "backgound11.jpg", bg: "#211d25" },
    { id: "bg12", name: "Wallpaper 2", img: "backgound12.png", bg: "#181818" },
  ];
  const EVERY_MS = 30000;

  function makeLayer() {
    const el = document.createElement("div");
    el.className = "wp-layer";
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  const layers = [makeLayer(), makeLayer()];
  let front = 0;
  let index = 0;
  let timer = null;

  function paint(el, w) {
    el.style.backgroundColor = w.bg;
    el.style.backgroundImage = 'url("' + w.img + '")';
  }

  function show(i, instant) {
    index = ((i % WALLPAPERS.length) + WALLPAPERS.length) % WALLPAPERS.length;
    const w = WALLPAPERS[index];
    const incoming = layers[1 - front];
    paint(incoming, w);
    if (instant) {
      incoming.style.transition = "none";
      layers[front].style.transition = "none";
    }
    // let the new background land before the fade starts
    requestAnimationFrame(() => {
      incoming.classList.add("wp-layer--on");
      layers[front].classList.remove("wp-layer--on");
      front = 1 - front;
      if (instant) {
        requestAnimationFrame(() => {
          layers[0].style.transition = "";
          layers[1].style.transition = "";
        });
      }
    });
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => show(index + 1), EVERY_MS);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }

  // keep the whole set warm so a crossfade never reveals a half-loaded image
  WALLPAPERS.forEach((w) => {
    const img = new Image();
    img.src = w.img;
  });

  // the layers own the wallpaper from here on; drop the CSS one off the body
  document.body.style.background = WALLPAPERS[0].bg;
  show(0, true);
  start();

  // a background tab shouldn't burn through the rotation unseen
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  window.Wallpaper = {
    list: WALLPAPERS,
    show: show,
    start: start,
    stop: stop,
    current: () => WALLPAPERS[index],
  };
})();

/* ===================== RESPONSIVE SCALE-TO-FIT ===================== */
(function () {
  const screen = document.querySelector(".screen");
  if (!screen) return;
  screen.style.transform = "none"; // wallpaper stays full-bleed

  // Keep the widget columns fully above the dock (macOS behaviour): when the
  // viewport is too short, scale each column down so nothing tucks under the dock.
  const desktop = document.querySelector(".desktop");
  const cols = [...document.querySelectorAll(".desktop .widget-col")];
  const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

  // The columns stretch to the desktop's height, so offsetHeight always equals the
  // space available — it can't tell us whether the content actually fits. Add up
  // what the children really need instead: fixed tiles contribute their own height,
  // flexible cards (Experience / Featured Projects) contribute their min-height.
  function colNeed(col) {
    if (!col) return 0;
    const cs = getComputedStyle(col);
    const gap = parseFloat(cs.rowGap || cs.gap) || 0;
    let total = 0;
    let count = 0;
    Array.prototype.forEach.call(col.children, (child) => {
      const s = getComputedStyle(child);
      if (s.display === "none") return;
      const min = parseFloat(s.minHeight);
      const grows = parseFloat(s.flexGrow) > 0;
      total += grows && min ? min : child.offsetHeight;
      count++;
    });
    return total + gap * Math.max(0, count - 1);
  }

  function fit() {
    // reset first so measurements aren't affected by a prior scale
    cols.forEach((c) => {
      c.style.transform = "none";
      c.style.transformOrigin = "";
      c.style.height = "";
      c.style.width = "";
      c.style.flex = "";
    });
    if (!desktop || isMobile() || !cols.length) return; // phone layout stacks + scrolls instead

    const cs = getComputedStyle(desktop);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const avail = desktop.clientHeight - padY;
    const need = cols.reduce((m, c) => Math.max(m, colNeed(c)), 0);
    if (!(need > avail && need > 0)) return;

    const s = Math.max(0.5, avail / need);
    const padL = parseFloat(cs.paddingLeft);
    const padX = padL + parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap || cs.gap) || 0;
    const availW = desktop.clientWidth - padX;

    // Scaling each column in place used to pull them apart, because they shrank
    // toward different origins — the 16px gutters ballooned. Instead: widen the
    // flexible middle column so the row still spans the desktop once scaled,
    // then lay the columns out by hand from a single origin.
    const mid = desktop.querySelector(".widget-col--mid");
    if (mid) {
      let sideW = 0;
      cols.forEach((c) => {
        if (c !== mid) sideW += c.getBoundingClientRect().width;
      });
      const midW = (availW - gap * (cols.length - 1)) / s - sideW;
      if (midW > 120) {
        mid.style.flex = "0 0 auto";
        mid.style.width = midW + "px";
      }
    }

    // pin each column to its natural height, then translate so the scaled boxes
    // sit flush against one another with exactly `gap` showing between them
    let cursor = desktop.getBoundingClientRect().left + padL;
    cols.forEach((c) => {
      c.style.height = need + "px";
      c.style.transformOrigin = "top left";
      const r = c.getBoundingClientRect(); // untransformed: transform is "none" here
      c.style.transform = "translateX(" + (cursor - r.left) + "px) scale(" + s + ")";
      cursor += r.width * s + gap;
    });
  }

  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("load", fit);
})();

/* ===================== iOS-STYLE ANALOG CLOCK ===================== */
(function () {
  const SVGNS = "http://www.w3.org/2000/svg";
  const CENTER = 100;

  const ticksGroup = document.querySelector(".clock__ticks");
  const numeralsGroup = document.querySelector(".clock__numerals");
  const hourHand = document.querySelector(".clock__hand--hour");
  const minuteHand = document.querySelector(".clock__hand--minute");
  const secondGroup = document.querySelector(".clock__second-group");

  // point on a circle of radius r at a given clock angle (0 = 12 o'clock)
  function point(deg, r) {
    const rad = (deg * Math.PI) / 180;
    return {
      x: CENTER + r * Math.sin(rad),
      y: CENTER - r * Math.cos(rad),
    };
  }

  // --- draw 60 tick marks (every 5th is a bold hour mark) ---
  const OUTER = 94;
  for (let i = 0; i < 60; i++) {
    const isMajor = i % 5 === 0;
    const inner = isMajor ? 80 : 85;
    const a = i * 6;
    const p1 = point(a, OUTER);
    const p2 = point(a, inner);

    const tick = document.createElementNS(SVGNS, "line");
    tick.setAttribute("x1", p1.x);
    tick.setAttribute("y1", p1.y);
    tick.setAttribute("x2", p2.x);
    tick.setAttribute("y2", p2.y);
    tick.setAttribute(
      "class",
      "clock__tick" + (isMajor ? " clock__tick--major" : "")
    );
    ticksGroup.appendChild(tick);
  }

  // --- numerals at 12, 3, 6, 9 ---
  const NUM_R = 62;
  [
    { n: 12, deg: 0 },
    { n: 3, deg: 90 },
    { n: 6, deg: 180 },
    { n: 9, deg: 270 },
  ].forEach(({ n, deg }) => {
    const p = point(deg, NUM_R);
    const t = document.createElementNS(SVGNS, "text");
    t.setAttribute("x", p.x);
    t.setAttribute("y", p.y);
    t.setAttribute("class", "clock__numeral");
    t.textContent = n;
    numeralsGroup.appendChild(t);
  });

  // --- animate hands ---
  function tick() {
    const now = new Date();
    const h = now.getHours() % 12;
    const m = now.getMinutes();
    const s = now.getSeconds();
    const ms = now.getMilliseconds();

    const secDeg = (s + ms / 1000) * 6;
    const minDeg = (m + s / 60) * 6;
    const hourDeg = (h + m / 60) * 30;

    hourHand.setAttribute("transform", `rotate(${hourDeg} ${CENTER} ${CENTER})`);
    minuteHand.setAttribute("transform", `rotate(${minDeg} ${CENTER} ${CENTER})`);
    secondGroup.setAttribute("transform", `rotate(${secDeg} ${CENTER} ${CENTER})`);

    requestAnimationFrame(tick);
  }
  tick();
})();

/* ===================== MENUBAR DATE & CLOCK (LIVE) ===================== */
(function () {
  const el = document.querySelector(".menubar__clock");
  if (!el) return;

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  function update() {
    const now = new Date();
    const day = DAYS[now.getDay()];
    const date = now.getDate();
    const month = MONTHS[now.getMonth()];

    let h = now.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    const m = String(now.getMinutes()).padStart(2, "0");

    // e.g. "Wed 25 Mar  11:33 PM"
    el.innerHTML = `${day} ${date} ${month}&nbsp;&nbsp;${h}:${m}&nbsp;${ampm}`;

    // re-sync at the start of the next minute
    const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(update, delay);
  }
  update();
})();

/* ============ EXPANDABLE GAME WINDOWS (macOS-style open/close) ============ */
(function () {
  const tiles = document.querySelectorAll(".widget--gameimg[data-game]");
  if (!tiles.length) return;
  const screen = document.querySelector(".screen");

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const TITLES = { ttt: "Tic-Tac-Toe", memory: "Memory" };

  // traffic-light glyphs
  const G_CLOSE =
    '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
  const G_MIN =
    '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
  const G_EXPAND =
    '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
  const G_COLLAPSE =
    '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function openGame(kind, tile) {
    // scale-from-icon origin (account for the .screen canvas scale)
    const sRect = screen.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    const ox = t.left + t.width / 2 - sRect.left;
    const oy = t.top + t.height / 2 - sRect.top;

    const modal = el("div", "winmodal");
    const backdrop = el("div", "winmodal__backdrop");
    const win = el("div", "winmodal__window");
    win.style.transformOrigin = ox + "px " + oy + "px";
    win.appendChild(
      el(
        "div",
        "winmodal__bar",
        '<div class="winmodal__lights">' +
          '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
          '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
          '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
          "</div>" +
          '<span class="winmodal__title">' + TITLES[kind] + "</span>"
      )
    );
    const body = el("div", "winmodal__body");
    win.appendChild(body);
    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);

    if (kind === "ttt") mountTTT(body);
    else mountMemory(body);

    // play the open animation on the next frame
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    function close() {
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("winmodal__window--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      // macOS: minimize is unavailable while full-screen — grey it out.
      // Collapse (green again) restores the window and re-enables minimize.
      minBtn.disabled = isMax;
    });
    document.addEventListener("keydown", onKey);
  }

  tiles.forEach((tile) => {
    tile.style.cursor = "pointer";
    tile.addEventListener("click", () => openGame(tile.dataset.game, tile));
  });

  /* ---- Tic-Tac-Toe (hand-drawn) vs computer ---- */
  function mountTTT(body) {
    const O_SVG =
      '<svg viewBox="0 0 100 100" class="mark mark--o"><circle cx="50" cy="50" r="30"/></svg>';
    const X_SVG =
      '<svg viewBox="0 0 100 100" class="mark mark--x"><path d="M30 30 L70 70"/><path d="M70 30 L30 70"/></svg>';

    body.innerHTML =
      '<div class="dttt">' +
      '<div class="dttt__board">' +
      '<svg class="dttt__grid" viewBox="0 0 300 300" aria-hidden="true">' +
      '<path d="M102 16 C99 110 105 200 100 284"/>' +
      '<path d="M200 18 C197 110 203 205 198 282"/>' +
      '<path d="M16 101 C110 98 205 104 284 100"/>' +
      '<path d="M18 199 C110 196 205 202 282 198"/>' +
      "</svg>" +
      [0, 1, 2, 3, 4, 5, 6, 7, 8]
        .map((i) => '<button class="dttt__cell" data-i="' + i + '"></button>')
        .join("") +
      "</div>" +
      '<div class="dttt__foot">' +
      '<span class="dttt__status"></span>' +
      '<button class="dttt__reset" type="button">New Game</button>' +
      "</div></div>";

    const cells = [...body.querySelectorAll(".dttt__cell")];
    const status = body.querySelector(".dttt__status");
    const reset = body.querySelector(".dttt__reset");
    let board, over;

    function winnerInfo(b) {
      for (const line of LINES) {
        const [a, c, d] = line;
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line };
      }
      return null;
    }
    function paint() {
      cells.forEach((c, i) => {
        c.innerHTML = board[i] === "X" ? X_SVG : board[i] === "O" ? O_SVG : "";
        c.disabled = board[i] !== "" || over;
        c.classList.remove("dttt__cell--win");
      });
    }
    function ai() {
      for (const p of ["O", "X"]) {
        for (const line of LINES) {
          const v = line.map((i) => board[i]);
          if (v.filter((x) => x === p).length === 2 && v.includes(""))
            return line[v.indexOf("")];
        }
      }
      if (board[4] === "") return 4;
      const cor = [0, 2, 6, 8].filter((i) => board[i] === "");
      const pool = cor.length
        ? cor
        : board.map((v, i) => (v === "" ? i : -1)).filter((i) => i >= 0);
      return pool[Math.floor(Math.random() * pool.length)];
    }
    function end(info) {
      over = true;
      if (info) {
        info.line.forEach((i) => cells[i].classList.add("dttt__cell--win"));
        status.textContent = info.who === "X" ? "You win! 🎉" : "Computer wins";
      } else status.textContent = "It's a draw";
      cells.forEach((c) => (c.disabled = true));
    }
    function play(i) {
      if (over || board[i]) return;
      board[i] = "X";
      paint();
      let info = winnerInfo(board);
      if (info) return end(info);
      if (board.every((v) => v)) return end(null);
      status.textContent = "Computer…";
      cells.forEach((c) => (c.disabled = true));
      setTimeout(() => {
        board[ai()] = "O";
        paint();
        info = winnerInfo(board);
        if (info) return end(info);
        if (board.every((v) => v)) return end(null);
        status.textContent = "Your turn";
      }, 360);
    }
    function newGame() {
      board = ["", "", "", "", "", "", "", "", ""];
      over = false;
      paint();
      status.textContent = "Your turn — you're X";
    }
    cells.forEach((c, i) => c.addEventListener("click", () => play(i)));
    reset.addEventListener("click", newGame);
    newGame();
  }

  /* ---- Memory match ---- */
  function mountMemory(body) {
    const SYMBOLS = ["🎮", "🎲", "🎯", "🎧", "🎸", "🎨"]; // 6 pairs
    body.innerHTML =
      '<div class="dmem"><div class="dmem__board"></div>' +
      '<div class="dmem__foot"><span class="dmem__status"></span>' +
      '<button class="dmem__reset" type="button">New Game</button></div></div>';
    const boardEl = body.querySelector(".dmem__board");
    const status = body.querySelector(".dmem__status");
    const reset = body.querySelector(".dmem__reset");
    let deck, flipped, matched, lock, moves;

    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function render() {
      boardEl.innerHTML = "";
      deck.forEach((sym, i) => {
        const card = el("button", "dmem__card");
        card.type = "button";
        card.dataset.i = i;
        card.dataset.sym = sym;
        card.addEventListener("click", () => flip(card));
        boardEl.appendChild(card);
      });
    }
    function flip(card) {
      if (
        lock ||
        card.classList.contains("dmem__card--up") ||
        card.classList.contains("dmem__card--done")
      )
        return;
      card.classList.add("dmem__card--up");
      card.textContent = card.dataset.sym;
      flipped.push(card);
      if (flipped.length === 2) {
        moves++;
        lock = true;
        const [a, b] = flipped;
        if (a.dataset.sym === b.dataset.sym) {
          setTimeout(() => {
            a.classList.add("dmem__card--done");
            b.classList.add("dmem__card--done");
            flipped = [];
            lock = false;
            matched++;
            if (matched === SYMBOLS.length)
              status.textContent = "Solved in " + moves + " moves! 🎉";
          }, 300);
        } else {
          setTimeout(() => {
            [a, b].forEach((c) => {
              c.classList.remove("dmem__card--up");
              c.textContent = "";
            });
            flipped = [];
            lock = false;
          }, 700);
        }
      }
    }
    function newGame() {
      deck = shuffle([...SYMBOLS, ...SYMBOLS]);
      flipped = [];
      matched = 0;
      moves = 0;
      lock = false;
      status.textContent = "Find all pairs";
      render();
    }
    reset.addEventListener("click", newGame);
    newGame();
  }
})();
/* ===================== ABOUT ME → NOTES WINDOW ===================== */
(function () {
  const widget = document.querySelector(".widget--notes");
  const screen = document.querySelector(".screen");
  if (!widget || !screen) return;

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  function stamp() {
    const n = new Date();
    let h = n.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    const m = String(n.getMinutes()).padStart(2, "0");
    return `${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()} at ${h}:${m} ${ap}`;
  }

  const S = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
  const ICON = {
    folderAdd: S('<path d="M3 8.5a1.8 1.8 0 0 1 1.8-1.8h2.9l1.5 1.7H15a1.8 1.8 0 0 1 1.8 1.8v6.3a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 16.5z"/><path d="M19 4.6v3.8M17.1 6.5h3.8"/>'),
    sidebar: S('<rect x="3" y="5" width="18" height="14" rx="3"/><line x1="9.5" y1="5" x2="9.5" y2="19"/>'),
    folder: '<svg viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h3.3l1.7 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M6.2 11.4H17.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    chevron: S('<path d="M15 5l-6 7 6 7"/>'),
    compose: S('<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 3.6a2 2 0 0 1 2.8 2.8L12 15.6 8 17l1.4-4z"/>'),
    checklist: S('<path d="M3.5 7l1.5 1.5L8 5.5"/><line x1="11" y1="7" x2="20.5" y2="7"/><path d="M3.5 15l1.5 1.5L8 13.5"/><line x1="11" y1="15" x2="20.5" y2="15"/>'),
    table: S('<rect x="3.5" y="5" width="17" height="14" rx="2"/><line x1="3.5" y1="10.5" x2="20.5" y2="10.5"/><line x1="3.5" y1="15" x2="20.5" y2="15"/><line x1="9.5" y1="5" x2="9.5" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>'),
    attach: S('<path d="M20 11l-8.4 8.4a4 4 0 0 1-5.7-5.7L14.2 5.4a2.6 2.6 0 0 1 3.7 3.7L9.5 17.5a1.3 1.3 0 0 1-1.9-1.9L15 8.2"/>'),
    markup: S('<path d="M15 4.5l4.5 4.5L8 20.5l-4.5 1 1-4.5z"/><line x1="13.5" y1="6" x2="18" y2="10.5"/>'),
    share: S('<path d="M12 3.5v11"/><path d="M8 7l4-4 4 4"/><path d="M6 12v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7"/>'),
    more: S('<circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/>'),
    search: S('<circle cx="10" cy="10" r="6"/><line x1="14.5" y1="14.5" x2="20" y2="20"/>'),
    copy: S('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>'),
    award: S('<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.6 7 21l5-2.6 5 2.6-1.6-7.4"/>'),
    mail: S('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M4 8l8 5.5L20 8"/>'),
    globe: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.7 2.5 4.2 5.7 4.2 9s-1.5 6.5-4.2 9c-2.7-2.5-4.2-5.7-4.2-9s1.5-6.5 4.2-9z"/>'),
    linkedin: S('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="7.6" cy="8" r="1.1" fill="currentColor" stroke="none"/><path d="M7.6 10.8v6.2"/><path d="M11 17v-6.2"/><path d="M11 13.3c.4-1 1.4-1.8 2.7-1.8 1.6 0 2.7 1.1 2.7 3V17"/>'),
    pin: S('<path d="M12 21c4-4 6.3-7.2 6.3-10.5a6.3 6.3 0 1 0-12.6 0C5.7 13.8 8 17 12 21z"/><circle cx="12" cy="10.4" r="2.3"/>'),
  };
  const PORTFOLIO_URL = "https://ankurdbb-portfolio.vercel.app/"; // shown/copied by the Share button

  // ---- content builders ----
  const P = (t) => '<p class="nw__p">' + t + "</p>";
  const H2 = (t) => '<h2 class="nw__h2">' + t + "</h2>";
  const HR = '<div class="nw__hr"></div>';
  const UL = (items) =>
    '<ul class="nw__ul">' + items.map((i) => '<li class="nw__li">' + i + "</li>").join("") + "</ul>";
  const ULP = (items) =>
    '<ul class="nw__ul nw__ul--plain">' + items.map((i) => '<li class="nw__li">' + i + "</li>").join("") + "</ul>";
  const JOB = (title, date, bullets) => {
    const idx = title.indexOf(",");
    const role = idx >= 0 ? title.slice(0, idx) : title;
    const org = idx >= 0 ? title.slice(idx + 1).trim() : "";
    return (
      '<div class="nw__job">' +
        '<div class="nw__job-head">' +
          '<div class="nw__job-titles">' +
            '<div class="nw__job-role">' + role + "</div>" +
            (org ? '<div class="nw__job-org">' + org + "</div>" : "") +
          "</div>" +
          (date ? '<span class="nw__job-date">' + date + "</span>" : "") +
        "</div>" +
        (bullets && bullets.length ? UL(bullets) : "") +
      "</div>"
    );
  };
  // like JOB, but the tech stack renders as chips AFTER the bullets (so it never
  // clashes with the project name on narrow/mobile screens)
  const PROJ = (title, stack, bullets) => {
    const idx = title.indexOf(",");
    const role = idx >= 0 ? title.slice(0, idx) : title;
    const org = idx >= 0 ? title.slice(idx + 1).trim() : "";
    const chips = stack
      ? '<div class="nw__stack">' +
        stack.split("·").map((s) => '<span class="nw__stack-chip">' + s.trim() + "</span>").join("") +
        "</div>"
      : "";
    return (
      '<div class="nw__job">' +
        '<div class="nw__job-head"><div class="nw__job-titles">' +
          '<div class="nw__job-role">' + role + "</div>" +
          (org ? '<div class="nw__job-org">' + org + "</div>" : "") +
        "</div></div>" +
        (bullets && bullets.length ? UL(bullets) : "") +
        chips +
      "</div>"
    );
  };
  const TAGS = (items) =>
    '<div class="nw__tags">' + items.map((i) => '<span class="nw__tag">' + i + "</span>").join("") + "</div>";
  const CARD = (icon, title, sub, extra) =>
    '<div class="nw__card">' +
      '<span class="nw__card-ic">' + icon + "</span>" +
      '<div class="nw__card-body">' +
        '<div class="nw__card-title">' + title + "</div>" +
        (sub ? '<div class="nw__card-sub">' + sub + "</div>" : "") +
        (extra ? '<div class="nw__card-extra">' + extra + "</div>" : "") +
      "</div>" +
    "</div>";
  const CROW = (icon, text) =>
    '<div class="nw__crow"><span class="nw__crow-ic">' + icon + "</span>" +
    '<span class="nw__crow-text">' + text + "</span></div>";

  // one icon per note, so the mobile tab bar isn't eight identical folders
  const TABIC = {
    "About Me": S('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c0-3.6 3.2-6.2 7.2-6.2s7.2 2.6 7.2 6.2"/>'),
    "Professional Experience": S('<rect x="3" y="7.5" width="18" height="12.5" rx="2.2"/><path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8v1.7"/>'),
    "Internships": S('<path d="M12 4 22 9l-10 5L2 9z"/><path d="M6 11.4V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.6"/>'),
    "Projects": S('<rect x="3.4" y="3.4" width="7.2" height="7.2" rx="2"/><rect x="13.4" y="3.4" width="7.2" height="7.2" rx="2"/><rect x="3.4" y="13.4" width="7.2" height="7.2" rx="2"/><rect x="13.4" y="13.4" width="7.2" height="7.2" rx="2"/>'),
    "Skills": S('<path d="M12 3.2 14.1 9l5.9 2.1-5.9 2.1L12 19l-2.1-5.8L4 11.1 9.9 9z"/>'),
    "Education": S('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>'),
    "Certifications": S('<circle cx="12" cy="9.2" r="5.2"/><path d="M8.6 13.6 7.4 20.4 12 18.2l4.6 2.2-1.2-6.8"/>'),
    "Contact": S('<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M3.8 7 12 13l8.2-6"/>'),
  };

  // Filled twins of the tab icons. The sidebar on desktop uses the outlined set;
  // the iOS-style tab bar uses these, the way SF Symbols' .fill variants work.
  const F = (b) => '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic-fill">' + b + "</svg>";
  const TABIC_FILL = {
    "About Me": F('<circle cx="12" cy="8" r="3.9"/><path d="M4.6 20.4c0-3.8 3.3-6.6 7.4-6.6s7.4 2.8 7.4 6.6z"/>'),
    "Professional Experience": F('<path d="M9.6 5.6h4.8v1.6h2V5.6A2 2 0 0 0 14.4 3.6H9.6a2 2 0 0 0-2 2v1.6h2z"/><rect x="2.6" y="7.6" width="18.8" height="12.8" rx="2.6"/>'),
    "Internships": F('<path d="M12 3.4 23 8.8l-11 5.4L1 8.8z"/><path d="M5.6 11.6v4.2c0 1.9 2.9 3.4 6.4 3.4s6.4-1.5 6.4-3.4v-4.2L12 15z"/>'),
    "Projects": F('<rect x="3" y="3" width="8" height="8" rx="2.3"/><rect x="13" y="3" width="8" height="8" rx="2.3"/><rect x="3" y="13" width="8" height="8" rx="2.3"/><rect x="13" y="13" width="8" height="8" rx="2.3"/>'),
    "Skills": F('<path d="M12 2.4 14.4 8.9 21 11.3l-6.6 2.4L12 20.2 9.6 13.7 3 11.3l6.6-2.4z"/>'),
    "Education": F('<path d="M3.4 5.4A1.8 1.8 0 0 1 5.2 3.6h5.9v16.8H5.2a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M20.6 5.4a1.8 1.8 0 0 0-1.8-1.8h-5.9v16.8h5.9a1.8 1.8 0 0 0 1.8-1.8z"/>'),
    "Certifications": F('<circle cx="12" cy="9" r="5.6"/><path d="M8.2 14.2 6.8 21.2 12 18.6l5.2 2.6-1.4-7a7.4 7.4 0 0 1-7.6 0z"/>'),
    "Contact": F('<path fill-rule="evenodd" d="M2.4 7.2A2.6 2.6 0 0 1 5 4.6h14a2.6 2.6 0 0 1 2.6 2.6v9.6A2.6 2.6 0 0 1 19 19.4H5a2.6 2.6 0 0 1-2.6-2.6zM5.4 7 12 11.9 18.6 7z"/>'),
  };

  const TAB_SHORT = {
    "About Me": "About",
    "Professional Experience": "Experience",
    "Certifications": "Certs",
  };

  const CONTENT = {
    "About Me":
      '<h1 class="nw__h1">About Me</h1>' +
      P(`I'm a Senior UI/UX Designer with a B.Tech (Hons.) from IIT Roorkee, focused on designing end-to-end digital products across fintech, insurance, hiring, EdTech, and enterprise SaaS.`) +
      P(`My experience sits at the intersection of user needs, business goals, and technology. I work on complex products where the challenge is often not just designing an interface, but understanding the problem, simplifying information, and creating experiences that are intuitive, scalable, and practical to build.`) +
      HR +
      H2(`My Experience`) +
      P(`I've worked across web and mobile products, taking designs from early-stage research and problem definition through information architecture, user flows, wireframes, prototyping, usability testing, and developer handoff.`) +
      P(`My work has involved designing for complex enterprise workflows, data-heavy interfaces, dashboards, financial and insurance experiences, hiring platforms, and AI-powered products. I collaborate closely with product managers, developers, stakeholders, and users to turn complex requirements into clear and usable product experiences.`) +
      P(`Before moving fully into product design, I also worked as a Software Development Engineer on Apple Maps. That experience gave me a strong understanding of how products are built from the engineering side and helped shape the way I approach design today — with equal attention to user experience, technical feasibility, data, and implementation.`) +
      HR +
      H2(`How I Think About Design`) +
      P(`I believe good design starts long before the first frame is created in Figma.`) +
      P(`My process begins by understanding why a problem exists, who is experiencing it, and what outcome the product needs to achieve. From there, I structure the information, map the user journey, identify friction points, and explore different interaction models before moving into visual design.`) +
      P(`I try to avoid designing isolated screens. Instead, I think in terms of systems, journeys, states, and relationships between experiences.`) +
      P(`My approach is generally:`) +
      P(`<strong>Understand → Define → Structure → Explore → Prototype → Test → Refine → Handoff</strong>`) +
      P(`I use research and testing to validate assumptions, but I also believe design decisions should balance user needs with business objectives and technical constraints.`) +
      HR +
      H2(`What I Bring`) +
      TAGS([`User Research & Usability Testing`, `User Journey Mapping`, `Information Architecture`, `User Flows & Interaction Models`, `Wireframing`, `High-Fidelity Prototyping`, `Interaction Design`, `Design Systems`, `Dashboard & Data Visualization`, `Enterprise & SaaS Product Design`, `AI/LLM & Conversational UX`, `AI Copilot Experiences`, `Responsive Web & Mobile Design`, `Developer Handoff`]) +
      HR +
      H2(`Impact`) +
      P(`I focus on creating design processes and systems that improve not just the final product, but how efficiently teams build it.`) +
      P(`My work has included:`) +
      UL([`Delivering 30+ wireframes, user flows, and high-fidelity prototypes, helping reduce design iteration cycles by ~30%.`, `Conducting structured research with 30+ participants across two-week testing cycles, contributing to ~25% improvements in task completion.`, `Building reusable design-system components that reduced design-to-development turnaround by ~35%.`, `Creating detailed specifications, interaction states, and edge cases that improved implementation efficiency by ~34% and reduced development rework.`]) +
      HR +
      H2(`What I Like Designing`) +
      P(`I'm particularly interested in products where design has to make complexity feel simple.`) +
      P(`My areas of interest include:`) +
      TAGS([`Enterprise Products`, `SaaS`, `Fintech`, `Insurance`, `AI/LLM UX`, `Conversational Interfaces`, `AI Copilots`, `Dashboards`, `Data Visualization`, `Web Applications`, `Mobile Applications`]) +
      HR +
      H2(`AI in My Workflow`) +
      P(`AI has become an active part of my design process — not as a replacement for design thinking, but as a way to explore, iterate, and move faster.`) +
      P(`I use AI throughout different stages of the workflow, including research exploration, ideation, UX writing, interaction exploration, prototyping, design validation, and development collaboration.`) +
      P(`Tools I currently work with include:`) +
      TAGS([`Cursor`, `Lovable AI`, `v0 by Vercel`, `ChatGPT`, `Claude`, `Gemini`, `Stitch`, `UX Pilot`, `Readdy.ai`]) +
      P(`I've also completed LinkedIn Learning's Using AI in the UX Design Process, and continue to explore how AI can improve both the way products are designed and the experiences those products provide.`) +
      HR +
      H2(`Recognition`) +
      P(`I received the Best Design Award at the Design Rush competition organised by IIT BHU, selected from 1,200+ participants, for a crypto trading app created while leading the IIT Roorkee Design Team.`) +
      P(`For me, design is ultimately about making complexity understandable, interactions intentional, and products useful — while creating systems that can evolve with the people and businesses using them.`),

    "Professional Experience":
      '<h1 class="nw__h1">Professional Experience</h1>' +
      JOB(`Senior UI/UX Designer, Ensylon, Jaipur`, `Jun 2025 - Sep 2026`, [`Leading end-to-end product design for EquiTrust's Fintech and Insurance digital ecosystem, including the Quotient hiring platform and 4+ enterprise insurance tools across policy, retirement, and annuity workflows`, `Designed and optimized multi-step user journeys within the Quotient platform, covering candidate onboarding, profile creation, job workflows, and recruiter interactions`, `Delivered 30+ wireframes, user flows, and high-fidelity prototypes, reducing design iteration cycles by ~30% across stakeholder reviews`, `Conducted structured user research with 30+ participants in 2-week cycles, identifying usability gaps and improving task completion rates by ~25% across hiring and internal workflows`, `Built and scaled reusable design system components across hiring and insurance products, reducing design-to-development turnaround time by ~35%`, `Delivered developer-ready specifications, interaction states, and edge cases, improving implementation efficiency by ~34% and reducing rework`, `Collaborated with US-based stakeholders, product managers, and engineering teams to translate complex hiring and insurance requirements into scalable UX solutions`, `Contributed to product direction by presenting UX insights that influenced feature prioritization and roadmap decisions`]) +
      JOB(`UI/UX Designer, Oolook, Jaipur`, `May 2023 - Apr 2025`, [`Designed end-to-end user experiences across web and mobile platforms, structuring core user journeys from onboarding to key feature interactions`, `Created scalable information architecture and interaction models, improving task completion rates by ~25% across primary user flows`, `Conducted usability testing and iterative design improvements, increasing user satisfaction by 15-20% based on feedback and usage patterns`, `Collaborated closely with product managers and engineers to translate requirements into feasible, high-quality design solutions`, `Delivered high-fidelity prototypes and developer-ready specifications, reducing ambiguity during implementation and improving delivery speed`, `Contributed to feature prioritization by leveraging user insights, aligning design decisions with business and product goals`]) +
      JOB(`Software Development Engineer, Apple Maps via ThoughtGenesis, Hyderabad`, `Jan 2022 - Jan 2023`, [`Improved map-based user experience by enhancing visualization logic for geographic data layers (e.g., water bodies) across multiple zoom levels`, `Designed and implemented data optimization pipelines, achieving ~487% improvement in data accuracy, consistency, and availability for map interfaces`, `Worked on system-level design for data-driven UI behavior, ensuring consistency and scalability across large datasets and edge cases`]),

    "Internships":
      '<h1 class="nw__h1">Internships</h1>' +
      JOB(`UI/UX Design Intern, BrainQuest (Remote)`, `Feb 2023 - Apr 2023`, [`Iterated on designs using stakeholder feedback and usage insights, improving clarity and efficiency across key financial interactions`, `Delivered end-to-end UX solutions across fintech and insurance workflows by aligning user needs, business requirements, and system constraints, contributing to scalable, conversion-focused product experiences`, `Built intuitive interfaces for financial dashboards, policy comparison views, and transaction tracking systems, improving usability of data-heavy and high-frequency workflows`]) +
      JOB(`UI/UX Design Intern, Trumsy (Remote)`, `Apr 2021 - Dec 2021`, [`Owned the end-to-end design lifecycle for an EdTech startup's gamified learning platform for kids, translating complex user needs into intuitive UI flows and engaging learning experiences aligned with product KPIs`, `Collaborated closely with PMs and developers to define product features, apply usability best practices, and deliver high-impact design solutions under tight timelines`]),

    "Projects":
      '<h1 class="nw__h1">Projects</h1>' +
      H2(`Live Projects`) +
      PROJ(`Quotient, Hiring Platform for EquiTrust (Ensylon)`, `User Journeys · User Research · Prototyping · Design Systems`, [`Designed and optimized multi-step user journeys covering candidate onboarding, profile creation, job workflows, and recruiter interactions`, `Conducted structured user research with 30+ participants in 2-week cycles, improving task completion rates by ~25% across hiring and internal workflows`, '<a class="nw__email" href="https://nexus-ahse-psi.vercel.app/" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      PROJ(`Employee Portal, iConnect · Employee Self-Service HR Portal`, `Dashboard Design · Workflow Design · Information Architecture · Web App`, [`An employee self-service portal where staff manage attendance, leave, payroll, documents, requests and exits in one place`, `Designed a self-service dashboard with quick actions, announcements, team availability and monthly holidays`, `Structured request and approval flows for leave, work from home, on-duty and service requests, with clear Pending, Approved and Rejected states`, `Mapped modules for attendance check-in/out, salary slips, tax documents, reimbursements, profile and document management, and company policies`, `Designed the resignation and exit journey, from the notice-period check to the exit checklist and progress timeline`, '<a class="nw__email" href="https://employee-portal-seven-delta.vercel.app/" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      PROJ(`Nexus, Insurance Distribution Platform Dashboard · Nexus Party`, `Dashboard Design · Data Visualization · Enterprise SaaS · AI Assistant UX`, [`A multi-tenant admin platform for insurance distribution, managing organizations, agencies, agents, carriers, commissions and payment operations`, `Designed a data-heavy command centre bringing together revenue trends, agent activity and operational health`, `Structured multi-tenant admin flows for tenant provisioning, branding with live preview, SSO/MFA, and roles and permissions`, `Created operations workflows for commission statement upload, reconciliation, exception queues and ACH (NACHA) batch processing`, `Covered the Nexus AI assistant, privacy and consent tools, audit trails, and light and dark themes`, '<a class="nw__email" href="https://nexus-phi-gilt.vercel.app/" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      PROJ(`Oolook, AI Creative Studio & Social Manager`, `Information Architecture · Interaction Design · Usability Testing`, [`Designed end-to-end user experiences across web and mobile platforms, from onboarding to key feature interactions`, `Created scalable information architecture and interaction models, improving task completion rates by ~25% across primary user flows`, `Conducted usability testing and iterative design improvements, increasing user satisfaction by 15-20%`, '<a class="nw__email" href="https://oolook.in/" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      PROJ(`Chez Suzette, French Restaurant Website · Singapore`, `Web Design · Responsive Web/Mobile · Hospitality`, [`The website for Chez Suzette, a French restaurant, café and wine bar on Teck Lim Road, Singapore`, `Designed a story-led homepage that moves from the menu to the restaurant's ambience, the Cave à Vin wine bar, promotions and private dining`, `Kept booking within reach throughout the site, with Reserve Now, Enquire Now and WhatsApp actions`, `Structured dedicated pages for the menu, events and private dining, gallery, reviews and the founder's story`, '<a class="nw__email" href="https://www.chezsuzette.sg/" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      PROJ(`V.-R., Architecture & Interior Design Landing Page`, `Landing Page · Wix · Visual Design`, [`A single-page site for an architecture and design studio covering architecture, 3D modeling, interiors, landscape and building design`, `Designed an image-led hero and a featured-work portfolio grouped by project category`, `Explained the studio's approach through a simple three-step process: Brainstorm, Solution, and Modify & Refine`, `Built trust with a stats band, skills section, journey articles and a newsletter signup`, '<a class="nw__email" href="https://mehakwebsitedesign.wixsite.com/my-site" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      PROJ(`GlobeFarer, Logistics Company Landing Page`, `Landing Page · Wix · Visual Design`, [`A landing page for a global shipping and logistics company offering freight forwarding, warehousing and distribution, customs clearance and value-added services`, `Designed a service-led layout covering warehouse storage, solutions, services, fleet and divisions`, `Placed Track Your Order in the header so shipment tracking is always one click away`, `Built credibility with client testimonials, team profiles, client logos and a stats band`, '<a class="nw__email" href="https://mehakwebsitedesign.wixsite.com/global" target="_blank" rel="noopener">Visit Live Site ↗</a>']) +
      H2(`Figma Files`) +
      PROJ(`Daily News App, Paper Intelligence · News Learning Layer for Inshorts`, `UX Research · Information Architecture · Wireframing · Design System · Prototyping · Usability Testing · Mobile UI · Web UI`, [`"Paper Intelligence", a 7-day case study that adds a learning layer to Inshorts, helping readers follow news stories as they develop over time, across iOS screens and a 3-column desktop web layout`, `Designed a story-following system (Follow Story, What's New Since You Last Visited, My Stories) so readers can keep track of developing news`, `Built an AI Explainer with three depth levels, a story timeline and an interactive knowledge graph linking stories to related topics`, `Added a learning dashboard, a daily brief and story-completed states that reward staying informed`, `Worked through research, persona, journey map, JTBD, information architecture, user flows, 13 wireframes, a design system, prototype and usability testing`,'<a class="nw__email" href="Daily%20News%20App.pdf" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/design/65RtEEqPhD6Q6Cozb2E6ux/Inshorts-Assignemt?node-id=0-1&t=L07rNzKORvdFp4eY-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`Retail App UI, Drop Commerce App for a D2C Fashion Brand`, `Mobile App Design · E-commerce UX · Competitive Analysis · Design Principles · Figma`, [`A mobile shopping experience for a premium D2C fashion brand that sells limited "drops", keeping shoppers excited and confident from the drop page to checkout and beyond`, `Designed a dark, editorial drop landing page that builds urgency with a live countdown, stock levels and a people-waiting count`, `Built product detail, cart and checkout screens with virtual try-on, a clear cost breakdown, delivery estimates and multiple payment options`, `Designed an order confirmation screen with order tracking and a preview of the next drop to bring shoppers back`, `Grounded the design in personas, pain points, JTBD, an experience audit, opportunity mapping and competitive analysis`,'<a class="nw__email" href="Retail%20App%20UI.pdf" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/design/rlbUbTkCsNntza53gCecmm/Infinite-Locus-Assignment?node-id=0-1&t=L07rNzKORvdFp4eY-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`Design System, Figma Design File`, `Design Systems · Component Libraries · Figma`, [`A design system built in Figma to keep product interfaces consistent`, `Organised reusable UI foundations and components in one shared Figma file`,'<a class="nw__email" href="https://www.figma.com/design/JHHs3nV0rlb9imNmoIW58U/Design-system?t=L07rNzKORvdFp4eY-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`Power BI Dashboard, Executive Operations Dashboard Redesign`, `Dashboard Design · Data Visualization · Information Architecture · Power BI`, [`A concept redesign that turns a legacy manufacturing Power BI dashboard into a predictive decision tool for a VP of Global Operations`, `Structured the dashboard in four layers, from a five-second executive health check to regional comparison, predictive maintenance and prioritised actions`, `Designed a decision chain linking sensor data and failure risk to downtime cost and a recommended action`, `Built a dark visual system with traffic-light status colours and a clear type scale, kept within Power BI's constraints`,'<a class="nw__email" href="Power%20BI%20dashboard.pdf" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/design/me6QhfuomxhmnkibMAxNqm/Power-BI-dashboard?node-id=0-1&t=L07rNzKORvdFp4eY-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`Security Rule Engine UI, Guided Security Rule Builder · ThreatModeler`, `UX Research · Personas · Task Flows · Enterprise UX · Figma`, [`A UX case study for ThreatModeler's Security Rule Engine, making security rule creation simpler and guided so even non-technical users can set rules up correctly`, `Structured rule creation as a guided flow: rule setup, trigger selection, condition builder, actions, then review and simulate`, `Explored feature concepts including a Smart Rule Assistant, natural-language rule creation, a visual logic map and a real-time impact simulator`, `Built the research foundation with competitor analysis (Microsoft Defender for Cloud, Snyk), three personas, task mapping, root cause analysis and an Eisenhower prioritisation matrix`,'<a class="nw__email" href="Create%20Security%20rule%20engine%20UI.pdf" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/design/f64ZWmQ3VwMEDbhIETnvfB/Create-Security-rule-engine-UI?node-id=0-1&t=L07rNzKORvdFp4eY-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`Truck Logistics Web/App UI, Figma Design File`, `Web UI · Mobile UI · Logistics · Figma`, [`Web and mobile app UI for a truck logistics product, designed in Figma`, `Covers both the web and the mobile app experience in one Figma file`,'<a class="nw__email" href="https://www.figma.com/design/S3hU96qqifE3A5L6yseRdL/Truck-logistics-Web-App-UI?node-id=0-1&t=L07rNzKORvdFp4eY-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`SupperTiffin, Food Subscription App`, `Secondary Research · User Interviews · Affinity Mapping · User Persona · Competitor Analysis · User Flow · Wireframing · Interface Design · Prototyping`, [`A tiffin subscription feature inside a food delivery app, helping students, working professionals, single parents and travellers in urban India find home-style meals from local kitchens within 5 km`, `Conducted secondary research and 4 user interviews, then used affinity mapping to surface 10 pain points, including unreliable delivery times, unclear pricing and no meal customisation`, `Benchmarked Swiggy, Zomato and Homeal, and framed How Might We questions to guide ideation`, `Designed the full subscription journey: kitchen discovery with a Veg-only filter, restaurant pages, 7-day, 15-day or monthly plans, delivery slots and cart`, `Designed subscription management to skip, swap, pause or reschedule meals, plus edge cases like item unavailability, then prototyped in Figma and gathered feedback from the interviewees`,'<a class="nw__email" href="https://ankurmeena.notion.site/Case-Study-SupperTiffin-A-Food-Subscription-App-eb09402e5c5e4837be2d10b377e85a46" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/file/fV6v8XBN69cnm3mlW5RUV7/SupperTiffins?type=design&node-id=240%3A59&mode=design&t=CBLUvLyjyFZU7PoF-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`GolfTraxx, Golf App`, `Research · Competitor Analysis · Affinity Mapping · Persona · Storyboard · User Flow · Wireframing · Interface Design`, [`A golf app offering detailed course information (maps, greens, bunkers, hazards and distances) from a database of 40,000+ courses, game statistics tracking, and group play with friends`, `Worked as user researcher, UX designer and UI designer across the full design thinking process`, `Researched golf app usage with National Golf Foundation data and reviewed competitors such as Golf Shot and Coach's Eye to find a clear point of difference`, `Synthesised findings through affinity mapping in Miro, then defined the problem statement, persona and a storyboard around organising group games`, `Structured the user flow and took low-fidelity wireframes to high-fidelity UI for course details, stat tracking and group play`,'<a class="nw__email" href="https://ankurmeena.notion.site/Case-Study-GolfTraxx-Revolutionizing-Golfing-Experience-71a2b62ca62c4bc2a2453a858627af0a" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/file/RlW96aVMM7huhynjouf6FI/GolfTraxx?type=design&node-id=106%3A8&mode=design&t=GyprBxRElI81hhuM-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`Blue Infinity, Web Solutions Website`, `Web Design · Visual Design · Figma`, [`A marketing website for Blue Infinity, a web solutions provider covering planning, design, development, testing and delivery`, `Designed the site around the brand message "Elevate Your Digital Presence", led by a strong hero and brand introduction`, `Structured the content around the service lifecycle, from planning through to delivery`, `Delivered the design as an interactive Figma prototype`,'<a class="nw__email" href="https://ankurmeena.notion.site/Blue-Infinity-Elevate-Your-Digital-Presence-a90b68e2fc3247d995c62d704013f87d" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/file/2b6SLGvM7hWMF2NMzwxRr0/Blue-i?type=design&node-id=16%3A35&mode=design&t=TdEs7s6KMKn08tBN-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`AUGMEE, Augmented Reality Dining App`, `Mobile App Design · AR Experience · Prototyping · Figma`, [`A dining app that scans a restaurant's menu to show its categories, nearby options and the latest trends`, `Designed the menu-scanning flow and category browsing to make choosing what to order quicker`, `Designed an augmented reality menu that lets diners see dishes visually before they choose`, `Built a clickable Figma prototype to demonstrate the experience`,'<a class="nw__email" href="https://ankurmeena.notion.site/AUGMEE-Elevate-Your-Dining-Experience-with-Augmented-Reality-1a23a3c158a04ddda268bc23ec083154" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/file/pTLwwK8ZUD5TlRp0nWjbuL/AUGMEE?type=design&node-id=158%3A98&mode=design&t=VoAPJSQ6Sl89hAKp-1" target="_blank" rel="noopener">Open in Figma ↗</a>']) +
      PROJ(`FFV Fast Delivery, Grocery Delivery App`, `App Design · Mobile UI · Figma`, [`A grocery delivery app built around guaranteed quality, on-time delivery, free delivery and hassle-free returns`, `Designed the app UI around trust: orders that arrive on time and intact, with easy returns`, `Carried the quality and on-time delivery promise through the app's messaging and visual presentation`, `Shared the work as an interactive Figma design`,'<a class="nw__email" href="https://ankurmeena.notion.site/FFV-Fast-Delivery-Quality-On-Time-Free-Returns-a317ba9d693a43faa8788cca6e64ff64" target="_blank" rel="noopener">View Case Study ↗</a>', '<a class="nw__email" href="https://www.figma.com/file/2v4TCBvY8bsm3kVkzTwAOy/Grocery---app?type=design&node-id=354%3A2&mode=design&t=u7S8qExh4PVRvwk3-1" target="_blank" rel="noopener">Open in Figma ↗</a>']),

    "Skills":
      '<h1 class="nw__h1">Skills</h1>' +
      H2(`Design`) +
      TAGS([`User Experience (UX) Design`, `User Interface (UI) Design`, `Enterprise Product Design`, `SaaS Product Design`, `AI/LLM UX Design`, `Conversational UI Design`, `AI Copilot Experience Design`, `Prompt UX Design`, `Dashboard & Analytics Design`, `Data Visualization`, `Design Systems`, `Component Libraries`, `Information Architecture`, `User Research`, `User Journey Mapping`, `Wireframing`, `Prototyping`, `Interaction Design`, `Responsive Design`, `Mobile App Design`, `Web Application Design`, `Accessibility (WCAG)`, `Usability Testing`, `Design Thinking`, `Visual Design`, `Heuristic Evaluation`, `Design Strategy`, `UX Writing`, `User-Centered Design`]) +
      HR +
      H2(`Development & Collaboration`) +
      TAGS([`HTML5`, `CSS3`, `JavaScript Fundamentals`, `Bootstrap`, `Responsive Web Design`, `Mobile-First Design`, `Design-to-Development Handoff`, `Figma Inspect`, `Component Libraries`, `Design Systems`, `Developer QA`, `Frontend Feasibility Review`, `Cross-Functional Collaboration`, `Agile/Scrum`, `Stakeholder Management`, `Product-Engineering Collaboration`]) +
      HR +
      H2(`Tools`) +
      TAGS([`Figma`, `FigJam`, `Adobe XD`, `Photoshop`, `Illustrator`, `Miro`, `Jira`, `Confluence`, `Notion`, `Cursor`, `Lovable AI`, `V0 by Vercel`, `ChatGPT`, `Claude`, `Gemini`, `Stitch`, `UX Pilot`, `Readdy.ai`, `Wix`, `WordPress`, `Maze`, `Zeplin`, `Chrome DevTools`]),

    "Education":
      '<h1 class="nw__h1">Education</h1>' +
      CARD(ICON.award, `Bachelor of Technology (Hons.)`, `Indian Institute of Technology, Roorkee · 2018 - 2022`, `CGPA: 7.89 / 10.0`) +
      CARD(ICON.award, `CBSE Class XII`, `Kendriya Vidyalaya No. 1, Jaipur · 2017`, `95%`) +
      CARD(ICON.award, `CBSE Class X`, `Kendriya Vidyalaya No. 1, Jaipur · 2015`, `CGPA: 9.80`),

    "Certifications":
      '<h1 class="nw__h1">Certifications</h1>' +
      P(`Professional certifications I've completed.`) +
      CARD(ICON.award, `Google UX Design Professional Certificate`, `Google`, `Jan 2024`) +
      CARD(ICON.award, `Using AI in the UX Design Process`, `LinkedIn Learning`, `Jan 2024`) +
      H2(`Positions of Responsibility`) +
      CARD(ICON.award, `Head Team Member, Design Fest`, `IIT Roorkee`, `Headed the IIT Roorkee Design Team at the Design Rush Fest hosted by IIT BHU, and won the Best Design Award out of 1200+ participants for Trado, a crypto trading app.`),

    "Contact":
      '<h1 class="nw__h1">Contact</h1>' +
      P(`Let's design something meaningful.`) +
      '<div class="nw__contacts">' +
        CROW(ICON.mail, '<a class="nw__email" href="mailto:ankurmeena194@gmail.com">ankurmeena194@gmail.com</a>') +
        CROW(ICON.linkedin, '<a class="nw__email" href="https://www.linkedin.com/in/ankur-meena/" target="_blank" rel="noopener">linkedin.com/in/ankur-meena</a>') +
        CROW(ICON.pin, '<a class="nw__email" href="tel:+916377683376">+91-6377683376</a>') +
      "</div>",
  };
  const TABS = Object.keys(CONTENT);

  // Plain-text index of every note, built once at load. The iOS App Library
  // search matches against this, so "experience" or "aws" finds the note that
  // actually mentions it rather than only the ones with it in the title.
  const NOTE_TEXT = {};
  TABS.forEach((n) => {
    const d = document.createElement("div");
    d.innerHTML = CONTENT[n] || "";
    NOTE_TEXT[n] = (n + " " + (d.textContent || "")).toLowerCase();
  });

  function open(originEl, intent) {
    const sRect = screen.getBoundingClientRect();
    const w = (originEl || widget).getBoundingClientRect();
    const ox = w.left + w.width / 2 - sRect.left;
    const oy = w.top + w.height / 2 - sRect.top;

    const modal = document.createElement("div");
    modal.className = "winmodal";
    const backdrop = document.createElement("div");
    backdrop.className = "winmodal__backdrop";
    const win = document.createElement("div");
    win.className = "noteswin";
    win.style.transformOrigin = ox + "px " + oy + "px";
    // traffic-light glyphs (shown on hover, macOS-style)
    const G_CLOSE = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
    const G_MIN = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
    const G_EXPAND = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
    const G_COLLAPSE = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';
    win.innerHTML =
      '<aside class="nw__sidebar">' +
        '<div class="nw__side-top">' +
          '<div class="nw__lights">' +
            '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
            '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
            '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
          "</div>" +
        "</div>" +
        '<ul class="nw__folders">' +
          TABS.map((n, i) =>
            '<li class="nw__folder' + (i === 0 ? " nw__folder--active" : "") + '">' +
            '<span class="nw__fic">' + (TABIC[n] || ICON.folder) + "</span>" +
            '<span class="nw__fic nw__fic--fill">' + (TABIC_FILL[n] || ICON.folder) + "</span>" +
            '<span class="nw__fname">' + n + "</span>" +
            '<span class="nw__fname nw__fname--short">' + (TAB_SHORT[n] || n) + "</span></li>"
          ).join("") +
        "</ul>" +
      "</aside>" +
      '<section class="nw__main">' +
        '<header class="nw__toolbar">' +
          '<div class="nw__title"><div class="nw__title-main">All on My Mac</div><div class="nw__title-sub">8 notes</div></div>' +
          '<button class="nw__circ" aria-label="Share">' + ICON.share + "</button>" +
          '<div class="nw__search">' + ICON.search +
            '<input class="nw__search-in" type="search" placeholder="Search" aria-label="Search notes">' +
          "</div>" +
        "</header>" +
        '<div class="nw__content"></div>' +
      "</section>";

    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    function close() {
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", outsideShare);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("noteswin--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      minBtn.disabled = isMax;
    });
    const backBtn = win.querySelector(".nw__back");
    if (backBtn) backBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    // share → "Copy Link" popover
    const shareBtn = win.querySelector('.nw__circ[aria-label="Share"]');
    let sharePop = null;
    function outsideShare(e) {
      if (sharePop && !sharePop.contains(e.target) && !shareBtn.contains(e.target)) closeShare();
    }
    function closeShare() {
      if (!sharePop) return;
      sharePop.remove();
      sharePop = null;
      document.removeEventListener("click", outsideShare);
    }
    shareBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (sharePop) return closeShare();
      sharePop = document.createElement("div");
      sharePop.className = "nw__share-pop";
      sharePop.innerHTML =
        '<div class="nw__share-title">Copy Link</div>' +
        '<button class="nw__share-row" type="button">' +
          '<span class="nw__share-url">' + PORTFOLIO_URL + "</span>" +
          '<span class="nw__share-copy">' + ICON.copy + "</span>" +
        "</button>";
      win.appendChild(sharePop);
      const wr = win.getBoundingClientRect();
      const br = shareBtn.getBoundingClientRect();
      sharePop.style.top = br.bottom - wr.top + 8 + "px";
      sharePop.style.left = Math.max(8, br.right - wr.left - 300) + "px";
      requestAnimationFrame(() => sharePop.classList.add("nw__share-pop--show"));
      sharePop.querySelector(".nw__share-row").addEventListener("click", () => {
        if (navigator.clipboard) navigator.clipboard.writeText(PORTFOLIO_URL).catch(() => {});
        sharePop.querySelector(".nw__share-title").textContent = "Link Copied!";
        setTimeout(closeShare, 950);
      });
      setTimeout(() => document.addEventListener("click", outsideShare), 0);
    });

    // clickable tabs → swap note content
    const folders = win.querySelectorAll(".nw__folder");
    const contentEl = win.querySelector(".nw__content");
    const titleMain = win.querySelector(".nw__title-main");
    const titleSub = win.querySelector(".nw__title-sub");
    function selectTab(fEl) {
      folders.forEach((f) => f.classList.remove("nw__folder--active"));
      fEl.classList.add("nw__folder--active");
      const name = fEl.querySelector(".nw__fname").textContent;
      titleMain.textContent = name;
      titleSub.textContent = "";
      contentEl.innerHTML =
        '<div class="nw__doc"><div class="nw__date">' + stamp() + "</div>" +
        (CONTENT[name] || "") + "</div>";
      contentEl.scrollTop = 0;
    }
    folders.forEach((f) => f.addEventListener("click", () => selectTab(f)));
    // `intent` lets a caller (the iOS search) land straight on one note
    const wanted = intent && intent.tab
      ? [...folders].find((f) => f.querySelector(".nw__fname").textContent === intent.tab)
      : null;
    selectTab(wanted || folders[0]);

    // ---- search: filter the folder list by name *and* note text ----
    const searchIn = win.querySelector(".nw__search-in");
    const strip = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      return (d.textContent || "").toLowerCase();
    };
    // built once — the note bodies never change while the window is open
    const noteText = {};
    TABS.forEach((n) => (noteText[n] = (n + " " + strip(CONTENT[n] || "")).toLowerCase()));

    function runSearch() {
      const q = searchIn.value.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      let firstHit = null;
      let hits = 0;
      folders.forEach((f) => {
        const name = f.querySelector(".nw__fname").textContent;
        const hit = !words.length || words.every((w) => noteText[name].indexOf(w) !== -1);
        f.style.display = hit ? "" : "none";
        if (hit) {
          hits++;
          if (!firstHit) firstHit = f;
        }
      });
      if (!words.length) {
        titleSub.textContent = "";
        return;
      }
      // if what you were reading got filtered out, jump to the first match
      const active = [...folders].find((f) => f.classList.contains("nw__folder--active"));
      if (firstHit && (!active || active.style.display === "none")) selectTab(firstHit);
      // after selectTab, which clears the subtitle itself
      titleSub.textContent = hits + (hits === 1 ? " note" : " notes");
      if (!hits) {
        contentEl.innerHTML =
          '<div class="nw__doc"><p class="nw__empty">No notes match &ldquo;' +
          searchIn.value.replace(/[<>&]/g, "") + "&rdquo;</p></div>";
      }
    }

    searchIn.addEventListener("input", runSearch);
    searchIn.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && searchIn.value) {
        e.stopPropagation(); // clear the box before the window will close
        searchIn.value = "";
        runSearch();
      }
    });
  }

  window.PortfolioNotes = {
    tabs: TABS,
    text: NOTE_TEXT,
    open: (originEl, tab) => open(originEl || widget, tab ? { tab: tab } : null),
  };

  widget.style.cursor = "pointer";
  widget.addEventListener("click", () => open(widget));

  // dock "About Me" (Notes) icon opens the same window, zooming from the dock
  const dockNotes = document.querySelector(".dock__app--notes");
  if (dockNotes) {
    dockNotes.style.cursor = "pointer";
    dockNotes.addEventListener("click", (e) => {
      e.preventDefault();
      open(dockNotes);
    });
  }
})();

/* ===================== PROJECTS → FINDER WINDOW ===================== */
(function () {
  const trigger = document.querySelector(".dock__app--finder");
  const screen = document.querySelector(".screen");
  if (!trigger || !screen) return;

  const S = (b) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + b + "</svg>";
  const I = {
    recents: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    shared: S('<path d="M3 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="9" cy="12.5" r="1.5"/><path d="M6.2 16.5c.4-1.3 1.5-2 2.8-2s2.4.7 2.8 2"/>'),
    apps: S('<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 15.3 7.2 17.8l.9-5.3L4.2 8.7l5.4-.8z"/>'),
    doc: S('<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/>'),
    desktop: S('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6M12 17v4"/>'),
    downloads: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 8v6m0 0l-2.6-2.6M12 14l2.6-2.6"/>'),
    icloud: S('<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 18z"/>'),
    home: S('<path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/>'),
    airdrop: S('<path d="M7.5 13.5a6 6 0 0 1 9 0"/><path d="M10 11a3 3 0 0 1 4 0"/><circle cx="12" cy="18" r="1.1"/>'),
    network: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.3 4 5.3 4 8.5s-1.5 6.2-4 8.5c-2.5-2.3-4-5.3-4-8.5s1.5-6.2 4-8.5z"/>'),
    bin: S('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13"/>'),
    tags: S('<path d="M4 5.5h6.5l8.5 8.5-6.5 6.5L4 12z"/><circle cx="8.3" cy="9" r="1.2" fill="currentColor" stroke="none"/>'),
    star: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 22l-5.2-2.4 1-5.8L3.5 9.7l5.9-.9z"/>'),
    grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    briefcase: S('<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5"/><path d="M3 12h18"/>'),
    robot: S('<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 4.5V8"/><circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none"/><circle cx="9.5" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13" r="1.1" fill="currentColor" stroke="none"/>'),
    layers: S('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/>'),
    phone: S('<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M10.5 18h3"/>'),
    web: S('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 8.5h18"/><circle cx="6" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="8" cy="6.5" r="0.6" fill="currentColor" stroke="none"/>'),
    // design categories: a card for fintech, a folded map, a graduation cap
    fintech: S('<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M3 9.8h18"/><path d="M6.8 14.6h4.2"/>'),
    map: S('<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>'),
    edtech: S('<path d="M12 4.5 22 9.5l-10 5-10-5z"/><path d="M6 11.6V16c0 1.6 2.7 2.9 6 2.9s6-1.3 6-2.9v-4.4"/><path d="M22 9.5v5"/>'),
    book: S('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>'),
  };
  const T = {
    back: S('<path d="M15 6l-6 6 6 6"/>'),
    fwd: S('<path d="M9 6l6 6-6 6"/>'),
    grid: S('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    list: S('<circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none"/><path d="M8 6h12M8 12h12M8 18h12"/>'),
    columns: S('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>'),
    gallery: S('<rect x="3.5" y="4" width="17" height="10.5" rx="2"/><path d="M6 18h3M11 18h2.5M16 18h2"/>'),
    group: S('<rect x="3" y="4.5" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><path d="M11 6h9M11 8.5h6M11 13.5h9M11 16h6"/>'),
    chev: S('<path d="M6 9l6 6 6-6"/>'),
    share: S('<path d="M12 3.5v11"/><path d="M8 7l4-4 4 4"/><path d="M6 12v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7"/>'),
    tag: S('<path d="M4 5.5h6.5l8.5 8.5-6.5 6.5L4 12z"/><circle cx="8.3" cy="9" r="1.2" fill="currentColor" stroke="none"/>'),
    more: S('<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
    search: S('<circle cx="10" cy="10" r="6"/><line x1="14.5" y1="14.5" x2="20" y2="20"/>'),
  };
  const FOLDER =
    '<svg viewBox="0 0 80 64" class="fw__folder-svg" aria-hidden="true">' +
    '<defs><linearGradient id="fwBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd2ff"/><stop offset="1" stop-color="#49a7f5"/></linearGradient>' +
    '<linearGradient id="fwFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#addcff"/><stop offset="1" stop-color="#5cb4f7"/></linearGradient></defs>' +
    '<path d="M4 12a4 4 0 0 1 4-4h18l6 6h36a4 4 0 0 1 4 4v4H4z" fill="url(#fwBack)"/>' +
    '<path d="M4 17h72a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="url(#fwFront)"/></svg>';

  const FI = (b) => '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic-fill">' + b + "</svg>";
  // filled twins for the mobile tab bar; the desktop sidebar keeps the outlines
  const IFILL = {
    all: FI('<path fill-rule="evenodd" d="M12 2.2a9.8 9.8 0 1 1 0 19.6 9.8 9.8 0 0 1 0-19.6zm1 4.4a1 1 0 1 0-2 0V12c0 .35.18.67.47.85l3.6 2.25a1 1 0 1 0 1.06-1.7L13 11.44z"/>'),
    featured: FI('<rect x="3" y="3" width="8" height="8" rx="2.3"/><rect x="13" y="3" width="8" height="8" rx="2.3"/><rect x="3" y="13" width="8" height="8" rx="2.3"/><rect x="13" y="13" width="8" height="8" rx="2.3"/>'),
    ai: FI('<circle cx="12" cy="3.4" r="1.5"/><rect x="11.2" y="4.4" width="1.6" height="3.4"/><path fill-rule="evenodd" d="M4.4 10.6a2.8 2.8 0 0 1 2.8-2.8h9.6a2.8 2.8 0 0 1 2.8 2.8v6.2a2.8 2.8 0 0 1-2.8 2.8H7.2a2.8 2.8 0 0 1-2.8-2.8zm5.2 2a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zm4.8 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>'),
    devops: FI('<path d="M12 2.6 22.2 8.4 12 14.2 1.8 8.4z"/><path d="M3.6 12.1 1.8 13.1 12 18.9l10.2-5.8-1.8-1z"/><path d="M3.6 16.1 1.8 17.1 12 22.9l10.2-5.8-1.8-1z"/>'),
    mobile: FI('<path fill-rule="evenodd" d="M6.4 4.6A2.4 2.4 0 0 1 8.8 2.2h6.4a2.4 2.4 0 0 1 2.4 2.4v14.8a2.4 2.4 0 0 1-2.4 2.4H8.8a2.4 2.4 0 0 1-2.4-2.4zm3.7 13.2h3.8a.9.9 0 0 1 0 1.8h-3.8a.9.9 0 0 1 0-1.8z"/>'),
    web: FI('<path fill-rule="evenodd" d="M2.4 6.6A2.6 2.6 0 0 1 5 4h14a2.6 2.6 0 0 1 2.6 2.6v10.8A2.6 2.6 0 0 1 19 20H5a2.6 2.6 0 0 1-2.6-2.6zm2 2.4v8.4c0 .33.27.6.6.6h14a.6.6 0 0 0 .6-.6V9zm1.8-2.6a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm2.3 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"/>'),
  };
  // the sidebar and page titles keep the full names; the tab bar shows these,
  // so nothing has to truncate mid-word
  const SHORT = {
    featured: "Live",
    ai: "Figma",
  };
  const item = (icon, label, cls, group) =>
    '<div class="fw__item' + (cls ? " " + cls : "") + '"' +
    (group ? ' data-group="' + group + '"' : "") + ">" +
    '<span class="fw__item-ic">' + icon + "</span>" +
    '<span class="fw__item-ic fw__item-ic--fill">' + (IFILL[group] || icon) + "</span>" +
    '<span class="fw__item-label">' + label + "</span>" +
    '<span class="fw__item-label fw__item-label--short">' + (SHORT[group] || label) + "</span></div>";
  const tag = (color, label) =>
    '<div class="fw__item"><span class="fw__tagdot" style="background:' + color + '"></span>' +
    '<span class="fw__item-label">' + label + "</span></div>";
  const tile = (name) =>
    '<div class="fw__tile">' + FOLDER + '<span class="fw__tile-label">' + name + "</span></div>";

  // ---- project cards ----
  const M = {
    mon: S('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'),
    cal: S('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/>'),
    stack: S('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
    star: S('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 22l-5.2-2.4 1-5.8L3.5 9.7l5.9-.9z"/>'),
    more: S('<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
  };
  // outlined like every other glyph in this window — it keeps the blue so the
  // card still reads as a folder, but drawn as a line rather than a solid tile
  const MINIFOLDER =
    '<svg class="pj__folder" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
    'stroke="#4aa8f5" stroke-width="1.6" stroke-linejoin="round">' +
    '<path d="M3 8a2 2 0 0 1 2-2h3.4l1.7 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  const AVATAR =
    '<svg class="pj__feat-svg" viewBox="0 0 80 90" aria-hidden="true"><rect width="80" height="90" rx="10" fill="#dfe1e6"/><circle cx="40" cy="33" r="15" fill="#b9bcc4"/><path d="M13 84c2.5-16 14-24 27-24s24.5 8 27 24z" fill="#b9bcc4"/></svg>';
  const MOCK = (theme) => {
    const c = theme === "dark" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.75)";
    return (
      '<svg class="pj__mock" viewBox="0 0 320 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<rect x="10" y="10" width="46" height="150" rx="8" fill="' + c + '"/>' +
      '<rect x="66" y="12" width="244" height="15" rx="5" fill="' + c + '"/>' +
      '<rect x="66" y="36" width="76" height="50" rx="8" fill="' + c + '"/>' +
      '<rect x="150" y="36" width="76" height="50" rx="8" fill="' + c + '"/>' +
      '<rect x="234" y="36" width="76" height="50" rx="8" fill="' + c + '"/>' +
      '<rect x="66" y="94" width="158" height="66" rx="8" fill="' + c + '"/>' +
      '<rect x="232" y="94" width="78" height="66" rx="8" fill="' + c + '"/>' +
      "</svg>"
    );
  };

  const PROJECTS = [
    // ---- Live projects ----
    { group: "featured", title: "Quotient", cat: "Hiring Platform", url: "https://nexus-ahse-psi.vercel.app/", desktopOnly: true, poster: "Quotient.png", badge: "Live", bc: "live", tags: [["Web Design", "blue"], ["Dashboard", "purple"]], mi: "stack", mt: "~25% Task Completion", yr: "2025 – 2026",
      desc: "Multi-step hiring journeys for EquiTrust's Quotient platform, from candidate onboarding and profile creation to job workflows and recruiter interactions.",
      stack: ["User Journeys", "User Research", "Wireframing", "User Flows", "High-Fidelity Prototyping", "Design Systems"],
      highlights: ["Designed and optimized multi-step user journeys covering candidate onboarding, profile creation, job workflows, and recruiter interactions", "Conducted structured user research with 30+ participants in 2-week cycles, improving task completion rates by ~25% across hiring and internal workflows", "Built and scaled reusable design system components across hiring and insurance products, reducing design-to-development turnaround time by ~35%"] },
    { group: "featured", title: "Employee Portal", cat: "iConnect", url: "https://employee-portal-seven-delta.vercel.app/", desktopOnly: true, poster: "Employee%20Portal.png", badge: "Live", bc: "live", tags: [["Employee Management", "purple"], ["Web App", "blue"]],
      desc: "An employee portal for Ensylon, live as iConnect." },
    { group: "featured", title: "Nexus", cat: "Platform Dashboard · Nexus Party", url: "https://nexus-phi-gilt.vercel.app/", desktopOnly: true, poster: "nexus.png", badge: "Live", bc: "live", tags: [["Dashboard", "teal"], ["Web App", "blue"]],
      desc: "A platform dashboard for Nexus Party." },
    { group: "featured", title: "Oolook", cat: "AI Creative Studio & Social Manager", url: "https://oolook.in/", poster: "Oolook.png", badge: "Live", bc: "live", tags: [["UI/UX", "blue"], ["Responsive Web/Mobile", "green"]], mi: "mon", mt: "15–20% Satisfaction", yr: "2023 – 2025",
      desc: "An AI platform for creators and marketing teams to generate content, schedule posts, and track analytics, with end-to-end web and mobile experiences from onboarding to key feature interactions.",
      stack: ["Information Architecture", "Interaction Design", "Usability Testing", "High-Fidelity Prototyping"],
      highlights: ["Designed end-to-end user experiences across web and mobile platforms, structuring core user journeys from onboarding to key feature interactions", "Created scalable information architecture and interaction models, improving task completion rates by ~25% across primary user flows", "Conducted usability testing and iterative design improvements, increasing user satisfaction by 15-20% based on feedback and usage patterns", "Delivered high-fidelity prototypes and developer-ready specifications, reducing ambiguity during implementation and improving delivery speed"] },
    { group: "featured", title: "Chez Suzette", cat: "Restaurant Website", url: "https://www.chezsuzette.sg/", badge: "Live", bc: "live", tags: [["Responsive Web/Mobile", "blue"], ["Restaurant", "orange"]],
      desc: "A restaurant website for Chez Suzette, a caf\u00e9, restaurant and wine bar in Singapore, with the menu, gallery, reservations and contact information.",
      stack: ["Web Design"] },
    { group: "featured", title: "V.-R.", cat: "Architecture & Renovation Landing Page", url: "https://mehakwebsitedesign.wixsite.com/my-site", desktopOnly: true, badge: "Live", bc: "live", tags: [["Landing Page", "blue"], ["Wix", "gray"]],
      desc: "A landing page for V.-R., focused on forward-thinking architecture and home renovation.",
      stack: ["Landing Page", "Wix"] },
    { group: "featured", title: "GlobeFarer", cat: "Logistics Landing Page", url: "https://mehakwebsitedesign.wixsite.com/global", desktopOnly: true, badge: "Live", bc: "live", tags: [["Landing Page", "blue"], ["Wix", "gray"]],
      desc: "A landing page for GlobeFarer, a logistics platform covering warehousing, distribution, customs clearance, value-added services and freight forwarding.",
      stack: ["Landing Page", "Wix"] },

    // ---- Figma files ----
    { group: "ai", title: "Daily News App", cat: "News App · Figma", url: "https://www.figma.com/design/65RtEEqPhD6Q6Cozb2E6ux/Inshorts-Assignemt?node-id=0-1&t=L07rNzKORvdFp4eY-1", linkLabel: "Open in Figma", caseStudy: "Daily%20News%20App.pdf", badge: "Figma", bc: "case", tags: [["Mobile UI", "blue"], ["Web UI", "purple"]],
      desc: "A daily news app design with Mobile UI and Web UI screens, shared as a Figma file.",
      stack: ["Figma", "Mobile UI", "Web UI"] },
    { group: "ai", title: "Retail App UI", cat: "Retail App · Figma", url: "https://www.figma.com/design/rlbUbTkCsNntza53gCecmm/Infinite-Locus-Assignment?node-id=0-1&t=L07rNzKORvdFp4eY-1", linkLabel: "Open in Figma", caseStudy: "Retail%20App%20UI.pdf", badge: "Figma", bc: "case", tags: [["Figma", "purple"], ["Retail", "blue"]],
      desc: "A retail app UI design, shared as a Figma file.",
      stack: ["Figma"] },
    { group: "ai", title: "Design System", cat: "Figma Design File", url: "https://www.figma.com/design/JHHs3nV0rlb9imNmoIW58U/Design-system?t=L07rNzKORvdFp4eY-1", linkLabel: "Open in Figma", linkOnly: true, badge: "Figma", bc: "case", tags: [["Design Systems", "purple"], ["Figma", "blue"]],
      desc: "A design system, shared as a Figma file.",
      stack: ["Figma", "Design Systems"] },
    { group: "ai", title: "Power BI Dashboard", cat: "Figma Design File", url: "https://www.figma.com/design/me6QhfuomxhmnkibMAxNqm/Power-BI-dashboard?node-id=0-1&t=L07rNzKORvdFp4eY-1", linkLabel: "Open in Figma", caseStudy: "Power%20BI%20dashboard.pdf", badge: "Figma", bc: "case", tags: [["Dashboard", "teal"], ["Power BI", "orange"]],
      desc: "A Power BI dashboard design, shared as a Figma file.",
      stack: ["Figma", "Dashboard Design"] },
    { group: "ai", title: "Security Rule Engine UI", cat: "Figma Design File", url: "https://www.figma.com/design/f64ZWmQ3VwMEDbhIETnvfB/Create-Security-rule-engine-UI?node-id=0-1&t=L07rNzKORvdFp4eY-1", linkLabel: "Open in Figma", caseStudy: "Create%20Security%20rule%20engine%20UI.pdf", badge: "Figma", bc: "case", tags: [["Security", "gray"], ["Rule Engine", "blue"]],
      desc: "A UI for creating security rules in a rule engine, shared as a Figma file.",
      stack: ["Figma"] },
    { group: "ai", title: "Truck Logistics Web/App UI", cat: "Figma Design File", url: "https://www.figma.com/design/S3hU96qqifE3A5L6yseRdL/Truck-logistics-Web-App-UI?node-id=0-1&t=L07rNzKORvdFp4eY-1", linkLabel: "Open in Figma", linkOnly: true, badge: "Figma", bc: "case", tags: [["Logistics", "orange"], ["Figma", "purple"]],
      desc: "A truck logistics web and app UI design, shared as a Figma file.",
      stack: ["Figma"] },
    { group: "ai", title: "SupperTiffin", cat: "Food Subscription App", url: "https://www.figma.com/file/fV6v8XBN69cnm3mlW5RUV7/SupperTiffins?type=design&node-id=240%3A59&mode=design&t=CBLUvLyjyFZU7PoF-1", linkLabel: "Open in Figma", caseStudy: "https://ankurmeena.notion.site/Case-Study-SupperTiffin-A-Food-Subscription-App-eb09402e5c5e4837be2d10b377e85a46", badge: "Figma", bc: "case", tags: [["UX Research", "blue"], ["Food Subscription", "orange"]],
      desc: "A product design case study for a food subscription app that lets people discover, schedule and subscribe to home-style tiffin meals.",
      stack: ["Secondary Research", "User Interviews", "User Persona", "Competitor Analysis", "User Flow", "Wireframing", "Interface Design"],
      highlights: ["Secondary and primary research, including user interviews, a user persona and affinity mapping to identify pain points", "Competitor analysis and ideation, leading to location-based kitchen discovery", "Architecture and user flow, wireframes, and interface design for meals, restaurant pages, plan selection, delivery slots and subscription management"] },
    { group: "ai", title: "GolfTraxx", cat: "Golf App", url: "https://www.figma.com/file/RlW96aVMM7huhynjouf6FI/GolfTraxx?type=design&node-id=106%3A8&mode=design&t=GyprBxRElI81hhuM-1", linkLabel: "Open in Figma", caseStudy: "https://ankurmeena.notion.site/Case-Study-GolfTraxx-Revolutionizing-Golfing-Experience-71a2b62ca62c4bc2a2453a858627af0a", badge: "Figma", bc: "case", tags: [["Design Thinking", "purple"], ["UX Research", "blue"]],
      desc: "A case study for an app that helps golfers with course information, game statistics tracking and playing in groups with friends.",
      stack: ["Research", "Competitor Analysis", "Affinity Mapping", "Persona", "Storyboard", "User Flow", "Wireframing", "Interface Design"],
      highlights: ["Empathise and define: research, competitor review, problem statement, affinity mapping, persona and storyboard", "Ideate: user flow, wireframing and interface design, following the design thinking method", "Covers detailed course information from a database of 40,000+ golf courses, game statistics tracking, and group play"] },
    { group: "ai", title: "Blue Infinity", cat: "Web Solutions Website", url: "https://www.figma.com/file/2b6SLGvM7hWMF2NMzwxRr0/Blue-i?type=design&node-id=16%3A35&mode=design&t=TdEs7s6KMKn08tBN-1", linkLabel: "Open in Figma", caseStudy: "https://ankurmeena.notion.site/Blue-Infinity-Elevate-Your-Digital-Presence-a90b68e2fc3247d995c62d704013f87d", badge: "Figma", bc: "case", tags: [["Web Design", "blue"], ["Figma", "purple"]],
      desc: "A website design for Blue Infinity, a web solutions team covering planning, design, development, testing and delivery.",
      stack: ["Web Design", "Figma"] },
    { group: "ai", title: "AUGMEE", cat: "Augmented Reality Dining App", url: "https://www.figma.com/file/pTLwwK8ZUD5TlRp0nWjbuL/AUGMEE?type=design&node-id=158%3A98&mode=design&t=VoAPJSQ6Sl89hAKp-1", linkLabel: "Open in Figma", caseStudy: "https://ankurmeena.notion.site/AUGMEE-Elevate-Your-Dining-Experience-with-Augmented-Reality-1a23a3c158a04ddda268bc23ec083154", badge: "Figma", bc: "case", tags: [["AR", "purple"], ["Prototype", "teal"]],
      desc: "A dining app to scan a restaurant's menu, browse categories, nearby options and the latest trends, and explore dishes through an AR menu.",
      stack: ["Prototyping", "Figma"] },
    { group: "ai", title: "FFV Fast Delivery", cat: "Grocery Delivery App", url: "https://www.figma.com/file/2v4TCBvY8bsm3kVkzTwAOy/Grocery---app?type=design&node-id=354%3A2&mode=design&t=u7S8qExh4PVRvwk3-1", linkLabel: "Open in Figma", caseStudy: "https://ankurmeena.notion.site/FFV-Fast-Delivery-Quality-On-Time-Free-Returns-a317ba9d693a43faa8788cca6e64ff64", badge: "Figma", bc: "case", tags: [["App Design", "green"], ["Figma", "purple"]],
      desc: "A grocery delivery app design built around guaranteed quality, on-time delivery and free, hassle-free returns.",
      stack: ["App Design", "Figma"] },
  ];

  // Recents deals Live and Figma work alternately, so neither kind is buried
  // below the other
  const RECENTS = (() => {
    const live = PROJECTS.filter((p) => p.group === "featured");
    const rest = PROJECTS.filter((p) => p.group !== "featured");
    const out = [];
    for (let i = 0; i < Math.max(live.length, rest.length); i++) {
      if (live[i]) out.push(live[i]);
      if (rest[i]) out.push(rest[i]);
    }
    return out;
  })();

  // the Featured Projects widget renders from this same list
  window.PortfolioProjects = PROJECTS;

  // gradient headers for the detail page of imageless projects
  const GROUP_GRAD = {
    ai: "linear-gradient(135deg,#3a2b6e,#7c3aed)",
    devops: "linear-gradient(135deg,#12212e,#1f6f8b)",
    mobile: "linear-gradient(135deg,#1b4d2f,#2f9d5a)",
    web: "linear-gradient(135deg,#1b2a6e,#4059d0)",
    featured: "linear-gradient(135deg,#1f2a44,#3b5bdb)",
  };
  // the home widget paints image-less featured work with these same colours
  window.PortfolioGroupGrad = GROUP_GRAD;

  // the Figma mark, shown in place of the "Figma" badge text
  const FIGMA_LOGO = '<svg class="pj__logo" viewBox="0 0 38 57" aria-hidden="true">' +
    '<path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>' +
    '<path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/>' +
    '<path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/>' +
    '<path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/>' +
    '<path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/></svg>';
  // one badge builder for cards and detail pages; Figma projects get the logo
  const badge = (p, cls) => p.badge === "Figma"
    ? '<span class="' + cls + ' pj__badge--logo" role="img" aria-label="Figma" title="Figma">' + FIGMA_LOGO + "</span>"
    : '<span class="' + cls + ' pj__badge--' + p.bc + '">' + p.badge + "</span>";

  // arrow glyph for the "View Details" action — same stroke and size as EXT
  const ARROW = '<svg class="pj__extic" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

  // external-link glyph for the "Live Site" action
  const EXT = '<svg class="pj__extic" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/>' +
    '<path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>';

  function card(p, i) {
    const tags = p.tags
      .map((t) => '<span class="pj__tag pj__tag--' + t[1] + '">' + t[0] + "</span>")
      .join("");
    // only Featured projects show an image; others are clean info cards
    const thumb = p.img
      // a screenshot fills the frame; a logo (fit: contain) sits whole on its own colour
      ? '<div class="pj__thumb" style="background:' + (p.bg ? p.bg + " " : "") + "url('" + p.img + "') " + (p.pos || "center") + " / " + (p.fit || "cover") + ' no-repeat">' +
          badge(p, "pj__badge") + "</div>"
      : "";
    // The card is no longer one big link. The two actions that matter are on it
    // directly, so nothing important hides behind a menu.
    return (
      '<div class="pj" data-i="' + i + '">' + thumb +
        '<div class="pj__body">' +
          '<div class="pj__row">' + MINIFOLDER +
            '<span class="pj__title">' + p.title + "</span>" +
            (p.img ? "" : badge(p, "pj__badge-inline")) +
          "</div>" +
          '<div class="pj__cat">' + p.cat + "</div>" +
          '<div class="pj__tags">' + tags + "</div>" +
          // with no Live Site beside it, View Details sits alone at the right edge
          '<div class="pj__actions' + (p.url && !p.linkOnly ? "" : " pj__actions--solo") + '">' +
            // link-only projects show just their link; a project with a written case
            // study opens it directly; the rest open their detail page
            (p.linkOnly ? "" : p.caseStudy
              ? '<a class="pj__act pj__act--primary" href="' + p.caseStudy + '" target="_blank" rel="noopener">View Case Study' + ARROW + "</a>"
              : '<button class="pj__act pj__act--primary" type="button" data-act="details">' + (p.detailsLabel || "View Details") + ARROW + "</button>") +
            // no live URL: don't invent a second label (several of these are
            // badged "Live" already)
            (p.url
              ? '<a class="pj__act pj__act--ghost" href="' + p.url + '" target="_blank" rel="noopener">' + (p.linkLabel || "Live Site") + EXT + "</a>"
              : "") +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  // full detail "page" shown when a card's "View Details" is chosen
  function detailHTML(p) {
    const chips = (p.stack || [])
      .map((s) => '<span class="pj__chip">' + s + "</span>")
      .join("");
    const hl = (p.highlights || [])
      .map((h) => "<li>" + h + "</li>")
      .join("");
    return (
      '<div class="pjd">' +
        '<div class="pjd__info">' +
          '<div class="pjd__head"><h2 class="pjd__title">' + p.title + "</h2>" +
            badge(p, "pj__badge-inline") + "</div>" +
          '<div class="pjd__cat">' + p.cat + "</div>" +
          (p.desc ? '<p class="pjd__desc">' + p.desc + "</p>" : "") +
          (chips ? '<div class="pj__dlabel">Skills &amp; Methods</div><div class="pj__stack">' + chips + "</div>" : "") +
          (hl ? '<div class="pj__dlabel">What I did</div><ul class="pj__hl">' + hl + "</ul>" : "") +
          '<div class="pjd__foot">' +
            (p.mt ? '<span class="pjd__meta-item">' + (M[p.mi] || "") + p.mt + "</span>" : "") +
            (p.yr ? '<span class="pjd__meta-item">' + M.cal + p.yr + "</span>" : "") +
            (p.caseStudy ? '<a class="pjd__visit" href="' + p.caseStudy + '" target="_blank" rel="noopener">View Case Study ↗</a>' : "") +
            (p.url ? '<a class="pjd__visit' + (p.caseStudy ? " pjd__visit--more" : "") + '" href="' + p.url + '" target="_blank" rel="noopener">' + (p.linkLabel || "Visit Live Site") + " ↗</a>" : "") +
            (p.design ? '<a class="pjd__visit pjd__visit--more" href="' + p.design + '" target="_blank" rel="noopener">' + (p.designLabel || "Open Design") + " ↗</a>" : "") +
            (p.live ? '<a class="pjd__visit pjd__visit--more" href="' + p.live + '" target="_blank" rel="noopener">Visit Live Site ↗</a>' : "") +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function open(originEl, intent) {
    const sRect = screen.getBoundingClientRect();
    const r = (originEl || trigger).getBoundingClientRect();
    const ox = r.left + r.width / 2 - sRect.left;
    const oy = r.top + r.height / 2 - sRect.top;

    const modal = document.createElement("div");
    modal.className = "winmodal";
    const backdrop = document.createElement("div");
    backdrop.className = "winmodal__backdrop";
    const win = document.createElement("div");
    win.className = "finderwin";
    win.style.transformOrigin = ox + "px " + oy + "px";
    // traffic-light glyphs (shown on hover, macOS-style)
    const G_CLOSE = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
    const G_MIN = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
    const G_EXPAND = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
    const G_COLLAPSE = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';
    win.innerHTML =
      '<aside class="fw__sidebar">' +
        '<div class="fw__side-top"><div class="winmodal__lights">' +
          '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
          '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
          '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
        "</div></div>" +
        '<div class="fw__list">' +
          item(I.recents, "Recents", "fw__item--active", "all") +
          '<div class="fw__section">Portfolio</div>' +
          item(I.grid, "Live Projects", "", "featured") +
          item(I.doc, "Figma Files", "", "ai") +
        "</div></aside>" +
      '<section class="fw__main">' +
        '<header class="fw__toolbar">' +
          '<button class="fw__back" style="display:none" aria-label="Back">' + T.back + "</button>" +
          '<div class="fw__titles"><div class="fw__title">Recents</div>' +
            '<div class="fw__subtitle">3 items</div></div>' +
          '<button class="nw__circ" aria-label="Share">' + T.share + "</button>" +
          '<div class="nw__search">' + T.search +
            '<input class="nw__search-in" type="search" placeholder="Search" aria-label="Search projects">' +
          "</div>" +
        "</header>" +
        '<div class="fw__grid fw__grid--projects">' +
          RECENTS.map(card).join("") +
        "</div>" +
        '<div class="fw__detail" style="display:none"></div>' +
        '<div class="fw__footer">3 items</div>' +
      "</section>";

    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    function close() {
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("finderwin--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      minBtn.disabled = isMax;
    });
    document.addEventListener("keydown", onKey);

    // share → "Copy Link" popover (copies the portfolio URL, same as About Me)
    const SHARE_URL = "https://ankurdbb-portfolio.vercel.app/";
    const COPY_ICON =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>';
    const shareBtn = win.querySelector('.nw__circ[aria-label="Share"]');
    if (shareBtn) {
      let sharePop = null;
      const closeShare = () => {
        if (!sharePop) return;
        sharePop.remove();
        sharePop = null;
        document.removeEventListener("click", outsideShare);
      };
      const outsideShare = (e) => {
        if (sharePop && !sharePop.contains(e.target) && !shareBtn.contains(e.target)) closeShare();
      };
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (sharePop) return closeShare();
        sharePop = document.createElement("div");
        sharePop.className = "nw__share-pop";
        sharePop.innerHTML =
          '<div class="nw__share-title">Copy Link</div>' +
          '<button class="nw__share-row" type="button">' +
            '<span class="nw__share-url">' + SHARE_URL + "</span>" +
            '<span class="nw__share-copy">' + COPY_ICON + "</span>" +
          "</button>";
        win.appendChild(sharePop);
        const wr = win.getBoundingClientRect();
        const br = shareBtn.getBoundingClientRect();
        sharePop.style.top = br.bottom - wr.top + 8 + "px";
        sharePop.style.left = Math.max(8, br.right - wr.left - 300) + "px";
        requestAnimationFrame(() => sharePop.classList.add("nw__share-pop--show"));
        sharePop.querySelector(".nw__share-row").addEventListener("click", () => {
          if (navigator.clipboard) navigator.clipboard.writeText(SHARE_URL).catch(() => {});
          sharePop.querySelector(".nw__share-title").textContent = "Link Copied!";
          setTimeout(closeShare, 950);
        });
        setTimeout(() => document.addEventListener("click", outsideShare), 0);
      });
    }

    // ---- sidebar filtering + ⋯ menu + detail drill-in ----
    const grid = win.querySelector(".fw__grid--projects");
    const detailEl = win.querySelector(".fw__detail");
    const backBtn = win.querySelector(".fw__back");
    const titleEl = win.querySelector(".fw__title");
    const subEl = win.querySelector(".fw__subtitle");
    const footEl = win.querySelector(".fw__footer");
    const navItems = [...win.querySelectorAll(".fw__item[data-group]")];
    const state = { group: "all", label: "Recents", list: RECENTS, query: "" };

    // everything worth typing about a project: name, category, blurb, stack, tags
    function haystack(p) {
      return [p.title, p.cat, p.desc, p.yr, p.badge, p.mt,
        (p.stack || []).join(" "),
        (p.tags || []).map((t) => t[0]).join(" ")].join(" ").toLowerCase();
    }
    function matches(p, q) {
      // every word must appear somewhere, so "node solar" narrows rather than widens
      return q.split(/\s+/).filter(Boolean).every((w) => haystack(p).indexOf(w) !== -1);
    }

    function renderGroup(group, label) {
      state.group = group;
      state.label = label;
      const inGroup = group === "all" ? RECENTS : PROJECTS.filter((p) => p.group === group);
      const q = state.query.trim().toLowerCase();
      state.list = q ? inGroup.filter((p) => matches(p, q)) : inGroup;
      grid.innerHTML = state.list.length
        ? state.list.map((p, i) => card(p, i)).join("")
        : '<div class="fw__empty">No projects match &ldquo;' +
          state.query.replace(/[<>&]/g, "") + '&rdquo;</div>';
      titleEl.textContent = q ? 'Search: "' + state.query + '"' : label;
      const n = state.list.length;
      const count = n + (n === 1 ? " item" : " items");
      subEl.textContent = count;
      footEl.textContent = count;
      // back to the list view
      detailEl.style.display = "none";
      grid.style.display = "";
      footEl.style.display = "";
      backBtn.style.display = "none";
      grid.scrollTop = 0;
    }

    function showDetail(p) {
      detailEl.innerHTML = detailHTML(p);
      grid.style.display = "none";
      footEl.style.display = "none";
      detailEl.style.display = "block";
      backBtn.style.display = "inline-flex";
      titleEl.textContent = p.title;
      subEl.textContent = p.cat;
      detailEl.scrollTop = 0;
    }

    navItems.forEach((it) =>
      it.addEventListener("click", () => {
        navItems.forEach((x) => x.classList.remove("fw__item--active"));
        it.classList.add("fw__item--active");
        renderGroup(it.dataset.group, it.querySelector(".fw__item-label").textContent);
      })
    );
    backBtn.addEventListener("click", () => renderGroup(state.group, state.label));

    // ---- search ----
    const searchIn = win.querySelector(".nw__search-in");
    searchIn.addEventListener("input", () => {
      state.query = searchIn.value;
      renderGroup(state.group, state.label);
    });
    // Escape clears the box first, and only closes the window once it is empty
    searchIn.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && searchIn.value) {
        e.stopPropagation();
        searchIn.value = "";
        state.query = "";
        renderGroup(state.group, state.label);
      }
    });

    // "View Details" opens the detail page; "Live Site" is a plain link that
    // needs no JS at all.
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-act="details"]');
      if (!btn) return;
      e.preventDefault();
      const cardEl = btn.closest(".pj");
      const p = cardEl && state.list[+cardEl.dataset.i];
      if (p) showDetail(p);
    });

    // `intent` lets a caller (the iOS search) land on a group, a search term,
    // or one project's detail page instead of the default Recents listing
    const goto = (group) => {
      const it = navItems.find((x) => x.dataset.group === group);
      if (!it) return false;
      navItems.forEach((x) => x.classList.remove("fw__item--active"));
      it.classList.add("fw__item--active");
      renderGroup(group, it.querySelector(".fw__item-label").textContent);
      return true;
    };
    let handled = false;
    if (intent && intent.project) {
      const p = PROJECTS.find((x) => x.title === intent.project);
      if (p) {
        renderGroup("all", "Recents");
        showDetail(p);
        handled = true;
      }
    } else if (intent && intent.query) {
      searchIn.value = intent.query;
      state.query = intent.query;
      renderGroup("all", "Recents");
      handled = true;
    } else if (intent && intent.group) {
      handled = goto(intent.group);
    }
    if (!handled) renderGroup("all", "Recents");
  }

  window.PortfolioFinder = {
    open: (originEl, intent) => open(originEl || trigger, intent),
  };

  trigger.style.cursor = "pointer";
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    open(trigger);
  });

  // "View All Projects" button in the home widget opens the same window
  document.querySelectorAll(".pjw__viewall").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      open(btn);
    });
  });
})();

/* ===================== TOOLS MARQUEE ===================== */
(function () {
  const viewport = document.querySelector(".tools__viewport");
  if (!viewport) return;

  const LOGOS = [
    {
      name: "Figma",
      cls: "",
      svg:
        '<svg viewBox="0 0 38 57" aria-label="Figma">' +
        '<path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>' +
        '<path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/>' +
        '<path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z"/>' +
        '<path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"/>' +
        '<path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"/>' +
        "</svg>",
    },
    {
      name: "Adobe XD",
      cls: "tool--xd",
      svg:
        '<svg viewBox="0 0 48 48" aria-label="Adobe XD">' +
        '<rect width="48" height="48" rx="11" fill="#2e001f"/>' +
        '<text x="24" y="31" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#ff61f6">Xd</text>' +
        "</svg>",
    },
    {
      name: "Cursor",
      cls: "",
      svg:
        '<svg viewBox="0 0 40 40" aria-label="Cursor">' +
        '<path d="M20 3 L35 11.5 L20 20 L5 11.5 Z" fill="#cfcfcf"/>' +
        '<path d="M20 20 L35 11.5 L35 28.5 L20 37 Z" fill="#5a5a5a"/>' +
        '<path d="M20 20 L5 11.5 L5 28.5 L20 37 Z" fill="#1e1e1e"/>' +
        "</svg>",
    },
    {
      name: "Claude",
      cls: "",
      svg:
        '<svg viewBox="0 0 40 40" aria-label="Claude">' +
        '<g stroke="#d97757" stroke-width="3" stroke-linecap="round">' +
        '<line x1="20" y1="20" x2="20" y2="4"/><line x1="20" y1="20" x2="28" y2="6.1"/>' +
        '<line x1="20" y1="20" x2="33.9" y2="12"/><line x1="20" y1="20" x2="36" y2="20"/>' +
        '<line x1="20" y1="20" x2="33.9" y2="28"/><line x1="20" y1="20" x2="28" y2="33.9"/>' +
        '<line x1="20" y1="20" x2="20" y2="36"/><line x1="20" y1="20" x2="12" y2="33.9"/>' +
        '<line x1="20" y1="20" x2="6.1" y2="28"/><line x1="20" y1="20" x2="4" y2="20"/>' +
        '<line x1="20" y1="20" x2="6.1" y2="12"/><line x1="20" y1="20" x2="12" y2="6.1"/>' +
        "</g></svg>",
    },
    {
      name: "ChatGPT",
      cls: "",
      svg:
        '<svg viewBox="0 0 40 40" aria-label="ChatGPT">' +
        '<g fill="#10a37f">' +
        '<ellipse cx="20" cy="12" rx="6.2" ry="9.4"/>' +
        '<ellipse cx="20" cy="12" rx="6.2" ry="9.4" transform="rotate(60 20 20)"/>' +
        '<ellipse cx="20" cy="12" rx="6.2" ry="9.4" transform="rotate(120 20 20)"/>' +
        '<ellipse cx="20" cy="12" rx="6.2" ry="9.4" transform="rotate(180 20 20)"/>' +
        '<ellipse cx="20" cy="12" rx="6.2" ry="9.4" transform="rotate(240 20 20)"/>' +
        '<ellipse cx="20" cy="12" rx="6.2" ry="9.4" transform="rotate(300 20 20)"/>' +
        '</g><circle cx="20" cy="20" r="5.4" fill="#f7f7f8"/>' +
        "</svg>",
    },
    {
      name: "Stitch",
      cls: "",
      svg:
        '<svg viewBox="0 0 40 40" aria-label="Stitch">' +
        '<defs><linearGradient id="stitchGrad" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#4285f4"/><stop offset=".5" stop-color="#9b72cb"/>' +
        '<stop offset="1" stop-color="#d96570"/></linearGradient></defs>' +
        '<path d="M20 2 C21.2 12 28 18.8 38 20 C28 21.2 21.2 28 20 38 C18.8 28 12 21.2 2 20 C12 18.8 18.8 12 20 2 Z" fill="url(#stitchGrad)"/>' +
        "</svg>",
    },
    {
      name: "Sketch",
      cls: "tool--sketch",
      svg:
        '<svg viewBox="0 0 100 90" aria-label="Sketch">' +
        '<path d="M22 4 H78 L98 32 L50 88 L2 32 Z" fill="#fdb300"/>' +
        '<path d="M2 32 H98 L50 88 Z" fill="#ea6c00"/>' +
        '<path d="M22 4 L2 32 H37 Z" fill="#fdad00"/>' +
        '<path d="M78 4 L98 32 H63 Z" fill="#fdad00"/>' +
        '<path d="M22 4 H78 L63 32 H37 Z" fill="#feeeb7"/>' +
        "</svg>",
    },
    {
      name: "Framer",
      cls: "",
      svg:
        '<svg viewBox="0 0 24 24" aria-label="Framer">' +
        '<path fill="#0099ff" d="M4 0h16v8h-8zM4 8h8l8 8H4zM4 16h8v8z"/>' +
        "</svg>",
    },
  ];

  function chip(logo) {
    const c = document.createElement("span");
    c.className = "tool" + (logo.cls ? " " + logo.cls : "");
    c.title = logo.name;
    c.innerHTML = logo.svg;
    return c;
  }

  // single-row marquee: two identical sets → seamless loop
  viewport.innerHTML = "";
  const track = document.createElement("div");
  track.className = "tools__track";
  [0, 1].forEach(() => LOGOS.forEach((l) => track.appendChild(chip(l))));
  viewport.appendChild(track);
})();

/* ===================== DOCK HOVER TOOLTIPS ===================== */
(function () {
  const dock = document.querySelector(".dock");
  if (!dock) return;

  // class -> label mapping (in dock order)
  const TIPS = {
    "dock__app--spotify": "Spotify",
    "dock__app--finder": "Projects",
    "dock__app--notes": "About",
    "dock__app--acrobat": "Resume",
    "dock__app--mail": "Contact",
    "dock__app--linkedin": "LinkedIn",
  };

  const tip = document.createElement("div");
  tip.className = "dock__tooltip";
  dock.appendChild(tip);

  const labelFor = (app) => {
    const key = Object.keys(TIPS).find((c) => app.classList.contains(c));
    return key ? TIPS[key] : app.getAttribute("aria-label") || "";
  };
  const hide = () => tip.classList.remove("dock__tooltip--show");

  // reposition on every move so it tracks the icon as it magnifies + rises
  dock.addEventListener("mousemove", (e) => {
    const app = e.target.closest(".dock__app");
    if (!app) return hide();
    const label = labelFor(app);
    if (!label) return hide();
    const dr = dock.getBoundingClientRect();
    const ar = app.getBoundingClientRect(); // reflects the current magnified size/position
    tip.textContent = label;
    tip.style.left = ar.left + ar.width / 2 - dr.left + "px"; // magnified icon centre
    tip.style.top = ar.top - dr.top + "px"; // magnified icon top (rises above the pill)
    tip.classList.add("dock__tooltip--show");
  });
  dock.addEventListener("mouseleave", hide);
})();

/* ===================== PROJECT CAROUSEL ===================== */
(function () {
  const carousel = document.querySelector(".project__carousel");
  if (!carousel) return;

  const track = carousel.querySelector(".project__track");
  const slides = Array.from(carousel.querySelectorAll(".project__slide"));
  const dotsWrap = carousel.querySelector(".project__dots");
  const prevBtn = carousel.querySelector(".project__nav--prev");
  const nextBtn = carousel.querySelector(".project__nav--next");
  const nameEl = document.querySelector(".project__name");
  const roleEl = document.querySelector(".project__role");
  if (!track || slides.length === 0) return;

  const AUTOPLAY_MS = 4000;
  let index = 0;
  let timer = null;

  // build dots
  const dots = slides.map((_, i) => {
    const d = document.createElement("span");
    d.className = "project__dot";
    d.addEventListener("click", () => go(i, true));
    dotsWrap.appendChild(d);
    return d;
  });

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    const slide = slides[index];
    if (nameEl) nameEl.textContent = slide.dataset.name || "";
    if (roleEl) roleEl.textContent = slide.dataset.role || "";
    dots.forEach((d, i) =>
      d.classList.toggle("project__dot--active", i === index)
    );
  }

  function go(i, userInitiated) {
    index = (i + slides.length) % slides.length;
    render();
    if (userInitiated) restart();
  }

  const next = () => go(index + 1);
  const prev = () => go(index - 1);

  function restart() {
    stop();
    timer = setInterval(next, AUTOPLAY_MS);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  nextBtn && nextBtn.addEventListener("click", () => go(index + 1, true));
  prevBtn && prevBtn.addEventListener("click", () => go(index - 1, true));

  // pause on hover so the user can read / navigate
  carousel.addEventListener("mouseenter", stop);
  carousel.addEventListener("mouseleave", restart);

  render();
  restart();
})();

/* ===================== NOW PLAYING — PLAY/PAUSE TOGGLE ===================== */
(function () {
  const playBtn = document.querySelector(".music__btn--play");
  if (!playBtn) return;

  const pauseIcon = playBtn.querySelector(".music__icon-pause");
  const playIcon = playBtn.querySelector(".music__icon-play");
  const viz = document.querySelector(".music__viz");
  let playing = true;

  playBtn.addEventListener("click", () => {
    playing = !playing;
    pauseIcon.hidden = !playing;
    playIcon.hidden = playing;
    if (viz) {
      viz
        .querySelectorAll("i")
        .forEach((bar) => (bar.style.animationPlayState = playing ? "running" : "paused"));
    }
  });
})();

/* ===================== MUSIC ENGINE (shared) =====================
   The playlist is real songs, streamed through Spotify's official embed — the
   site hosts no audio. One embed controller is driven by every music surface
   (the Music app window, the Spotify widget on the desktop and the iOS home,
   and the Spotify app window); they all subscribe to the same state, so they
   never disagree. Visitors signed in to Spotify in this browser hear the full
   track; everyone else hears Spotify's 30-second preview. */
(function () {
  // `dur` is the song's full length, shown in the playlist; the progress bar
  // uses the length Spotify actually reports (30s for a preview).
  const TRACKS = [
    // `art` is the album cover Spotify's oEmbed endpoint serves for each track
    { name: "Intro", artist: "The xx", album: "xx", spotify: "2usrT8QIbIk9y0NEtQwS4j", dur: 128,
      art: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02a46d603701aa0342e8cca64e" },
    { name: "A Moment Apart", artist: "ODESZA", album: "A Moment Apart", spotify: "59wlTaYOL5tDUgXnbBQ3my", dur: 234,
      art: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0245951a69fe39a6e163122eab" },
    { name: "Borderline", artist: "Tame Impala", album: "The Slow Rush", spotify: "5hM5arv9KDbCHS0k9uqwjr", dur: 238,
      art: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0258267bd34420a00d5cf83a49" },
    { name: "Kerala", artist: "Bonobo", album: "Migration", spotify: "5DAjrJqXqYtgr67pVhmUeR", dur: 238,
      art: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0255fa09a768d1ef5ea5d279f9" },
    { name: "Awake", artist: "Tycho", album: "Awake", spotify: "5lB3bZKPhng9s4hKB1sSIe", dur: 284,
      art: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0267c9bbca5eaeb448a7eea834" },
    { name: "I Want to Break Free", artist: "Queen", album: "The Works", spotify: "1MsBRSbt5dqJSw3RxXtvCM", dur: 199,
      art: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e025be5f807f6f0549e198a44b4" },
  ];

  const PLAYLIST = {
    title: "delulu but dancing",
    owner: "Ankur Meena",
  };

  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  const uriOf = (i) => "spotify:track:" + TRACKS[i].spotify;

  // warm the cache with the six small covers, so every player shows its artwork
  // the moment it opens instead of filling in a beat later
  TRACKS.forEach((t) => {
    if (t.art) new Image().src = t.art;
  });

  // playback state (a single controller for the whole page)
  let controller = null;   // Spotify embed controller, once the API has loaded
  let loaded = -1;         // index of the track the embed currently holds
  let playing = false;     // what the embed last reported
  let wantPlaying = false; // what the visitor last asked for
  let playOnReady = false; // start the track as soon as a fresh load is ready
  let cur = 0, elapsed = 0, liveDur = 0, rafId = null, startTimer = null;

  const listeners = new Set(); // state subscribers (UI surfaces)
  const meters = new Set();    // arrays of bar elements animated while playing

  function getState() {
    const t = TRACKS[cur];
    return {
      playing: playing,
      index: cur,
      // the length Spotify reports for what is loaded, else the song's length
      track: liveDur && loaded === cur ? Object.assign({}, t, { dur: liveDur }) : t,
      elapsed: elapsed,
      volume: 1,
      tracks: TRACKS,
      playlist: PLAYLIST,
    };
  }
  function emit() {
    const s = getState();
    listeners.forEach((fn) => {
      try { fn(s); } catch (e) {}
    });
  }

  // ---- equaliser bars: the embed's audio can't be analysed, so while a song
  // plays the bars move on overlapping sine waves instead ----
  function restBars(bars) {
    bars.forEach((b) => (b.style.transform = "scaleY(0.1)"));
  }
  function vizFrame(t) {
    meters.forEach((bars) => {
      bars.forEach((b, i) => {
        const v = 0.5 + 0.28 * Math.sin(t / 170 + i * 1.7) + 0.22 * Math.sin(t / 93 + i * 2.9);
        b.style.transform = "scaleY(" + Math.max(0.12, Math.min(1.1, v)).toFixed(3) + ")";
      });
    });
    rafId = requestAnimationFrame(vizFrame);
  }
  function syncViz() {
    if (playing && rafId == null) rafId = requestAnimationFrame(vizFrame);
    if (!playing && rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      meters.forEach(restBars);
    }
  }

  // ---- the embed: kept out of view, the custom players are its controls ----
  const host = document.createElement("div");
  host.className = "spembed";
  host.setAttribute("aria-hidden", "true");
  const slot = document.createElement("div");
  host.appendChild(slot);
  document.body.appendChild(host);

  function load(i) {
    loaded = i;
    liveDur = 0;
    controller.loadUri(uriOf(i));
  }

  function onUpdate(e) {
    const d = e.data || {};
    if (d.duration) liveDur = Math.round(d.duration / 1000);
    elapsed = Math.floor((d.position || 0) / 1000);
    playing = !d.isPaused;
    if (playing) clearTimeout(startTimer);
    // a song that played to its end rolls on to the next, like a real playlist
    if (d.isPaused && wantPlaying && d.duration && d.position >= d.duration - 1000) {
      switchTo(cur + 1);
      return;
    }
    syncViz();
    emit();
  }

  window.onSpotifyIframeApiReady = function (IFrameAPI) {
    IFrameAPI.createController(slot, { uri: uriOf(cur), width: 300, height: 80 }, function (c) {
      controller = c;
      loaded = cur;
      c.addListener("playback_update", onUpdate);
      c.addListener("ready", function () {
        if (playOnReady) {
          playOnReady = false;
          c.play();
        }
      });
      // a tap that came in before the API finished loading still counts
      if (wantPlaying) play();
    });
  };
  const api = document.createElement("script");
  api.src = "https://open.spotify.com/embed/iframe-api/v1";
  api.async = true;
  document.body.appendChild(api);

  // If Spotify never starts (blocked by the browser, offline, or the API didn't
  // load), stop showing a song as playing instead of leaving it stuck at 0:00.
  function awaitStart() {
    clearTimeout(startTimer);
    startTimer = setTimeout(function () {
      if (!wantPlaying) return;
      wantPlaying = false;
      playOnReady = false;
      playing = false;
      syncViz();
      emit();
    }, 10000);
  }

  function play() {
    wantPlaying = true;
    if (controller) {
      if (loaded !== cur) {
        playOnReady = true;
        load(cur);
      } else if (elapsed > 0) {
        controller.resume();
      } else {
        controller.play();
      }
    }
    // show the tap straight away; Spotify's next update confirms it
    playing = true;
    awaitStart();
    syncViz();
    emit();
  }
  function pause() {
    wantPlaying = false;
    playOnReady = false;
    clearTimeout(startTimer);
    if (controller) controller.pause();
    playing = false;
    syncViz();
    emit();
  }
  function toggle() { wantPlaying ? pause() : play(); }

  function switchTo(i) {
    cur = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    elapsed = 0;
    if (controller) {
      playOnReady = wantPlaying;
      load(cur);
    }
    playing = wantPlaying;
    if (wantPlaying) awaitStart();
    syncViz();
    emit();
  }

  // clicking a row in the playlist: play it, or pause if it's already the one playing
  function playTrack(i) {
    if (i === cur) { toggle(); return; }
    wantPlaying = true;
    switchTo(i);
  }

  window.LoFi = {
    TRACKS: TRACKS,
    PLAYLIST: PLAYLIST,
    fmt: fmt,
    getState: getState,
    subscribe: function (fn) {
      listeners.add(fn);
      fn(getState()); // paint immediately so a new surface starts in sync
      return function () { listeners.delete(fn); };
    },
    addMeter: function (bars) {
      meters.add(bars);
      if (!playing) restBars(bars);
    },
    removeMeter: function (bars) { meters.delete(bars); },
    play: play,
    pause: pause,
    toggle: toggle,
    switchTo: switchTo,
    playTrack: playTrack,
    next: function () { switchTo(cur + 1); },
    prev: function () { switchTo(cur - 1); },
    // Spotify's embed has no volume control; the system volume applies
    setVolume: function () {},
  };
})();

/* ===================== MUSIC APP WINDOW ===================== */
(function () {
  const trigger = document.querySelector(".dock .dock__app--music");
  const screen = document.querySelector(".screen");
  if (!trigger || !screen || !window.LoFi) return;

  // ---- traffic-light glyphs (match the other windows) ----
  const G_CLOSE = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
  const G_MIN = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
  const G_EXPAND = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
  const G_COLLAPSE = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';

  // ---- transport glyphs ----
  const PLAY = '<svg class="music__glyph" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  const PAUSE = '<svg class="music__glyph" viewBox="0 0 24 24"><rect x="7" y="5.5" width="3.6" height="13" rx="1.2"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1.2"/></svg>';
  const PREV = '<svg class="music__glyph" viewBox="0 0 24 24"><path d="M18 6 10 12 18 18Z"/><rect x="6.4" y="6" width="2.4" height="12" rx="1"/></svg>';
  const NEXT = '<svg class="music__glyph" viewBox="0 0 24 24"><path d="M6 6 14 12 6 18Z"/><rect x="15.2" y="6" width="2.4" height="12" rx="1"/></svg>';

  let win = null; // guard against multiple windows

  function open(originEl) {
    if (win) return;
    const sRect = screen.getBoundingClientRect();
    const r = (originEl || trigger).getBoundingClientRect();
    const ox = r.left + r.width / 2 - sRect.left;
    const oy = r.top + r.height / 2 - sRect.top;

    const modal = document.createElement("div");
    modal.className = "winmodal";
    const backdrop = document.createElement("div");
    backdrop.className = "winmodal__backdrop";
    win = document.createElement("div");
    win.className = "winmodal__window musicwin";
    win.style.transformOrigin = ox + "px " + oy + "px";

    const EQ = Array.from({ length: 14 }, () => '<i class="music__bar"></i>').join("");
    win.innerHTML =
      '<div class="winmodal__bar">' +
        '<div class="winmodal__lights">' +
          '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
          '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
          '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
        "</div>" +
        '<span class="winmodal__title">Music</span>' +
      "</div>" +
      '<div class="winmodal__body">' +
        '<div class="music" data-track="0">' +
          '<div class="music__art"><span class="music__label"></span></div>' +
          '<div class="music__meta">' +
            '<div class="music__track"></div>' +
            '<div class="music__artist"></div>' +
          "</div>" +
          '<div class="music__eq">' + EQ + "</div>" +
          '<div class="music__controls">' +
            '<button class="music__btn music__prev" aria-label="Previous">' + PREV + "</button>" +
            '<button class="music__btn music__play music__play--big" aria-label="Play">' + PLAY + "</button>" +
            '<button class="music__btn music__next" aria-label="Next">' + NEXT + "</button>" +
          "</div>" +
          '<div class="music__time"><span class="music__elapsed">0:00</span>' +
            '<span class="music__count"></span></div>' +
          '<div class="music__vol">' +
            '<svg class="music__volic" viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a4 4 0 0 1 0 7"/></svg>' +
            '<input class="music__slider" type="range" min="0" max="100" value="60" aria-label="Volume">' +
          "</div>" +
        "</div>" +
      "</div>";

    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    const root = win.querySelector(".music");
    const bars = [...win.querySelectorAll(".music__bar")];
    const playBtn = win.querySelector(".music__play");
    const trackEl = win.querySelector(".music__track");
    const artistEl = win.querySelector(".music__artist");
    const labelEl = win.querySelector(".music__label");
    const elapsedEl = win.querySelector(".music__elapsed");
    const countEl = win.querySelector(".music__count");
    const slider = win.querySelector(".music__slider");

    // the window is just a view onto the shared engine
    function render(s) {
      trackEl.textContent = s.track.name;
      artistEl.textContent = s.track.artist;
      // the album cover becomes the record's centre label
      labelEl.style.backgroundImage = s.track.art ? 'url("' + s.track.art + '")' : "";
      labelEl.classList.toggle("has-cover", !!s.track.art);
      labelEl.textContent = s.track.art ? "" : s.track.artist;
      // three colour themes, cycled across however many songs the playlist has
      root.dataset.track = String(s.index % 3);
      countEl.textContent = (s.index + 1) + " / " + s.tracks.length;
      elapsedEl.textContent = LoFi.fmt(s.elapsed);
      playBtn.innerHTML = s.playing ? PAUSE : PLAY;
      playBtn.setAttribute("aria-label", s.playing ? "Pause" : "Play");
      root.classList.toggle("music--playing", s.playing);
      // don't yank the slider out from under a drag
      if (document.activeElement !== slider) slider.value = Math.round(s.volume * 100);
    }

    LoFi.addMeter(bars);
    const unsubscribe = LoFi.subscribe(render);

    playBtn.addEventListener("click", () => LoFi.toggle());
    win.querySelector(".music__prev").addEventListener("click", () => LoFi.prev());
    win.querySelector(".music__next").addEventListener("click", () => LoFi.next());
    slider.addEventListener("input", () => LoFi.setVolume(slider.value / 100));

    // ---- window chrome (close / minimize / maximize) ----
    // closing is just dismissing this view — playback carries on in the widget
    function close() {
      LoFi.removeMeter(bars);
      unsubscribe();
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
      win = null;
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("winmodal__window--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      minBtn.disabled = isMax;
    });
    document.addEventListener("keydown", onKey);
  }

  trigger.style.cursor = "pointer";
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    open(trigger);
  });
})();

/* ===================== SYSTEM SETTINGS → WALLPAPER PICKER ===================== */
(function () {
  const trigger = document.querySelector(".dock__app--settings");
  const screen = document.querySelector(".screen");
  if (!trigger || !screen) return;

  // single source of truth: the rotation module's three wallpapers
  const WALLPAPERS = (window.Wallpaper && window.Wallpaper.list) || [];
  const KEY = "mp-wallpaper";
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} },
  };

  // full-screen looping video used for live wallpapers (created on demand)
  let wpVideo = null;
  function ensureVideo() {
    if (wpVideo) return;
    wpVideo = document.createElement("video");
    wpVideo.className = "wallpaper-video";
    wpVideo.muted = true;
    wpVideo.loop = true;
    wpVideo.setAttribute("muted", "");
    wpVideo.setAttribute("playsinline", "");
    wpVideo.setAttribute("autoplay", "");
    wpVideo.style.display = "none";
    document.body.insertBefore(wpVideo, document.body.firstChild);
  }
  // picking by hand takes over from the timer and reuses the module's crossfade
  function applyWallpaper(w) {
    if (!window.Wallpaper) return;
    window.Wallpaper.stop();
    window.Wallpaper.show(WALLPAPERS.indexOf(w));
  }
  // restore the saved wallpaper on load
  let currentId = store.get() || WALLPAPERS[2].id;
  if (store.get()) {
    const savedWp = WALLPAPERS.find((w) => w.id === currentId);
    if (savedWp) applyWallpaper(savedWp);
  }

  // traffic-light glyphs
  const G_CLOSE = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
  const G_MIN = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
  const G_EXPAND = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
  const G_COLLAPSE = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';

  const sicon = (bg, glyph, label, active, pane) =>
    '<div class="set__item' + (active ? " set__item--active" : "") + '"' +
      (pane ? ' data-pane="' + pane + '"' : "") + ">" +
      '<span class="set__item-ic" style="background:' + bg + '">' + glyph + "</span>" +
      '<span class="set__item-label">' + label + "</span></div>";
  const GL = {
    wifi: '<svg viewBox="0 0 24 24"><path d="M4.5 11a11 11 0 0 1 15 0M7.5 14a7 7 0 0 1 9 0"/><circle cx="12" cy="17.5" r="1.1" fill="#fff" stroke="none"/></svg>',
    bt: '<svg viewBox="0 0 24 24"><path d="M8 7l8 5-8 5V4l8 5-8 5"/></svg>',
    net: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.3 4 5 4 8s-1.5 5.7-4 8c-2.5-2.3-4-5-4-8s1.5-5.7 4-8z"/></svg>',
    wall: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="13" rx="2"/><path d="M4 15l4-3.5 3.5 3 3.5-4 5 5.5"/><circle cx="9" cy="9.5" r="1.2" fill="#fff" stroke="none"/></svg>',
    disp: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6M12 17v4"/></svg>',
    batt: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3"/><rect x="5" y="10" width="9" height="5" rx="1" fill="#fff" stroke="none"/></svg>',
  };

  let win = null;

  function open(originEl) {
    if (win) return;
    const sRect = screen.getBoundingClientRect();
    const r = (originEl || trigger).getBoundingClientRect();
    const ox = r.left + r.width / 2 - sRect.left;
    const oy = r.top + r.height / 2 - sRect.top;

    const modal = document.createElement("div");
    modal.className = "winmodal";
    const backdrop = document.createElement("div");
    backdrop.className = "winmodal__backdrop";
    win = document.createElement("div");
    win.className = "settingswin";
    win.style.transformOrigin = ox + "px " + oy + "px";

    const wallBtn = (w) =>
      '<button class="set__wall' + (w.id === currentId ? " set__wall--active" : "") +
        '" data-id="' + w.id + '">' +
        '<span class="set__wall-thumb" style="background-image:url(\'' + (w.poster || w.img) + "')\">" +
          (w.video ? '<span class="set__wall-live">LIVE</span>' : "") +
        "</span>" +
        '<span class="set__wall-name">' + w.name + "</span></button>";
    // group into sections (preserve order)
    const sections = [];
    WALLPAPERS.forEach((w) => {
      let s = sections.find((x) => x.name === w.section);
      if (!s) { s = { name: w.section, items: [] }; sections.push(s); }
      s.items.push(w);
    });
    const walls = sections
      .map(
        (s) =>
          '<div class="set__section-label">' + s.name + "</div>" +
          '<div class="set__grid">' + s.items.map(wallBtn).join("") + "</div>"
      )
      .join("");

    win.innerHTML =
      '<aside class="set__sidebar">' +
        '<div class="set__side-top"><div class="winmodal__lights">' +
          '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
          '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
          '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
        "</div></div>" +
        '<div class="set__search">' +
          '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/></svg><span>Search</span>' +
        "</div>" +
        '<div class="set__list">' +
          sicon("#3b8bff", GL.wifi, "Wi-Fi") +
          sicon("#3b8bff", GL.bt, "Bluetooth") +
          sicon("#3b8bff", GL.net, "Network") +
          '<div class="set__sep"></div>' +
          sicon("#3ab7d6", GL.wall, "Wallpaper", true, "wallpaper") +
          sicon("#4a7bff", GL.disp, "Displays") +
          sicon("#34c759", GL.batt, "Battery") +
        "</div>" +
      "</aside>" +
      '<section class="set__main">' +
        '<div class="set__header">' +
          '<div class="set__title">Wallpaper</div>' +
          '<div class="set__sub">Choose a picture for your desktop.</div>' +
        "</div>" +
        '<div class="set__body">' + walls + "</div>" +
      "</section>";

    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    // pick a wallpaper (delegated across all section grids)
    win.querySelector(".set__body").addEventListener("click", (e) => {
      const btn = e.target.closest(".set__wall");
      if (!btn) return;
      const id = btn.dataset.id;
      const w = WALLPAPERS.find((x) => x.id === id);
      if (!w) return;
      currentId = id;
      applyWallpaper(w);
      store.set(id);
      win.querySelectorAll(".set__wall").forEach((el) =>
        el.classList.toggle("set__wall--active", el.dataset.id === id)
      );
    });

    // window chrome
    function close() {
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
      win = null;
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("settingswin--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      minBtn.disabled = isMax;
    });
    document.addEventListener("keydown", onKey);
  }

  trigger.style.cursor = "pointer";
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    open(trigger);
  });
})();

/* ===================== iOS HOME (mobile) — clone app icons + wire ===================== */
(function () {
  const ios = document.querySelector(".ios");
  if (!ios) return;

  // map each iOS app slot to the real trigger element it should mirror + open
  // scoped to `.dock`: the clones we append below reuse these same classes, so an
  // unscoped selector would start resolving to a previously-cloned icon
  const MAP = {
    spotify: ".dock .dock__app--spotify",
    finder: ".dock .dock__app--finder",
    notes: ".dock .dock__app--notes",
    acrobat: ".dock .dock__app--acrobat",
    mail: ".dock .dock__app--mail",
    linkedin: ".dock .dock__app--linkedin",
    ttt: '[data-game="ttt"]',
    memory: '[data-game="memory"]',
  };

  // some dock icons are drawn with pseudo-elements/padding that don't scale when
  // cloned — give those a clean, scalable SVG instead
  const OVERRIDE = {
    // Contacts has no dock counterpart to clone, so it ships its own artwork:
    // the iOS Phone tile — green field, white handset.
    contacts:
      '<svg viewBox="0 0 100 100">' +
      '<defs><linearGradient id="iosCallBg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5ff07a"/><stop offset="1" stop-color="#0bbf3f"/>' +
      "</linearGradient></defs>" +
      '<rect width="100" height="100" fill="url(#iosCallBg)"/>' +
      // the handset is drawn in its own 512 grid and scaled to 48% of the tile,
      // which is the proportion iOS uses — at full width it read as a fat blob
      '<g transform="translate(26 26) scale(0.0938)" fill="#fff">' +
      '<path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64c0 247.4 200.6 448 448 448 18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/>' +
      "</g></svg>",
    // The dock's Notes icon, redrawn 1:1. The dock paints it with CSS in a 52px
    // tile (fixed-pixel line pitch and perforation), which is why a clone would
    // not scale — so every value below is lifted from .dock__app--notes and laid
    // out in that same 52-unit grid, letting the SVG scale with the tile.
    notes:
      '<svg viewBox="0 0 52 52">' +
      "<defs>" +
      '<linearGradient id="iosNotesBand" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffdd55"/><stop offset="1" stop-color="#f8ca20"/></linearGradient>' +
      // box-shadow: 0 2px 3px rgba(0,0,0,.18) — a 3px blur is a 1.5 std deviation
      '<filter id="iosNotesShadow" x="-10%" y="-20%" width="120%" height="180%">' +
      '<feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.18"/></filter>' +
      // perforation dot: solid to 0.9px, fading out by 1.4px
      '<radialGradient id="iosNotesDot"><stop offset="0.643" stop-color="#a9a59b"/>' +
      '<stop offset="1" stop-color="#a9a59b" stop-opacity="0"/></radialGradient>' +
      '<pattern id="iosNotesPerf" x="0" y="14.04" width="5" height="8" patternUnits="userSpaceOnUse">' +
      '<circle cx="2.5" cy="4" r="1.4" fill="url(#iosNotesDot)"/></pattern>' +
      "</defs>" +
      // cream paper
      '<rect width="52" height="52" fill="#f2efe7"/>' +
      // ruled lines: 13px pitch from a 3px offset, 6px side inset, each a dark
      // 1px rule with a 1px highlight under it
      '<g fill="#c7c3b8"><rect x="6" y="14" width="40" height="1"/>' +
      '<rect x="6" y="27" width="40" height="1"/><rect x="6" y="40" width="40" height="1"/></g>' +
      '<g fill="#fff" fill-opacity="0.6"><rect x="6" y="15" width="40" height="1"/>' +
      '<rect x="6" y="28" width="40" height="1"/><rect x="6" y="41" width="40" height="1"/></g>' +
      // yellow header band, 27% tall, casting its shadow onto the paper
      '<rect width="52" height="14.04" fill="url(#iosNotesBand)" filter="url(#iosNotesShadow)"/>' +
      // dotted perforation row directly under the band
      '<rect y="14.04" width="52" height="8" fill="url(#iosNotesPerf)"/>' +
      "</svg>",
  };

  // cloned SVG icons carry <defs> ids (e.g. mailBody, finderBlue). Duplicated in
  // the DOM they hijack the originals' url(#id) refs and break the real dock icons
  // on desktop — so rename every id inside a clone and rewire its own references.
  function uniquifyIds(node, prefix) {
    node.querySelectorAll("[id]").forEach((el) => {
      const oldId = el.id;
      const newId = prefix + "-" + oldId;
      el.id = newId;
      node.querySelectorAll("*").forEach((e2) => {
        ["fill", "stroke", "clip-path", "filter", "mask"].forEach((attr) => {
          const v = e2.getAttribute(attr);
          if (v && v.indexOf("url(#" + oldId + ")") !== -1) {
            e2.setAttribute(attr, v.split("url(#" + oldId + ")").join("url(#" + newId + ")"));
          }
        });
      });
    });
  }

  // slots with no dock twin: they call a window module directly
  const ACTION = {
    contacts: (slot) => window.ContactsApp && window.ContactsApp.open(slot),
  };

  ios.querySelectorAll(".ios__app").forEach((slot, i) => {
    const key = slot.dataset.app;
    const real = MAP[key] ? document.querySelector(MAP[key]) : null;
    const ic = slot.querySelector(".ios__app-ic");
    if (OVERRIDE[key]) {
      ic.innerHTML = OVERRIDE[key];
    } else if (real) {
      // clone the real icon's visual (keeps its background + artwork)
      const clone = real.cloneNode(true);
      clone.removeAttribute("href");
      clone.removeAttribute("aria-label");
      clone.style.pointerEvents = "none";
      uniquifyIds(clone, "iosclone" + i);
      ic.appendChild(clone);
    }
    // forward taps to the real trigger (opens the window / link exactly the same)
    if (ACTION[key]) {
      slot.addEventListener("click", (e) => {
        e.preventDefault();
        ACTION[key](slot);
      });
    } else if (real) {
      slot.addEventListener("click", (e) => {
        e.preventDefault();
        real.click();
      });
    }
  });

  // widgets that open an app on tap (the About card opens About Me)
  ios.querySelectorAll("[data-ios-open]").forEach((w) => {
    const real = document.querySelector(MAP[w.dataset.iosOpen]);
    if (!real) return;
    w.addEventListener("click", (e) => {
      e.preventDefault();
      real.click();
    });
  });


})();

/* ===================== MOBILE: iOS "‹ Home" back button in app windows ===================== */
(function () {
  const screen = document.querySelector(".screen");
  if (!screen || !("MutationObserver" in window)) return;
  const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

  function addBack(modal) {
    if (!isMobile() || modal.querySelector(".ios-back")) return;
    const closeBtn = modal.querySelector(".wl--close");
    if (!closeBtn) return;
    // Attach to the window root, not to the strip that holds the traffic lights.
    // That strip is the tab bar's container on mobile and is itself positioned,
    // which would drag this absolutely-positioned button down into the pill.
    const host =
      modal.querySelector(".winmodal__window, .noteswin, .finderwin, .settingswin") || modal;
    const back = document.createElement("button");
    back.className = "ios-back";
    back.type = "button";
    back.setAttribute("aria-label", "Home");
    back.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>Home</span>';
    back.addEventListener("click", (e) => {
      e.preventDefault();
      closeBtn.click();
    });
    host.insertBefore(back, host.firstChild);
  }

  new MutationObserver((muts) => {
    muts.forEach((m) =>
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.classList && n.classList.contains("winmodal")) addBack(n);
      })
    );
  }).observe(screen, { childList: true });
})();

/* ===================== macOS DOCK MAGNIFICATION (fisheye) ===================== */
(function () {
  const dock = document.querySelector(".dock");
  if (!dock) return;

  const BASE = 52;   // rest icon size (matches CSS)
  const MAX = 86;    // size of the icon directly under the cursor
  const SPREAD = 62; // px std-dev of the falloff → how many neighbours grow

  let apps = [];
  let centers = [];

  function cache() {
    apps = [...dock.querySelectorAll(".dock__app")];
    apps.forEach((a) => {
      a.style.width = "";
      a.style.height = "";
    });
    // read each icon's rest-position centre (stable → no feedback jitter)
    centers = apps.map((a) => {
      const r = a.getBoundingClientRect();
      return r.left + r.width / 2;
    });
  }
  function magnify(x) {
    for (let i = 0; i < apps.length; i++) {
      const d = x - centers[i];
      const f = Math.exp(-(d * d) / (2 * SPREAD * SPREAD)); // 1 at cursor → 0 far away
      const size = BASE + (MAX - BASE) * f;
      apps[i].style.width = size + "px";
      apps[i].style.height = size + "px";
    }
  }
  function reset() {
    apps.forEach((a) => {
      a.style.width = "";
      a.style.height = "";
    });
  }

  dock.addEventListener("mouseenter", (e) => {
    if (window.matchMedia("(max-width: 720px)").matches) return;
    cache();
    dock.classList.add("dock--magnifying");
    magnify(e.clientX);
  });
  dock.addEventListener("mousemove", (e) => {
    if (apps.length) magnify(e.clientX);
  });
  dock.addEventListener("mouseleave", () => {
    dock.classList.remove("dock--magnifying");
    reset();
  });
  window.addEventListener("resize", () => {
    dock.classList.remove("dock--magnifying");
    reset();
    apps = [];
  });
})();

/* ===================== MENU BAR ITEMS → REAL APPS ===================== */
(function () {
  // Each menu title mirrors the dock trigger that already knows how to open it.
  // Scope every lookup to `.dock`: the iOS home clones these icons (classes and
  // all) earlier in the DOM, and those clones have had their href stripped — an
  // unscoped querySelector would grab the dead clone instead of the real icon.
  const MENU = {
    projects: ".dock .dock__app--finder",
    about: ".dock .dock__app--notes",
    resume: ".dock .dock__app--acrobat",
    contact: ".dock .dock__app--mail",
  };

  document.querySelectorAll(".menubar__item[data-menu]").forEach((item) => {
    const key = item.dataset.menu;
    const target = document.querySelector(MENU[key]);
    if (!target) return;
    item.addEventListener("click", (e) => {
      e.preventDefault();
      // Contact opens the Contacts window (so does the dock's Mail icon)
      if (key === "contact" && window.ContactsApp) {
        window.ContactsApp.open(item);
        return;
      }
      target.click();
    });
  });
})();

/* ===================== SPOTIFY PLAYER WIDGET =====================
   A Spotify-styled surface over the shared music engine. Every instance
   (desktop column + iOS home) renders from the same state, so the Music app
   window, the desktop widget and the phone widget never disagree. */
(function () {
  const widgets = [...document.querySelectorAll("[data-spw]")];
  if (!widgets.length || !window.LoFi) return;

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.6" y="5.2" width="3.9" height="13.6" rx="1.2"/><rect x="13.5" y="5.2" width="3.9" height="13.6" rx="1.2"/></svg>';
  const ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5.5 9.5 12 18 18.5Z"/><rect x="5.4" y="5.5" width="2.6" height="13" rx="1.1"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5 14.5 12 6 18.5Z"/><rect x="16" y="5.5" width="2.6" height="13" rx="1.1"/></svg>';
  // the row's leading slot: track number when idle, speaker when it's the current one
  const ICON_SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/></svg>';

  // compact card uses the reference's chunky double-triangle transport
  const MINI_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.2v15.6L19.5 12z"/></svg>';
  const MINI_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.6" y="4.2" width="4.9" height="15.6" rx="1.7"/><rect x="13.5" y="4.2" width="4.9" height="15.6" rx="1.7"/></svg>';
  const MINI_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12 21.5 5.6v12.8z"/><path d="M2.5 12 12 5.6v12.8z"/></svg>';
  const MINI_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12 2.5 18.4V5.6z"/><path d="M21.5 12 12 18.4V5.6z"/></svg>';
  // replaces the audio-output button from the reference card
  const ICON_EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H4v6"/><path d="M14 20h6v-6"/><path d="M4 4l6.5 6.5"/><path d="M20 20l-6.5-6.5"/></svg>';

  const totalSecs = LoFi.TRACKS.reduce((n, t) => n + t.dur, 0);
  const playlistMeta =
    LoFi.PLAYLIST.owner + " · " + LoFi.TRACKS.length + " songs, " +
    Math.round(totalSecs / 60) + " min";

  widgets.forEach((root) => {
    const q = (sel) => root.querySelector(sel);
    const qa = (sel) => [...root.querySelectorAll(sel)];

    const listEl = q("[data-spw-list]");
    const metaEl = q("[data-spw-meta]");
    const statusEl = q("[data-spw-status]");
    const toggles = qa("[data-spw-toggle]");
    const mini = q(".spw__mini");
    // a control can live in the compact card, the full view, or both — write to all
    const setText = (sel, txt) => qa(sel).forEach((e) => (e.textContent = txt));

    if (metaEl) metaEl.textContent = playlistMeta;
    setText("[data-spw-title]", LoFi.PLAYLIST.title);

    // ---- static chrome (compact card gets the reference's icon set) ----
    qa("[data-spw-prev]").forEach((b) => (b.innerHTML = b.closest(".spw__mini") ? MINI_PREV : ICON_PREV));
    qa("[data-spw-next]").forEach((b) => (b.innerHTML = b.closest(".spw__mini") ? MINI_NEXT : ICON_NEXT));
    const expandBtn = q("[data-spw-expand]");
    // only fill an empty trigger — the mobile tile's trigger IS the artwork, and
    // injecting the icon there would paint over the album art
    if (expandBtn && !expandBtn.innerHTML.trim()) expandBtn.innerHTML = ICON_EXPAND;

    // ---- playlist rows, built from the engine's track list ----
    // (the desktop widget is compact-only — it has no list to fill)
    if (listEl) LoFi.TRACKS.forEach((t, i) => {
      const li = document.createElement("li");
      li.className = "spw__row";
      li.dataset.index = String(i);
      li.innerHTML =
        '<span class="spw__num"><span class="spw__numtext">' + (i + 1) + "</span>" +
          '<span class="spw__numic">' + ICON_SOUND + "</span></span>" +
        '<span class="spw__rowmeta">' +
          '<span class="spw__rowtitle">' + t.name + "</span>" +
          '<span class="spw__rowartist">' + t.artist + "</span>" +
        "</span>" +
        '<span class="spw__rowdur">' + LoFi.fmt(t.dur) + "</span>";
      li.addEventListener("click", () => LoFi.playTrack(i));
      listEl.appendChild(li);
    });
    const rows = listEl ? [...listEl.children] : [];

    // ---- equaliser bars fed by the shared analyser (one meter per view) ----
    qa("[data-spw-eq]").forEach((eq) => {
      const bars = [];
      for (let i = 0; i < 4; i++) {
        const b = document.createElement("i");
        b.className = "spw__eqbar";
        eq.appendChild(b);
        bars.push(b);
      }
      LoFi.addMeter(bars);
    });

    // ---- transport ----
    toggles.forEach((b) => b.addEventListener("click", () => LoFi.toggle()));
    qa("[data-spw-prev]").forEach((b) => b.addEventListener("click", () => LoFi.prev()));
    qa("[data-spw-next]").forEach((b) => b.addEventListener("click", () => LoFi.next()));

    // ---- the size toggle opens the full Spotify app window ----
    if (expandBtn) {
      expandBtn.addEventListener("click", () => {
        if (window.SpotifyApp) window.SpotifyApp.open(expandBtn);
      });
    }

    // ---- render from state ----
    LoFi.subscribe((s) => {
      toggles.forEach((b) => {
        const compactBtn = !!b.closest(".spw__mini");
        b.innerHTML = s.playing
          ? (compactBtn ? MINI_PAUSE : ICON_PAUSE)
          : (compactBtn ? MINI_PLAY : ICON_PLAY);
        b.setAttribute("aria-label", s.playing ? "Pause" : "Play");
      });

      setText("[data-spw-track]", s.track.name);
      setText("[data-spw-artist]", s.track.artist);
      // the playing song's album cover replaces the placeholder note
      qa(".spw__mini-art, .spw__tile-art").forEach((e) => {
        e.style.backgroundImage = s.track.art ? 'url("' + s.track.art + '")' : "";
        e.classList.toggle("has-cover", !!s.track.art);
      });
      setText("[data-spw-elapsed]", LoFi.fmt(s.elapsed));
      setText("[data-spw-total]", LoFi.fmt(s.track.dur));
      // the compact card counts down, like the reference
      setText("[data-spw-remain]", "-" + LoFi.fmt(Math.max(0, s.track.dur - s.elapsed)));
      const pct = Math.min(100, (s.elapsed / s.track.dur) * 100) + "%";
      qa("[data-spw-fill]").forEach((e) => (e.style.width = pct));
      if (statusEl) {
        // the now-playing bar already names the track, so this line says where
        // the sound comes from
        statusEl.textContent = s.playing
          ? "Streaming from Spotify"
          : "Real tracks, streamed by Spotify";
      }
      root.classList.toggle("spw--playing", s.playing);

      rows.forEach((li, i) => {
        li.classList.toggle("spw__row--current", i === s.index);
        li.classList.toggle("spw__row--playing", i === s.index && s.playing);
      });
    });
  });
})();

/* ===================== SPOTIFY APP WINDOW =====================
   The compact widget's size toggle opens this: a full Spotify playlist page,
   laid out from the reference screenshot (art-tinted hero, action bar, track
   table, player bar). It is another view onto the shared LoFi engine, so it
   opens already in sync and closing it never interrupts playback. */
(function () {
  const screen = document.querySelector(".screen");
  if (!screen || !window.LoFi) return;

  // traffic-light glyphs (match every other window)
  const G_CLOSE = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
  const G_MIN = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
  const G_EXPAND = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
  const G_COLLAPSE = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';

  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M7.5 4.8v14.4L20 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6.4" y="4.8" width="4.2" height="14.4" rx="1.4"/><rect x="13.4" y="4.8" width="4.2" height="14.4" rx="1.4"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 5.5 9.5 12 18 18.5Z"/><rect x="5.4" y="5.5" width="2.6" height="13" rx="1.1"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 5.5 14.5 12 6 18.5Z"/><rect x="16" y="5.5" width="2.6" height="13" rx="1.1"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.6"/><path d="M12 7v5.3l3.4 2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7.4 12.4 10.6 15.6 16.8 9.2" fill="none" stroke="#121212" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6"/><path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>',
    // the playlist cover, same artwork the widget uses
    cover:
      '<svg viewBox="0 0 100 100" aria-hidden="true"><g class="spw__cover-note">' +
      '<path d="M40 22 L74 14 L74 28 L40 36 Z"/>' +
      '<rect x="40" y="27" width="4.6" height="46" rx="1.6"/>' +
      '<rect x="69.4" y="19" width="4.6" height="46" rx="1.6"/>' +
      '<ellipse cx="33.5" cy="72" rx="9.4" ry="7" transform="rotate(-20 33.5 72)"/>' +
      '<ellipse cx="62.9" cy="64" rx="9.4" ry="7" transform="rotate(-20 62.9 64)"/>' +
      "</g></svg>",
  };

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // "date added" is today, the way a freshly opened playlist reads
  const today = new Date();
  const ADDED = today.getDate() + " " + MONTHS[today.getMonth()] + " " + today.getFullYear();

  const totalSecs = LoFi.TRACKS.reduce((n, t) => n + t.dur, 0);
  const PLAYLIST_META =
    LoFi.TRACKS.length + " songs, " + Math.round(totalSecs / 60) + " min";

  let win = null;

  function open(originEl) {
    if (win) return;
    const sRect = screen.getBoundingClientRect();
    const r = originEl ? originEl.getBoundingClientRect() : sRect;
    const ox = r.left + r.width / 2 - sRect.left;
    const oy = r.top + r.height / 2 - sRect.top;

    const modal = document.createElement("div");
    modal.className = "winmodal";
    const backdrop = document.createElement("div");
    backdrop.className = "winmodal__backdrop";
    win = document.createElement("div");
    win.className = "winmodal__window spotwin";
    win.style.transformOrigin = ox + "px " + oy + "px";

    const rowsHTML = LoFi.TRACKS.map(function (t, i) {
      return (
        '<div class="sp__row" data-i="' + i + '" role="button" tabindex="0">' +
          '<div class="sp__cell sp__cell--num">' +
            '<span class="sp__num">' + (i + 1) + "</span>" +
            '<span class="sp__rowplay">' + I.play + "</span>" +
            '<span class="sp__rowbars"><i></i><i></i><i></i><i></i></span>' +
          "</div>" +
          '<div class="sp__cell sp__cell--title">' +
            (t.art
              ? '<span class="sp__thumb has-cover" style="background-image:url(\'' + t.art + '\')"></span>'
              : '<span class="sp__thumb">' + I.cover + "</span>") +
            "<span class=\"sp__titlemeta\">" +
              '<span class="sp__rowname">' + t.name + "</span>" +
              '<span class="sp__rowartist">' + t.artist + "</span>" +
            "</span>" +
          "</div>" +
          '<div class="sp__cell sp__cell--album">' + t.album + "</div>" +
          '<div class="sp__cell sp__cell--date">' + ADDED + "</div>" +
          '<div class="sp__cell sp__cell--dur">' +
            '<span class="sp__saved">' + I.check + "</span>" +
            '<span class="sp__durtext">' + LoFi.fmt(t.dur) + "</span>" +
            '<span class="sp__rowmore">' + I.more + "</span>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    win.innerHTML =
      '<div class="winmodal__bar spotwin__bar">' +
        '<div class="winmodal__lights">' +
          '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
          '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
          '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
        "</div>" +
        '<span class="winmodal__title">Spotify</span>' +
      "</div>" +

      '<div class="sp">' +
        '<div class="sp__scroll">' +
          '<header class="sp__hero">' +
            // like Spotify, a playlist's cover is a mosaic of its first four albums
            (LoFi.TRACKS.length >= 4 && LoFi.TRACKS.slice(0, 4).every((t) => t.art)
              ? '<div class="sp__cover sp__cover--mosaic">' +
                  LoFi.TRACKS.slice(0, 4).map((t) => '<img src="' + t.art + '" alt="">').join("") +
                "</div>"
              : '<div class="sp__cover">' + I.cover + "</div>") +
            '<div class="sp__heroinfo">' +
              '<span class="sp__kind">Public Playlist</span>' +
              '<h1 class="sp__title">' + LoFi.PLAYLIST.title + "</h1>" +
              '<div class="sp__owner">' +
                '<span class="sp__avatar">' + LoFi.PLAYLIST.owner.charAt(0) + "</span>" +
                '<span class="sp__ownername">' + LoFi.PLAYLIST.owner + "</span>" +
                '<span class="sp__dot">•</span>' +
                '<span class="sp__count">' + PLAYLIST_META + "</span>" +
              "</div>" +
            "</div>" +
          "</header>" +

          '<div class="sp__actions">' +
            '<button class="sp__bigplay" data-sp-toggle aria-label="Play"></button>' +
          "</div>" +

          '<div class="sp__table">' +
            '<div class="sp__head">' +
              '<div class="sp__cell sp__cell--num">#</div>' +
              '<div class="sp__cell sp__cell--title">Title</div>' +
              '<div class="sp__cell sp__cell--album">Album</div>' +
              '<div class="sp__cell sp__cell--date">Date added</div>' +
              '<div class="sp__cell sp__cell--dur">' + I.clock + "</div>" +
            "</div>" +
            rowsHTML +
          "</div>" +
        "</div>" +

        '<footer class="sp__bar">' +
          '<div class="sp__np">' +
            '<span class="sp__npart">' + I.cover + "</span>" +
            '<span class="sp__npmeta">' +
              '<span class="sp__nptitle" data-sp-track></span>' +
              '<span class="sp__npartist" data-sp-artist></span>' +
            "</span>" +
            '<span class="sp__npsaved">' + I.check + "</span>" +
          "</div>" +
          '<div class="sp__center">' +
            '<div class="sp__transport">' +
              '<button class="sp__ico sp__ico--lg" data-sp-prev aria-label="Previous">' + I.prev + "</button>" +
              '<button class="sp__playbtn" data-sp-toggle aria-label="Play"></button>' +
              '<button class="sp__ico sp__ico--lg" data-sp-next aria-label="Next">' + I.next + "</button>" +
            "</div>" +
            '<div class="sp__scrub">' +
              '<span class="sp__time" data-sp-elapsed>0:00</span>' +
              '<div class="sp__track"><span class="sp__fill" data-sp-fill></span></div>' +
              '<span class="sp__time" data-sp-total>0:00</span>' +
            "</div>" +
          "</div>" +
          '<div class="sp__right">' +
            '<span class="sp__ico sp__ico--static">' + I.volume + "</span>" +
            '<input class="sp__vol" type="range" min="0" max="100" value="60" aria-label="Volume">' +
          "</div>" +
        "</footer>" +
      "</div>";

    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    const rowEls = [...win.querySelectorAll(".sp__row")];
    const toggles = [...win.querySelectorAll("[data-sp-toggle]")];
    const vol = win.querySelector(".sp__vol");

    // ---- wiring ----
    toggles.forEach((b) => b.addEventListener("click", () => LoFi.toggle()));
    win.querySelector("[data-sp-prev]").addEventListener("click", () => LoFi.prev());
    win.querySelector("[data-sp-next]").addEventListener("click", () => LoFi.next());
    rowEls.forEach((el, i) => {
      el.addEventListener("click", () => LoFi.playTrack(i));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          LoFi.playTrack(i);
        }
      });
    });
    vol.addEventListener("input", () => LoFi.setVolume(vol.value / 100));

    // Every row owns its own set of bars riding the shared analyser. Only the
    // playing row's are visible, so animating all three costs nothing — and it
    // avoids re-parenting one set between rows, which duplicated them.
    const meters = rowEls.map((el) => [...el.querySelectorAll(".sp__rowbars i")]);
    meters.forEach((m) => LoFi.addMeter(m));

    function render(s) {
      toggles.forEach((b) => {
        b.innerHTML = s.playing ? I.pause : I.play;
        b.setAttribute("aria-label", s.playing ? "Pause" : "Play");
      });
      win.querySelector("[data-sp-track]").textContent = s.track.name;
      win.querySelector("[data-sp-artist]").textContent = s.track.artist;
      const npArt = win.querySelector(".sp__npart");
      npArt.style.backgroundImage = s.track.art ? 'url("' + s.track.art + '")' : "";
      npArt.classList.toggle("has-cover", !!s.track.art);
      win.querySelector("[data-sp-elapsed]").textContent = LoFi.fmt(s.elapsed);
      win.querySelector("[data-sp-total]").textContent = LoFi.fmt(s.track.dur);
      win.querySelector("[data-sp-fill]").style.width =
        Math.min(100, (s.elapsed / s.track.dur) * 100) + "%";
      win.classList.toggle("sp--playing", s.playing);
      rowEls.forEach((el, i) => {
        el.classList.toggle("sp__row--current", i === s.index);
        el.classList.toggle("sp__row--playing", i === s.index && s.playing);
      });
      if (document.activeElement !== vol) vol.value = Math.round(s.volume * 100);
    }
    const unsubscribe = LoFi.subscribe(render);

    // ---- window chrome ----
    function close() {
      meters.forEach((m) => LoFi.removeMeter(m));
      unsubscribe();
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
      win = null;
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("spotwin--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      minBtn.disabled = isMax;
    });
    document.addEventListener("keydown", onKey);
  }

  const dockIcon = document.querySelector(".dock .dock__app--spotify");
  if (dockIcon) {
    dockIcon.style.cursor = "pointer";
    dockIcon.addEventListener("click", (e) => {
      e.preventDefault();
      open(dockIcon);
    });
  }

  window.SpotifyApp = { open: open };
})();

/* ===================== FEATURED PROJECTS WIDGET =====================
   One featured project shown large, with the rest as thumbnails that swap it.
   Renders from the same PROJECTS list the Projects window uses. */
(function () {
  const widgets = [...document.querySelectorAll("[data-pjw]")];
  const ALL = window.PortfolioProjects || [];
  if (!widgets.length || !ALL.length) return;

  const FEATURED = ALL.filter((p) => p.group === "featured");
  if (!FEATURED.length) return;
  // the footer fits four thumbnails beside the "+N" chip and the button, even on
  // a phone; any further featured projects are counted in the chip instead
  const SHOWN = FEATURED.slice(0, 4);
  const REST = ALL.length - SHOWN.length;

  const ICON_GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M12.5 5.5 19 12l-6.5 6.5"/></svg>';
  // the reference shows a due date here; ours shows where the project actually lives
  const ICON_GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8"/><path d="M12 3.4c2.1 2.3 3.2 5.4 3.2 8.6s-1.1 6.3-3.2 8.6c-2.1-2.3-3.2-5.4-3.2-8.6S9.9 5.7 12 3.4z"/></svg>';

  const host = (p) => {
    try { return new URL(p.url).host.replace(/^www\./, ""); } catch (e) { return null; }
  };

  // A screenshot fills its frame; a logo (fit: contain) sits whole on its own
  // colour; work with no image gets its category colour and its name (the
  // thumbnail takes the initial), so no featured item shows an empty frame.
  const GRAD = window.PortfolioGroupGrad || {};
  const paint = (el, p, isThumb) => {
    const cls = isThumb ? "pjw__thumb--text" : "pjw__fthumb--text";
    // A project's `poster` is artwork made for this home-screen card only; the
    // Projects window never reads it, so its cards and detail pages are unchanged.
    if (p.poster) {
      el.style.backgroundImage = 'url("' + p.poster + '")';
      el.style.backgroundSize = "cover";
      el.style.backgroundColor = "";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
      el.classList.remove(cls);
      el.textContent = "";
    } else if (p.img) {
      el.style.backgroundImage = 'url("' + p.img + '")';
      el.style.backgroundSize = p.fit || "";
      el.style.backgroundColor = p.bg || "";
      el.style.backgroundPosition = p.pos || "";
      el.style.backgroundRepeat = "no-repeat";
      el.classList.remove(cls);
      el.textContent = "";
    } else {
      el.style.backgroundImage = GRAD[p.group] || GRAD.featured || "none";
      el.style.backgroundSize = "";
      el.style.backgroundColor = "";
      el.style.backgroundPosition = "";
      el.classList.add(cls);
      el.textContent = isThumb ? p.title.charAt(0) : p.title;
    }
  };

  widgets.forEach((root) => {
    const q = (sel) => root.querySelector(sel);
    const thumbsEl = q("[data-pjw-thumbs]");
    const linkEl = q("[data-pjw-feature]");

    q("[data-pjw-go]").innerHTML = ICON_GO;
    q("[data-pjw-icon]").innerHTML = ICON_GLOBE;

    // ---- thumbnails: one per featured project, then a chip for the remainder ----
    SHOWN.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pjw__thumb";
      paint(b, p, true);
      b.setAttribute("aria-label", "Feature " + p.title);
      b.addEventListener("click", () => show(i));
      thumbsEl.appendChild(b);
    });
    if (REST > 0) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "pjw__plus";
      more.textContent = "+" + REST;
      more.setAttribute("aria-label", REST + " more projects");
      more.addEventListener("click", openAll);
      thumbsEl.appendChild(more);
    }
    const thumbs = [...thumbsEl.querySelectorAll(".pjw__thumb")];

    function show(i) {
      const p = FEATURED[i];
      paint(q("[data-pjw-img]"), p, false);
      q("[data-pjw-name]").textContent = p.title;
      q("[data-pjw-desc]").textContent = p.desc || p.cat;
      // the column is far taller than the reference card, so the real stack fills
      // the panel instead of leaving a gap or over-cropping the screenshot
      const stackEl = q("[data-pjw-stack]");
      stackEl.innerHTML = "";
      (p.stack || []).slice(0, 6).forEach((tech) => {
        const chip = document.createElement("span");
        chip.className = "pjw__chip";
        chip.textContent = tech;
        stackEl.appendChild(chip);
      });
      q("[data-pjw-metric]").textContent = host(p) || p.mt;
      q("[data-pjw-sub]").textContent = [p.badge, p.yr].filter(Boolean).join(" · ");
      if (p.url) linkEl.href = p.url;
      else linkEl.removeAttribute("href");
      thumbs.forEach((t, n) => t.classList.toggle("pjw__thumb--on", n === i));
    }

    // the "+N" chip goes to the full Projects window
    function openAll() {
      const finder = document.querySelector(".dock .dock__app--finder");
      if (finder) finder.click();
    }

    show(0);
  });
})();

/* ===================== DESKTOP-ONLY SITE VIEWER =====================
   Some live sites were built for desktop only and fall apart at phone width.
   A new tab can't make another site render its desktop layout, so on a phone
   their links open here instead: the site loads in a frame a desktop wide and
   is scaled down to fit the screen. One capture-phase listener covers every
   link to them (project cards, detail pages, About Me, the home widget). */
(function () {
  const DESK_W = 1280;
  const norm = (u) => {
    try { const x = new URL(u, location.href); return (x.host + x.pathname).replace(/\/+$/, ""); } catch (e) { return ""; }
  };
  const SITES = new Map();
  (window.PortfolioProjects || []).forEach((p) => {
    if (p.desktopOnly && p.url) SITES.set(norm(p.url), p);
  });
  if (!SITES.size) return;

  const phone = window.matchMedia("(max-width: 720px), (pointer: coarse) and (max-width: 1024px)");
  const EXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>';

  function openViewer(p) {
    const host = norm(p.url).split("/")[0].replace(/^www\./, "");
    const el = document.createElement("div");
    el.className = "dsv";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", p.title + " desktop view");
    el.innerHTML =
      '<div class="dsv__bar">' +
        '<button class="dsv__done" type="button">Done</button>' +
        '<div class="dsv__titles"><div class="dsv__title"></div>' +
          '<div class="dsv__host"></div></div>' +
        '<a class="dsv__open" target="_blank" rel="noopener" aria-label="Open in new tab">' + EXT + "</a>" +
      "</div>" +
      '<div class="dsv__stage"><div class="dsv__loading">Loading desktop view…</div>' +
        '<iframe class="dsv__frame" referrerpolicy="no-referrer-when-downgrade"></iframe></div>';
    el.querySelector(".dsv__title").textContent = p.title;
    el.querySelector(".dsv__host").textContent = host;
    el.querySelector(".dsv__open").href = p.url;
    const stage = el.querySelector(".dsv__stage");
    const frame = el.querySelector(".dsv__frame");
    frame.title = p.title;
    frame.addEventListener("load", () => el.classList.add("dsv--loaded"));

    // the frame is always a desktop wide; only its on-screen size is scaled
    const fit = () => {
      const s = stage.clientWidth / DESK_W;
      frame.style.width = DESK_W + "px";
      frame.style.height = stage.clientHeight / s + "px";
      frame.style.transform = "scale(" + s + ")";
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      el.classList.remove("dsv--open");
      window.removeEventListener("resize", fit);
      document.removeEventListener("keydown", onKey);
      setTimeout(() => el.remove(), 260);
    }
    el.querySelector(".dsv__done").addEventListener("click", close);
    window.addEventListener("resize", fit);
    document.addEventListener("keydown", onKey);

    document.body.appendChild(el);
    fit();
    frame.src = p.url;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("dsv--open")));
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !phone.matches || a.classList.contains("dsv__open")) return;
    const p = SITES.get(norm(a.href));
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    openViewer(p);
  }, true);
})();

/* ===================== AMBIENT VIDEO CARD =====================
   Autoplay needs the muted + playsinline combination, and browsers still hand
   back a rejected promise sometimes — the poster stands in when that happens.
   Playback is paused while the tab is hidden, and skipped entirely for anyone
   who asked for reduced motion. */
(function () {
  // one card on the Mac desktop, one at the foot of the iOS home
  const vids = [...document.querySelectorAll(".vidw__v")];
  if (!vids.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return; // the poster frame is enough

  const play = () => {
    vids.forEach((v) => {
      const r = v.play();
      if (r && r.catch) r.catch(() => {});
    });
  };

  play();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) vids.forEach((v) => v.pause());
    else play();
  });
})();

/* ===================== CONTACTS WINDOW =====================
   Opened from the "Contact" menu. Every field here already existed elsewhere in
   this file (the About window's bio and contact rows, the dock's links) — this
   is a different view of the same facts, not a second copy of the truth. */
(function () {
  const screen = document.querySelector(".screen");
  if (!screen) return;

  const ME = {
    name: "Ankur Meena",
    role: "Senior UI/UX Designer",
    tagline: "Let's design something meaningful.",
    title: "Senior UI/UX Designer · Fintech & Insurance",
    location: "Gurugram, India",
    experience: "5+ Years",
    company: "Ensylon",
    focus: "Product Design · Design Systems · UX Research",
    email: "ankurmeena194@gmail.com",
    phone: "+91-6377683376",
    linkedin: "https://www.linkedin.com/in/ankur-meena/",
    resume: "ankur-updated-resume.pdf",
  };

  const G_CLOSE = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3.4 3.4 8.6 8.6M8.6 3.4 3.4 8.6"/></svg>';
  const G_MIN = '<svg class="wl__g" viewBox="0 0 12 12"><path d="M3 6H9"/></svg>';
  const G_EXPAND = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 3 3 6.4 6.4 3Z"/><path d="M9 9 9 5.6 5.6 9Z"/></svg>';
  const G_COLLAPSE = '<svg class="wl__g wl__g--fill" viewBox="0 0 12 12"><path d="M3 5.8 5.8 5.8 5.8 3Z"/><path d="M9 6.2 6.2 6.2 6.2 9Z"/></svg>';

  const I_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  const I_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.4A2.4 2.4 0 0 0 4 5.4v6.1A2.5 2.5 0 0 0 6.5 14"/></svg>';
  const I_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19 7"/></svg>';

  const card = (label, value, mod) =>
    '<div class="cw__card' + (mod ? " cw__card--" + mod : "") + '">' +
      '<span class="cw__label">' + label + "</span>" +
      '<span class="cw__value">' + value + "</span>" +
    "</div>";

  const copyCard = (label, value, href, copyText) =>
    '<div class="cw__card cw__card--wide cw__card--link">' +
      '<span class="cw__cardmain">' +
        '<span class="cw__label">' + label + "</span>" +
        '<a class="cw__link" href="' + href + '">' + value + "</a>" +
      "</span>" +
      '<button class="cw__copy" type="button" data-copy="' + copyText + '" ' +
        'aria-label="Copy ' + label.toLowerCase() + '">' + I_COPY + I_TICK + "</button>" +
    "</div>";

  let win = null;

  function open(originEl) {
    if (win) return;
    const sRect = screen.getBoundingClientRect();
    const r = originEl ? originEl.getBoundingClientRect() : sRect;
    const ox = r.left + r.width / 2 - sRect.left;
    const oy = r.top + r.height / 2 - sRect.top;

    const modal = document.createElement("div");
    modal.className = "winmodal";
    const backdrop = document.createElement("div");
    backdrop.className = "winmodal__backdrop";
    win = document.createElement("div");
    win.className = "winmodal__window contactwin";
    win.style.transformOrigin = ox + "px " + oy + "px";

    const initials = ME.name.split(" ").map((n) => n[0]).join("").slice(0, 2);

    win.innerHTML =
      '<div class="winmodal__bar contactwin__bar">' +
        '<div class="winmodal__lights">' +
          '<button class="wl wl--close" aria-label="Close">' + G_CLOSE + "</button>" +
          '<button class="wl wl--min" aria-label="Minimize">' + G_MIN + "</button>" +
          '<button class="wl wl--max" aria-label="Expand">' + G_EXPAND + "</button>" +
        "</div>" +
        '<span class="winmodal__title">Contacts</span>' +
      "</div>" +

      '<div class="cw">' +
        '<aside class="cw__side">' +
          '<div class="cw__avatar" aria-hidden="true"><span>' + initials + "</span></div>" +
          '<h2 class="cw__name">' + ME.name + "</h2>" +
          '<p class="cw__role">' + ME.role + "</p>" +
          '<p class="cw__tagline">' + ME.tagline + "</p>" +
          '<div class="cw__apps">' +
            '<a class="cw__app cw__app--doc" href="' + ME.resume + '" target="_blank" rel="noopener" aria-label="Resume (PDF)">' + I_DOC + "</a>" +
            '<a class="cw__app cw__app--li" href="' + ME.linkedin + '" target="_blank" rel="noopener" aria-label="LinkedIn"><span>in</span></a>' +
          "</div>" +
        "</aside>" +

        '<div class="cw__grid">' +
          card("Current Role", ME.title, "wide") +
          card("Location", ME.location) +
          card("Experience", ME.experience) +
          card("Company", ME.company) +
          card("Focus", ME.focus) +
          copyCard("Email", ME.email, "mailto:" + ME.email, ME.email) +
          copyCard("Phone", ME.phone, "tel:" + ME.phone.replace(/[^+\d]/g, ""), ME.phone) +
        "</div>" +
      "</div>";

    modal.appendChild(backdrop);
    modal.appendChild(win);
    screen.appendChild(modal);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => modal.classList.add("winmodal--open"))
    );

    // ---- copy to clipboard, with a fallback for non-secure contexts ----
    win.querySelectorAll(".cw__copy").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const text = btn.dataset.copy;
        let ok = true;
        try {
          await navigator.clipboard.writeText(text);
        } catch (err) {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
          document.body.appendChild(ta);
          ta.select();
          try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
          ta.remove();
        }
        if (!ok) return;
        btn.classList.add("cw__copy--done");
        clearTimeout(btn._t);
        btn._t = setTimeout(() => btn.classList.remove("cw__copy--done"), 1500);
      });
    });

    // ---- window chrome ----
    function close() {
      modal.classList.remove("winmodal--open");
      setTimeout(() => modal.remove(), 330);
      document.removeEventListener("keydown", onKey);
      win = null;
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    backdrop.addEventListener("click", close);
    win.querySelector(".wl--close").addEventListener("click", close);
    const minBtn = win.querySelector(".wl--min");
    minBtn.addEventListener("click", close);
    const maxBtn = win.querySelector(".wl--max");
    maxBtn.addEventListener("click", () => {
      const isMax = win.classList.toggle("contactwin--max");
      maxBtn.innerHTML = isMax ? G_COLLAPSE : G_EXPAND;
      minBtn.disabled = isMax;
    });
    document.addEventListener("keydown", onKey);
  }

  window.ContactsApp = { open: open };

  // The dock's Mail icon (tooltip "Contact") used to be a bare mailto: link,
  // which does nothing in a browser with no mail app set up. It opens the
  // Contacts window instead, the same as the phone's Contacts icon; the email
  // address is one tap away inside it.
  const dockMail = document.querySelector(".dock .dock__app--mail");
  if (dockMail) {
    dockMail.addEventListener("click", (e) => {
      e.preventDefault();
      open(dockMail);
    });
  }
})();

/* ===================== LOCK SCREEN =====================
   Shown over everything on load. The padlock unlocks it: the shackle springs
   open, then the whole screen dissolves upward and the desktop is revealed. */
(function () {
  const lock = document.getElementById("lock");
  if (!lock) return;

  const btn = lock.querySelector(".lock__btn");
  const vid = lock.querySelector(".lock__video");
  const dateEl = lock.querySelector(".lock__date");
  const clockEl = lock.querySelector(".lock__clock");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function tick() {
    const n = new Date();
    let h = n.getHours() % 12 || 12;
    dateEl.textContent = DAYS[n.getDay()] + ", " + MONTHS[n.getMonth()] + " " + n.getDate();
    clockEl.textContent = h + ":" + String(n.getMinutes()).padStart(2, "0");
  }
  tick();
  let clockTimer = setInterval(tick, 1000);

  // ---- playback: skip the first 8 seconds, every time round ----
  const START_AT = 9.5;

  function toStart() {
    // seeking before metadata lands throws, so only do it once we know the length
    if (!vid.duration || isNaN(vid.duration)) return;
    if (vid.duration > START_AT) vid.currentTime = START_AT;
  }
  if (vid) {
    vid.addEventListener("loadedmetadata", toStart);
    toStart(); // metadata may already be there from cache
    // looping by hand so it returns to the 8s mark instead of the very start
    vid.addEventListener("ended", () => {
      toStart();
      const r = vid.play();
      if (r && r.catch) r.catch(() => {});
    });
  }

  // ---- audio ----
  // Tries to start at half volume. Browsers refuse audio until the page has had
  // a real user gesture (a scripted click does not count — isTrusted is false),
  // so when that is refused it falls back to a muted play and the speaker button
  // is the way in. The button is the only dependable path on a first visit.
  const sound = lock.querySelector(".lock__sound");
  const tip = lock.querySelector(".lock__tip");

  function setSoundUI(on) {
    lock.classList.toggle("lock--sound", on);
    sound.setAttribute("aria-pressed", String(on));
    sound.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    // the tooltip names what a click will do next, as macOS controls do
    if (tip) tip.textContent = on ? "Mute" : "Unmute";
  }
  function soundOn() {
    if (!vid) return;
    vid.muted = false;
    vid.volume = 0.5;
    const r = vid.play();
    if (r && r.catch) r.catch(() => {});
    setSoundUI(true);
  }

  if (!reduced && vid) {
    vid.volume = 0.5;
    vid.muted = false;
    const withSound = vid.play();
    if (withSound && withSound.catch) {
      withSound.then(() => setSoundUI(true)).catch(() => {
        vid.muted = true;
        setSoundUI(false);
        const muted = vid.play();
        if (muted && muted.catch) muted.catch(() => {}); // poster stands in
      });
    } else {
      setSoundUI(true);
    }
  }

  sound.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!vid) return;
    if (vid.muted) soundOn();
    else { vid.muted = true; setSoundUI(false); }
  });
  // the always-on hint is a click target as well, so "Unmute" does what it says
  if (tip) {
    tip.addEventListener("click", (e) => {
      e.stopPropagation();
      sound.click();
    });
  }

  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (vid) vid.muted = true; // audio cuts the moment you commit, not at the end
    lock.classList.add("lock--open"); // shackle opens first

    const leave = () => {
      lock.classList.add("lock--gone");
      const done = () => {
        lock.classList.add("lock--hidden");
        lock.setAttribute("aria-hidden", "true");
        clearInterval(clockTimer);
        if (vid) {
          vid.muted = true; // silence before anything else
          vid.pause();      // and nothing decoding behind the desktop
        }
        document.removeEventListener("keydown", onKey);
        // hand focus to the desktop so keyboard users carry on from the top
        const first = document.querySelector(".menubar__item[data-menu]");
        if (first) first.focus({ preventScroll: true });
        // widgets that size themselves were laid out behind an overlay — re-measure
        window.dispatchEvent(new Event("resize"));
      };
      lock.addEventListener("transitionend", function te(e) {
        if (e.target !== lock || e.propertyName !== "opacity") return;
        lock.removeEventListener("transitionend", te);
        done();
      });
      setTimeout(done, 900); // transitionend can be skipped; never strand the overlay
    };

    if (reduced) leave();
    else setTimeout(leave, 260);
  }

  btn.addEventListener("click", unlock);
  function onKey(e) {
    // Enter/Escape unlock too, matching how a real lock screen accepts a keypress
    if (e.key === "Enter" || e.key === "Escape") {
      if (e.target === sound) return; // let the speaker handle its own keys
      unlock();
    }
  }
  document.addEventListener("keydown", onKey);

  // focus the padlock so it can be triggered straight from the keyboard
  requestAnimationFrame(() => btn.focus({ preventScroll: true }));
})();

/* ===================== MOBILE TAB BAR — sliding glass capsule =====================
   iOS 26 moves a single lit capsule between tabs rather than repainting the
   background of each one. One element per bar, translated and resized to the
   active tab, so the highlight glides instead of blinking. */
(function () {
  const screen = document.querySelector(".screen");
  if (!screen || !("MutationObserver" in window)) return;
  const isPhone = () => window.matchMedia("(max-width: 720px)").matches;

  function attach(scroller, activeSel) {
    if (!scroller || scroller.dataset.tabind) return;
    scroller.dataset.tabind = "1";

    const ind = document.createElement("span");
    ind.className = "tabind";
    scroller.insertBefore(ind, scroller.firstChild);

    function move(animate) {
      const act = scroller.querySelector(activeSel);
      if (!act || !isPhone()) {
        ind.style.opacity = "0";
        return;
      }
      if (!animate) ind.style.transition = "none";
      ind.style.opacity = "1";
      ind.style.width = act.offsetWidth + "px";
      ind.style.transform = "translateX(" + act.offsetLeft + "px)";
      if (!animate) requestAnimationFrame(() => (ind.style.transition = ""));
    }

    // the tab's own handler runs first (it bubbles), so the active class is set
    // by the time this fires
    scroller.addEventListener("click", () => requestAnimationFrame(() => move(true)));
    window.addEventListener("resize", () => move(false));
    // fonts/icons can shift widths after first paint — settle once more
    requestAnimationFrame(() => move(false));
    setTimeout(() => move(false), 260);
  }

  function scan(node) {
    if (!node || node.nodeType !== 1 || !node.querySelector) return;
    attach(node.querySelector(".fw__list"), ".fw__item--active");
    attach(node.querySelector(".nw__folders"), ".nw__folder--active");
  }

  new MutationObserver((muts) =>
    muts.forEach((m) => m.addedNodes.forEach(scan))
  ).observe(screen, { childList: true });
})();

/* ===================== iOS APP LIBRARY SEARCH (mobile) =====================
   The bar at the top of the iOS home was decoration. This turns it into a real
   Spotlight-style search: tap it and an overlay slides over the home screen,
   typing filters apps, projects, note sections and links, and picking a result
   opens exactly that thing — a note lands on its own tab, a project opens its
   detail page, a link follows the dock icon it mirrors. */
(function () {
  const bar = document.querySelector(".ios__search");
  const screen = document.querySelector(".screen");
  if (!bar || !screen) return;

  const dock = (cls) => document.querySelector(".dock .dock__app--" + cls);
  const S = (b) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + b + "</svg>";

  const IC = {
    app: S('<rect x="3.4" y="3.4" width="7.2" height="7.2" rx="2"/><rect x="13.4" y="3.4" width="7.2" height="7.2" rx="2"/><rect x="3.4" y="13.4" width="7.2" height="7.2" rx="2"/><rect x="13.4" y="13.4" width="7.2" height="7.2" rx="2"/>'),
    note: S('<path d="M6 3.4h8.6L19 7.8V20a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 20V5A1.6 1.6 0 0 1 6 3.4z"/><path d="M14 3.6V8h4.4"/><path d="M8 12.5h8M8 16h5.5"/>'),
    doc: S('<path d="M6 3.4h8.6L19 7.8V20a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 20V5A1.6 1.6 0 0 1 6 3.4z"/><path d="M14 3.6V8h4.4"/><path d="M12 11v6"/><path d="M9.4 14.4 12 17l2.6-2.6"/>'),
    link: S('<path d="M10.4 13.6a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M13.6 10.4a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3"/>'),
    music: S('<path d="M9 18V6l11-2v12"/><ellipse cx="6.4" cy="18" rx="2.6" ry="2.2"/><ellipse cx="17.4" cy="16" rx="2.6" ry="2.2"/>'),
    phone: S('<path d="M8.4 4.2 5.9 6.6c-.8.8-1 2-.6 3 2.6 7 8.1 12.5 15.1 15.1"/>'),
    call: S('<path d="M7.6 3.9 5.3 6.1a2.4 2.4 0 0 0-.6 2.5A21.4 21.4 0 0 0 15.4 19.3c.9.3 1.9.1 2.5-.6l2.2-2.3a1.4 1.4 0 0 0 0-2l-3-3a1.5 1.5 0 0 0-2.1 0L13.6 12.6a15 15 0 0 1-4.2-4.2L10.8 7a1.5 1.5 0 0 0 0-2.1l-3-3a1.4 1.4 0 0 0-.2 0z"/>'),
    game: S('<rect x="2.6" y="7" width="18.8" height="10.4" rx="4.2"/><path d="M7 10.6v3.2M5.4 12.2h3.2"/><circle cx="15.6" cy="11.6" r="1" fill="currentColor" stroke="none"/><circle cx="18" cy="13.4" r="1" fill="currentColor" stroke="none"/>'),
    folder: S('<path d="M3 8a2 2 0 0 1 2-2h3.4l1.7 2H19a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    person: S('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c0-3.6 3.2-6.2 7.2-6.2s7.2 2.6 7.2 6.2"/>'),
  };

  // ---- what the search can find ------------------------------------------
  // `keys` are extra words that should match beyond the title/subtitle, so
  // "cv" finds the resume and "network" finds LinkedIn.
  const APPS = [
    { title: "Projects", sub: "App", icon: IC.app, keys: "projects work portfolio finder case studies apps",
      run: () => window.PortfolioFinder && window.PortfolioFinder.open() },
    { title: "About Me", sub: "App", icon: IC.note, keys: "about me bio profile notes who ankur meena designer",
      run: () => window.PortfolioNotes && window.PortfolioNotes.open() },
    { title: "Resume", sub: "PDF", icon: IC.doc, keys: "resume cv curriculum vitae pdf download",
      run: () => dock("acrobat") && dock("acrobat").click() },
    { title: "Contacts", sub: "App", icon: IC.call, keys: "contact contacts call phone email reach hire",
      run: () => window.ContactsApp && window.ContactsApp.open(bar) },
    { title: "Spotify", sub: "App", icon: IC.music, keys: "spotify music songs playlist delulu the xx odesza tame impala bonobo tycho queen",
      run: () => window.SpotifyApp && window.SpotifyApp.open(bar) },
    { title: "LinkedIn", sub: "Link", icon: IC.link, keys: "linkedin social network profile connect",
      run: () => dock("linkedin") && dock("linkedin").click() },
    { title: "Tic-Tac-Toe", sub: "Game", icon: IC.game, keys: "tic tac toe game play noughts crosses",
      run: () => document.querySelector('[data-game="ttt"]').click() },
    { title: "Memory", sub: "Game", icon: IC.game, keys: "memory game play cards match",
      run: () => document.querySelector('[data-game="memory"]').click() },
  ];

  const GROUPS = [
    { g: "featured", title: "Live Projects", keys: "live site web app vercel featured" },
    { g: "ai", title: "Figma Files", keys: "figma design file assignment design system dashboard power bi security rule engine truck logistics case study notion" },
  ];

  function catalogue() {
    const out = APPS.map((a) => ({ ...a, section: "Applications" }));

    (window.PortfolioNotes ? window.PortfolioNotes.tabs : []).forEach((t) => {
      out.push({
        title: t, sub: "About Me", icon: IC.note, section: "About Me",
        keys: (window.PortfolioNotes.text[t] || ""),
        run: () => window.PortfolioNotes.open(bar, t),
      });
    });

    GROUPS.forEach((g) =>
      out.push({
        title: g.title, sub: "Projects", icon: IC.folder, section: "Categories", keys: g.keys,
        run: () => window.PortfolioFinder && window.PortfolioFinder.open(bar, { group: g.g }),
      })
    );

    (window.PortfolioProjects || []).forEach((p) =>
      out.push({
        title: p.title, sub: p.cat, icon: IC.folder, section: "Projects",
        keys: [p.title, p.cat, p.desc, (p.stack || []).join(" "),
               (p.tags || []).map((t) => t[0]).join(" ")].join(" "),
        run: () => window.PortfolioFinder && window.PortfolioFinder.open(bar, { project: p.title }),
      })
    );
    return out;
  }

  let ITEMS = null;
  const norm = (s) => (s || "").toLowerCase();

  // rank: title prefix beats a title word beats a title substring beats a
  // body-text hit, so typing "res" puts Resume above a project that mentions it
  function score(item, q) {
    const t = norm(item.title), sub = norm(item.sub), keys = norm(item.keys);
    if (t.startsWith(q)) return 0;
    if (new RegExp("\\b" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(t)) return 1;
    if (t.includes(q)) return 2;
    if (sub.includes(q)) return 3;
    if (new RegExp("\\b" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(keys)) return 4;
    if (keys.includes(q)) return 5;
    return -1;
  }

  function search(query) {
    const q = norm(query).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    return ITEMS
      .map((it) => {
        // every word has to hit something, and the best word's rank wins
        let best = 99;
        for (const w of words) {
          const sc = score(it, w);
          if (sc < 0) return null;
          best = Math.min(best, sc);
        }
        return { it, sc: best };
      })
      .filter(Boolean)
      .sort((a, b) => a.sc - b.sc || a.it.title.localeCompare(b.it.title))
      .map((r) => r.it);
  }

  // ---- overlay -----------------------------------------------------------
  let ov = null, input = null, list = null;

  const esc = (t) =>
    String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  function rowHTML(it) {
    return (
      '<button class="issr" type="button" data-title="' + esc(it.title) + '">' +
      '<span class="issr__ic">' + it.icon + "</span>" +
      '<span class="issr__txt"><span class="issr__t">' + esc(it.title) + "</span>" +
      '<span class="issr__s">' + esc(it.sub) + "</span></span>" +
      '<span class="issr__go" aria-hidden="true">' +
      S('<path d="M9 6l6 6-6 6"/>') + "</span></button>"
    );
  }

  function render(results, query) {
    if (!query) {
      // empty box shows the apps, the way the App Library does
      list.innerHTML =
        '<div class="isss">Suggestions</div>' +
        APPS.map(rowHTML).join("");
      return;
    }
    if (!results.length) {
      list.innerHTML =
        '<div class="issnone">No Results<span>Try “resume”, “LinkedIn”, “Figma” or a project name.</span></div>';
      return;
    }
    // Bucket by section so each heading appears once. Results arrive in score
    // order and a Map keeps insertion order, so a section lands where its
    // best-ranked hit does — relevance still drives the ordering.
    const buckets = new Map();
    results.slice(0, 40).forEach((it) => {
      if (!buckets.has(it.section)) buckets.set(it.section, []);
      buckets.get(it.section).push(it);
    });
    let html = "";
    buckets.forEach((items, section) => {
      html += '<div class="isss">' + esc(section) + "</div>";
      html += items.map(rowHTML).join("");
    });
    list.innerHTML = html;
  }

  let shown = [];
  function update() {
    const q = input.value;
    shown = q.trim() ? search(q) : APPS.slice();
    render(q.trim() ? shown : null, q.trim());
  }

  function close() {
    if (!ov) return;
    const el = ov;
    ov = null;
    el.classList.remove("iss--open");
    input.blur();
    setTimeout(() => el.remove(), 240);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") {
      if (input.value) { input.value = ""; update(); }
      else close();
    }
  }

  function openSearch() {
    if (ov) return;
    if (!ITEMS) ITEMS = catalogue(); // built lazily: the other modules load first
    ov = document.createElement("div");
    ov.className = "iss";
    ov.innerHTML =
      '<div class="iss__scrim"></div>' +
      '<div class="iss__panel">' +
        '<div class="iss__bar">' +
          '<label class="iss__field">' +
            S('<circle cx="10" cy="10" r="6.5"/><path d="M15 15l5 5"/>') +
            '<input class="iss__in" type="search" placeholder="Search" ' +
            'autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" ' +
            'enterkeyhint="go" aria-label="Search apps and content">' +
            '<button class="iss__clear" type="button" aria-label="Clear">' +
              S('<circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/>') +
            "</button>" +
          "</label>" +
          '<button class="iss__cancel" type="button">Cancel</button>' +
        "</div>" +
        '<div class="iss__list"></div>' +
      "</div>";
    screen.appendChild(ov);
    input = ov.querySelector(".iss__in");
    list = ov.querySelector(".iss__list");
    update();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        ov.classList.add("iss--open");
        input.focus();
      })
    );

    ov.querySelector(".iss__scrim").addEventListener("click", close);
    ov.querySelector(".iss__cancel").addEventListener("click", close);
    ov.querySelector(".iss__clear").addEventListener("click", () => {
      input.value = "";
      update();
      input.focus();
    });
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = list.querySelector(".issr");
        if (first) first.click();
      }
    });
    list.addEventListener("click", (e) => {
      const row = e.target.closest(".issr");
      if (!row) return;
      const title = row.dataset.title;
      const hit = (input.value.trim() ? shown : APPS).find((x) => x.title === title);
      close();
      // let the overlay finish leaving before the window zooms in over it
      if (hit) setTimeout(() => { try { hit.run(); } catch (err) {} }, 160);
    });
    document.addEventListener("keydown", onKey);
  }

  bar.setAttribute("role", "button");
  bar.setAttribute("tabindex", "0");
  bar.style.cursor = "pointer";
  bar.addEventListener("click", openSearch);
  bar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSearch(); }
  });
})();
