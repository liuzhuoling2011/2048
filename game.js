(() => {
  "use strict";

  const SIZE = 4;
  const BEST_KEY = "neon2048-best";
  const MOVE_MS = 140;

  const boardEl = document.getElementById("board");
  const gridBg = document.getElementById("gridBg");
  const tilesEl = document.getElementById("tiles");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const scoreDeltaEl = document.getElementById("scoreDelta");
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalMsg = document.getElementById("modalMsg");
  const btnContinue = document.getElementById("btnContinue");
  const btnRestart = document.getElementById("btnRestart");
  const btnNew = document.getElementById("btnNew");

  /** @type {number[][]} */
  let grid = [];
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let won = false;
  let keepPlaying = false;
  let over = false;
  let animating = false;
  let tileIdSeq = 1;
  /** @type {Map<number, HTMLElement>} */
  const tileNodes = new Map();
  /** @type {{id:number, r:number, c:number, v:number}[]} */
  let tiles = [];

  bestEl.textContent = String(best);

  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    gridBg.appendChild(cell);
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }



  function createTileEl(tile, { spawn = false, pop = false } = {}) {
    const el = document.createElement("div");
    const cls = tile.v >= 65536 ? "v65536" : `v${tile.v}`;
    el.className = `tile ${cls}` + (spawn ? " spawn" : "") + (pop ? " pop" : "");
    el.dataset.id = String(tile.id);
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = String(tile.v);
    el.appendChild(num);
    tilesEl.appendChild(el);
    tileNodes.set(tile.id, el);
    requestAnimationFrame(() => {
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 12;
      const boardW = boardEl.clientWidth - gap * 2;
      const cell = (boardW - gap * (SIZE - 1)) / SIZE;
      el.style.width = `${cell}px`;
      el.style.height = `${cell}px`;
      el.style.transform = `translate(${tile.c * (cell + gap)}px, ${tile.r * (cell + gap)}px)`;
    });
    return el;
  }

  function rebuildFromGrid(spawnIds = new Set(), mergeIds = new Set()) {
    tilesEl.innerHTML = "";
    tileNodes.clear();
    tiles = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (!v) continue;
        const id = tileIdSeq++;
        const tile = { id, r, c, v };
        tiles.push(tile);
        createTileEl(tile, {
          spawn: spawnIds.has(`${r},${c}`),
          pop: mergeIds.has(`${r},${c}`),
        });
      }
    }
  }

  function randomEmpty() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) empties.push([r, c]);
      }
    }
    if (!empties.length) return null;
    return empties[(Math.random() * empties.length) | 0];
  }

  function spawnTile() {
    const pos = randomEmpty();
    if (!pos) return null;
    const [r, c] = pos;
    const v = Math.random() < 0.9 ? 2 : 4;
    grid[r][c] = v;
    return { r, c, v };
  }

  function showScoreDelta(n) {
    if (!n) return;
    scoreDeltaEl.hidden = false;
    scoreDeltaEl.textContent = `+${n}`;
    scoreDeltaEl.style.animation = "none";
    // reflow
    void scoreDeltaEl.offsetWidth;
    scoreDeltaEl.style.animation = "";
    clearTimeout(showScoreDelta._t);
    showScoreDelta._t = setTimeout(() => {
      scoreDeltaEl.hidden = true;
    }, 700);
  }

  function setScore(n, delta = 0) {
    score = n;
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem(BEST_KEY, String(best));
    }
    if (delta) showScoreDelta(delta);
  }

  function canMove() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!grid[r][c]) return true;
        const v = grid[r][c];
        if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function hideOverlay() {
    overlay.hidden = true;
    btnContinue.hidden = true;
  }

  function showWin() {
    won = true;
    modalTitle.textContent = "太棒了！";
    modalMsg.textContent = "你合成了 2048！要不要继续冲击更高分？";
    btnContinue.hidden = false;
    btnRestart.textContent = "再来一局";
    overlay.hidden = false;
    playTone(880, 0.08, "triangle");
    setTimeout(() => playTone(1175, 0.12, "triangle"), 90);
  }

  function showGameOver() {
    over = true;
    modalTitle.textContent = "游戏结束";
    modalMsg.textContent = `本局得分 ${score}。再试一次，冲击新纪录！`;
    btnContinue.hidden = true;
    btnRestart.textContent = "再来一局";
    overlay.hidden = false;
    playTone(180, 0.18, "sawtooth");
  }

  // Soft WebAudio feedback (optional / silent if blocked)
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }
  function playTone(freq, dur, type = "sine") {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  /**
   * Slide+merge one line toward the start (left/up).
   * Returns { line, merges: [{from,to,value}], moved, gained }
   */
  function slideLine(line) {
    const filtered = line.filter((v) => v !== 0);
    const out = [];
    const merges = [];
    let gained = 0;
    let i = 0;
    while (i < filtered.length) {
      if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
        const val = filtered[i] * 2;
        out.push(val);
        merges.push(val);
        gained += val;
        i += 2;
      } else {
        out.push(filtered[i]);
        i += 1;
      }
    }
    while (out.length < SIZE) out.push(0);
    const moved = out.some((v, idx) => v !== line[idx]);
    return { line: out, merges, moved, gained };
  }

  function vectors(dir) {
    // traverse order so we process from the "far" side first conceptually —
    // we extract lines toward the destination edge.
    if (dir === "left") {
      return {
        getLine: (i) => grid[i].slice(),
        setLine: (i, line) => { grid[i] = line; },
        mapPos: (i, j) => ({ r: i, c: j }),
      };
    }
    if (dir === "right") {
      return {
        getLine: (i) => grid[i].slice().reverse(),
        setLine: (i, line) => { grid[i] = line.slice().reverse(); },
        mapPos: (i, j) => ({ r: i, c: SIZE - 1 - j }),
      };
    }
    if (dir === "up") {
      return {
        getLine: (i) => [grid[0][i], grid[1][i], grid[2][i], grid[3][i]],
        setLine: (i, line) => {
          for (let r = 0; r < SIZE; r++) grid[r][i] = line[r];
        },
        mapPos: (i, j) => ({ r: j, c: i }),
      };
    }
    // down
    return {
      getLine: (i) => [grid[3][i], grid[2][i], grid[1][i], grid[0][i]],
      setLine: (i, line) => {
        for (let r = 0; r < SIZE; r++) grid[3 - r][i] = line[r];
      },
      mapPos: (i, j) => ({ r: SIZE - 1 - j, c: i }),
    };
  }

  /**
   * Animate by rebuilding after computing new positions from previous tiles.
   * We track each tile id movement for CSS transform transitions.
   */
  function move(dir) {
    if (animating || over) return;
    if (won && !keepPlaying) return;

    // Snapshot previous occupancy as list of values with positions for animation planning
    const prev = tiles.map((t) => ({ ...t }));
    const prevGrid = grid.map((row) => row.slice());

    const v = vectors(dir);
    let anyMoved = false;
    let gained = 0;
    const mergeMarks = []; // positions that resulted from merge

    for (let i = 0; i < SIZE; i++) {
      const before = v.getLine(i);
      const result = slideLine(before);
      if (result.moved) anyMoved = true;
      gained += result.gained;
      v.setLine(i, result.line);
      // mark merge cells: scan result line for merge values sequentially matching
      // Better: re-simulate to find merge destinations
      const filtered = before.filter((x) => x !== 0);
      let idx = 0;
      let outJ = 0;
      while (idx < filtered.length) {
        if (idx + 1 < filtered.length && filtered[idx] === filtered[idx + 1]) {
          const pos = v.mapPos(i, outJ);
          mergeMarks.push(`${pos.r},${pos.c}`);
          idx += 2;
          outJ += 1;
        } else {
          idx += 1;
          outJ += 1;
        }
      }
    }

    if (!anyMoved) {
      grid = prevGrid;
      return;
    }

    animating = true;
    setScore(score + gained, gained);
    if (gained) playTone(520 + Math.min(400, gained / 2), 0.05, "sine");
    else playTone(320, 0.03, "sine");

    // Build movement plan: for each destination cell, find source tile(s)
    // Strategy: greedy match from previous tiles along travel axis
    animateTransition(prev, prevGrid, dir, new Set(mergeMarks), () => {
      const spawned = spawnTile();
      const spawnSet = new Set();
      if (spawned) spawnSet.add(`${spawned.r},${spawned.c}`);

      // Full rebuild with spawn + merge pop
      rebuildFromGrid(spawnSet, new Set(mergeMarks));
      animating = false;

      // Win / lose checks
      let hit2048 = false;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (grid[r][c] === 2048) hit2048 = true;
        }
      }
      if (hit2048 && !won) {
        showWin();
        return;
      }
      if (!canMove()) showGameOver();
    });
  }

  function animateTransition(prevTiles, prevGrid, dir, mergeSet, done) {
    // Clear DOM and recreate previous tiles at old positions, then transition to new
    tilesEl.innerHTML = "";
    tileNodes.clear();

    // Assign each prev tile a destination by simulating classic 2048 traversal
    const assignments = planMoves(prevGrid, dir);

    const live = [];
    for (const a of assignments) {
      const el = document.createElement("div");
      const cls = a.v >= 65536 ? "v65536" : `v${a.v}`;
      el.className = `tile ${cls}`;
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(a.v);
      el.appendChild(num);
      tilesEl.appendChild(el);

      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 12;
      const boardW = boardEl.clientWidth - gap * 2;
      const cell = (boardW - gap * (SIZE - 1)) / SIZE;
      el.style.width = `${cell}px`;
      el.style.height = `${cell}px`;
      el.style.transform = `translate(${a.fromC * (cell + gap)}px, ${a.fromR * (cell + gap)}px)`;
      live.push({ el, a, cell, gap });
    }

    // Force layout then move
    void tilesEl.offsetWidth;
    for (const item of live) {
      const { el, a, cell, gap } = item;
      el.style.transform = `translate(${a.toC * (cell + gap)}px, ${a.toR * (cell + gap)}px)`;
    }

    setTimeout(done, MOVE_MS + 16);
  }

  function planMoves(prevGrid, dir) {
    // Recreate slide per line while tracking source cells for each output slot.
    const result = [];
    const meta = vectors(dir);

    for (let i = 0; i < SIZE; i++) {
      // Collect source positions along the line (in travel-toward-start order)
      const sources = [];
      for (let j = 0; j < SIZE; j++) {
        const p = meta.mapPos(i, j);
        const val = prevGrid[p.r][p.c];
        if (val) sources.push({ r: p.r, c: p.c, v: val });
      }

      let idx = 0;
      let outJ = 0;
      while (idx < sources.length) {
        const a = sources[idx];
        if (idx + 1 < sources.length && sources[idx + 1].v === a.v) {
          const b = sources[idx + 1];
          const dest = meta.mapPos(i, outJ);
          // Both tiles move to dest (merge); keep both for animation
          result.push({ fromR: a.r, fromC: a.c, toR: dest.r, toC: dest.c, v: a.v, merge: true });
          result.push({ fromR: b.r, fromC: b.c, toR: dest.r, toC: dest.c, v: b.v, merge: true });
          idx += 2;
          outJ += 1;
        } else {
          const dest = meta.mapPos(i, outJ);
          result.push({ fromR: a.r, fromC: a.c, toR: dest.r, toC: dest.c, v: a.v, merge: false });
          idx += 1;
          outJ += 1;
        }
      }
    }
    return result;
  }

  function newGame() {
    hideOverlay();
    grid = emptyGrid();
    score = 0;
    setScore(0);
    won = false;
    keepPlaying = false;
    over = false;
    animating = false;
    tiles = [];
    tileNodes.clear();
    tilesEl.innerHTML = "";
    spawnTile();
    spawnTile();
    const spawnSet = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) spawnSet.add(`${r},${c}`);
      }
    }
    rebuildFromGrid(spawnSet, new Set());
    playTone(640, 0.05, "triangle");
  }

  // Input
  const keyMap = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    a: "left",
    d: "right",
    w: "up",
    s: "down",
    A: "left",
    D: "right",
    W: "up",
    S: "down",
  };

  window.addEventListener("keydown", (e) => {
    const dir = keyMap[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  let touchStart = null;
  boardEl.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    { passive: true }
  );
  boardEl.addEventListener(
    "touchmove",
    (e) => {
      if (touchStart) e.preventDefault();
    },
    { passive: false }
  );
  boardEl.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 24) return;
      if (absX > absY) move(dx > 0 ? "right" : "left");
      else move(dy > 0 ? "down" : "up");
    },
    { passive: true }
  );

  btnNew.addEventListener("click", newGame);
  btnRestart.addEventListener("click", newGame);
  btnContinue.addEventListener("click", () => {
    keepPlaying = true;
    hideOverlay();
  });

  window.addEventListener("resize", () => {
    // Reposition existing tiles with updated cell size
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gap")) || 12;
    const boardW = boardEl.clientWidth - gap * 2;
    const cell = (boardW - gap * (SIZE - 1)) / SIZE;
    document.documentElement.style.setProperty("--cell-size", `${cell}px`);
    for (const t of tiles) {
      const el = tileNodes.get(t.id);
      if (!el) continue;
      el.style.width = `${cell}px`;
      el.style.height = `${cell}px`;
      el.style.transform = `translate(${t.c * (cell + gap)}px, ${t.r * (cell + gap)}px)`;
    }
  });

  // Boot
  newGame();
})();
