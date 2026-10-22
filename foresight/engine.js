/* Foresight engine: headless, dependency-free forecasting maths.
 * Works in Node (require) and in a browser (window.Foresight). No DOM, no eval:
 * user formulas go through the small parser in `compile`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Foresight = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function parseNumbers(s) {
    return (String(s).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number).filter(isFinite);
  }

  /* ---------- sandboxed expression compiler ---------- */
  const FUNCS = {
    min: Math.min, max: Math.max, sqrt: Math.sqrt, pow: Math.pow, log: Math.log, log10: Math.log10,
    exp: Math.exp, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round
  };
  const CONSTS = { pi: Math.PI, e: Math.E };

  function tokenize(src) {
    const toks = [], re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|(\*\*|<=|>=|==|!=|[-+*/%^(),<>?:]))/y;
    let i = 0;
    while (i < src.length) {
      if (/^\s*$/.test(src.slice(i))) break;
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) throw new Error('Unexpected character "' + src.slice(i).trim()[0] + '"');
      i = re.lastIndex;
      if (m[1] !== undefined) toks.push({ t: 'num', v: parseFloat(m[1]) });
      else if (m[2] !== undefined) toks.push({ t: 'id', v: m[2] });
      else toks.push({ t: 'op', v: m[3] === '**' ? '^' : m[3] });
    }
    return toks;
  }

  /** Compile an arithmetic expression. Returns fn(vars) -> number. Throws on bad syntax or unknown names. */
  function compile(src, names) {
    if (typeof src !== 'string' || !src.trim()) throw new Error('Formula is empty');
    if (src.length > 500) throw new Error('Formula is too long');
    const known = new Set(names || []), toks = tokenize(src);
    let pos = 0;
    const peek = () => toks[pos], isOp = v => peek() && peek().t === 'op' && peek().v === v;
    const eat = v => { if (!isOp(v)) throw new Error('Expected "' + v + '"'); pos++; };
    function ternary() {
      const c = cmp();
      if (isOp('?')) { pos++; const a = ternary(); eat(':'); const b = ternary(); return v => (c(v) ? a(v) : b(v)); }
      return c;
    }
    function cmp() {
      let l = add();
      const t = peek();
      if (t && t.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) {
        pos++; const r = add(), op = t.v;
        const f = { '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b }[op];
        const lf = l; l = v => (f(lf(v), r(v)) ? 1 : 0);
      }
      return l;
    }
    function add() {
      let l = mul();
      while (isOp('+') || isOp('-')) { const op = toks[pos++].v, r = mul(), lf = l; l = op === '+' ? v => lf(v) + r(v) : v => lf(v) - r(v); }
      return l;
    }
    function mul() {
      let l = unary();
      while (isOp('*') || isOp('/') || isOp('%')) {
        const op = toks[pos++].v, r = unary(), lf = l;
        l = op === '*' ? v => lf(v) * r(v) : op === '/' ? v => lf(v) / r(v) : v => lf(v) % r(v);
      }
      return l;
    }
    function unary() {
      if (isOp('-')) { pos++; const a = unary(); return v => -a(v); }
      if (isOp('+')) { pos++; return unary(); }
      return pow();
    }
    function pow() {
      const b = atom();
      if (isOp('^')) { pos++; const e = unary(); return v => Math.pow(b(v), e(v)); }
      return b;
    }
    function atom() {
      const t = toks[pos++];
      if (!t) throw new Error('Formula ends too early');
      if (t.t === 'num') return () => t.v;
      if (t.t === 'id') {
        if (isOp('(')) {
          const fn = Object.prototype.hasOwnProperty.call(FUNCS, t.v) ? FUNCS[t.v] : null;
          if (!fn || known.has(t.v)) throw new Error('Unknown function "' + t.v + '"');
          pos++; const args = [];
          if (!isOp(')')) { do { args.push(ternary()); if (isOp(',')) pos++; else break; } while (true); }
          eat(')');
          return v => fn(...args.map(a => a(v)));
        }
        if (known.has(t.v)) return v => v[t.v];
        if (Object.prototype.hasOwnProperty.call(CONSTS, t.v)) { const c = CONSTS[t.v]; return () => c; }
        throw new Error('Unknown name "' + t.v + '"');
      }
      if (t.v === '(') { const e = ternary(); eat(')'); return e; }
      throw new Error('Unexpected "' + t.v + '"');
    }
    const f = ternary();
    if (pos < toks.length) throw new Error('Unexpected "' + toks[pos].v + '"');
    return f;
  }

  /* ---------- trend forecasting ---------- */
  function ols(x, y) {
    const n = x.length, mx = avg(x), my = avg(y);
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
    const b = sxy / sxx, a = my - b * mx;
    let sse = 0; for (let i = 0; i < n; i++) sse += (y[i] - (a + b * x[i])) ** 2;
    return { a, b, mx, sxx, n, s: Math.sqrt(sse / Math.max(1, n - 2)) };
  }
  const idx = y => y.map((_, i) => i);
  const METHODS = {
    linear: {
      name: 'Linear',
      run(y, H, z) {
        const n = y.length, f = ols(idx(y), y), mean = [], lo = [], hi = [];
        for (let h = 1; h <= H; h++) {
          const t = n - 1 + h, m = f.a + f.b * t, sd = f.s * Math.sqrt(1 + 1 / n + (t - f.mx) ** 2 / f.sxx);
          mean.push(m); lo.push(m - z * sd); hi.push(m + z * sd);
        }
        return { mean, lo, hi };
      }
    },
    exp: {
      name: 'Exponential',
      ok: y => y.every(v => v > 0),
      run(y, H, z) {
        const n = y.length, f = ols(idx(y), y.map(Math.log)), mean = [], lo = [], hi = [];
        for (let h = 1; h <= H; h++) {
          const t = n - 1 + h, m = f.a + f.b * t, sd = f.s * Math.sqrt(1 + 1 / n + (t - f.mx) ** 2 / f.sxx);
          mean.push(Math.exp(m)); lo.push(Math.exp(m - z * sd)); hi.push(Math.exp(m + z * sd));
        }
        return { mean, lo, hi };
      }
    },
    holt: {
      name: 'Damped trend',
      run(y, H, z) {
        const n = y.length; let best = null;
        for (let a = .1; a < .95; a += .1) for (let b = .1; b < .95; b += .1) for (const p of [.8, .9, .95, 1]) {
          let l = y[0], t = y[1] - y[0], sse = 0;
          for (let i = 1; i < n; i++) {
            const pred = l + p * t, e = y[i] - pred; sse += e * e;
            const ln = a * y[i] + (1 - a) * pred; t = b * (ln - l) + (1 - b) * p * t; l = ln;
          }
          if (!best || sse < best.sse) best = { sse, l, t, p };
        }
        const s = Math.sqrt(best.sse / Math.max(1, n - 1)), mean = [], lo = [], hi = [];
        let damp = 0, pw = 1;
        for (let h = 1; h <= H; h++) {
          pw *= best.p; damp += pw;
          const m = best.l + damp * best.t, sd = s * Math.sqrt(h);
          mean.push(m); lo.push(m - z * sd); hi.push(m + z * sd);
        }
        return { mean, lo, hi };
      }
    }
  };
  const Z = { 50: 0.6745, 80: 1.2816, 90: 1.6449, 95: 1.96 };

  /** forecast(y, {h, z, method}) -> {used, name, mean, lo, hi, backtest, note} */
  function forecast(y, opts) {
    opts = opts || {};
    if (!Array.isArray(y) || y.length < 4) throw new Error('Need at least 4 values');
    const n = y.length, H = clamp(Math.round(opts.h || 8), 1, 500), z = opts.z || Z[80];
    const avail = Object.keys(METHODS).filter(k => !METHODS[k].ok || METHODS[k].ok(y));
    let back = null;
    if (n >= 8) {
      const k = Math.max(2, Math.floor(n * .25)), train = y.slice(0, n - k), test = y.slice(n - k);
      back = {};
      avail.forEach(key => {
        if (METHODS[key].ok && !METHODS[key].ok(train)) return;
        const r = METHODS[key].run(train, k, z);
        back[key] = avg(r.mean.map((m, i) => Math.abs(m - test[i])));
      });
    }
    let pick = opts.method || 'auto', note = '';
    if (pick !== 'auto' && !avail.includes(pick)) { note = 'Exponential needs all values above zero, so linear was used.'; pick = 'linear'; }
    if (pick === 'auto') pick = back && Object.keys(back).length ? Object.keys(back).sort((a, b) => back[a] - back[b])[0] : 'linear';
    const r = METHODS[pick].run(y, H, z);
    return { used: pick, name: METHODS[pick].name, h: H, mean: r.mean, lo: r.lo, hi: r.hi, backtest: back, note };
  }

  /** Steps at which the forecast reaches a target: central, earliest and latest edge of the range. */
  function crossing(y, r, target) {
    const last = y[y.length - 1], up = target >= last, c = v => (up ? v >= target : v <= target);
    const first = arr => { const i = arr.findIndex(c); return i < 0 ? null : i + 1; };
    return { central: first(r.mean), earliest: first(up ? r.hi : r.lo), latest: first(up ? r.lo : r.hi) };
  }

  /* ---------- Monte Carlo ---------- */
  function rng(seed) {
    let a = (seed === undefined || seed === null ? Math.floor(Math.random() * 2 ** 32) : seed) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const triangular = (a, m, b, u) => {
    if (b === a) return a;
    const F = (m - a) / (b - a);
    return u < F ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
  };

  /** simulate({inputs:[{name,min,mode,max}], formula, trials, seed, threshold}) */
  function simulate(cfg) {
    const rows = (cfg.inputs || []).map(r => ({ name: String(r.name).trim(), a: +r.min, m: +r.mode, b: +r.max }));
    const names = rows.map(r => r.name);
    for (const r of rows) {
      if (!/^[A-Za-z_]\w*$/.test(r.name)) return { error: '"' + r.name + '" is not a usable name. Use letters, digits and underscores, starting with a letter.' };
      if (![r.a, r.m, r.b].every(isFinite) || !(r.a <= r.m && r.m <= r.b)) return { error: r.name + ': needs low ≤ likely ≤ high.' };
    }
    if (new Set(names).size !== names.length) return { error: 'Input names must be unique.' };
    let fn; try { fn = compile(cfg.formula, names); } catch (e) { return { error: 'Formula: ' + e.message }; }
    const N = clamp(Math.round(cfg.trials || 20000), 100, 1e6), rand = rng(cfg.seed);
    const res = new Float64Array(N), ins = rows.map(() => new Float64Array(N)), vars = {};
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < rows.length; j++) vars[rows[j].name] = ins[j][i] = triangular(rows[j].a, rows[j].m, rows[j].b, rand());
      res[i] = fn(vars);
    }
    const keep = []; for (let i = 0; i < N; i++) if (isFinite(res[i])) keep.push(i);
    if (keep.length < N * .5) return { error: 'The formula did not produce numbers for most trials. Check names and operators.' };
    const vals = keep.map(i => res[i]), sorted = Float64Array.from(vals).sort();
    const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
    const th = cfg.threshold === undefined || cfg.threshold === null || cfg.threshold === '' ? null : +cfg.threshold;
    const lo = q(.005), hi = q(.995), B = 40, bins = new Array(B).fill(0), span = hi - lo || 1;
    vals.forEach(v => { if (v >= lo && v <= hi) bins[Math.min(B - 1, Math.floor((v - lo) / span * B))]++; });
    const sens = rows.map((r, j) => {
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; const k = keep.length;
      keep.forEach(i => { const x = ins[j][i], y = res[i]; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; });
      const den = Math.sqrt((sxx - sx * sx / k) * (syy - sy * sy / k));
      return { name: r.name, r: den > 0 ? (sxy - sx * sy / k) / den : 0 };
    }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return {
      trials: keep.length, mean: avg(vals), p5: q(.05), p10: q(.1), p50: q(.5), p90: q(.9), p95: q(.95),
      pAbove: th === null || !isFinite(th) ? null : vals.filter(v => v > th).length / vals.length,
      threshold: th, hist: { lo, hi, bins }, sens
    };
  }

  /* ---------- Bayes ---------- */
  /** bayes(priorPercent, [{label, ph, pn, seen}]) -> steps */
  function bayes(priorPct, rows) {
    const c = v => clamp(v, .001, .999);
    let p = c((+priorPct || 0) / 100);
    const steps = [{ label: 'Prior', lr: null, post: p }];
    rows.forEach(r => {
      const ph = c((+r.ph || 0) / 100), pn = c((+r.pn || 0) / 100), seen = r.seen === true || r.seen === '1' || r.seen === 1;
      const lr = seen ? ph / pn : (1 - ph) / (1 - pn), odds = p / (1 - p) * lr;
      p = odds / (1 + odds);
      steps.push({ label: (seen ? '' : 'No: ') + (r.label || 'Evidence'), lr, post: p });
    });
    return steps;
  }

  /* ---------- decisions ---------- */
  /** decide([{name, outcomes:[{p, v}]}], lambda) -> options with ev, sd, worst, best, score (sorted best first) */
  function decide(options, lambda) {
    const lam = lambda === undefined ? .5 : lambda;
    return options.map(o => {
      const outs = (o.outcomes || []).map(x => ({ p: Math.max(0, +x.p), v: +x.v })).filter(x => isFinite(x.p) && isFinite(x.v));
      const tot = outs.reduce((s, x) => s + x.p, 0);
      if (!outs.length || tot <= 0) return { name: o.name, bad: true };
      const ps = outs.map(x => x.p / tot), ev = outs.reduce((s, x, i) => s + ps[i] * x.v, 0);
      const sd = Math.sqrt(outs.reduce((s, x, i) => s + ps[i] * (x.v - ev) ** 2, 0));
      return { name: o.name, ev, sd, worst: Math.min(...outs.map(x => x.v)), best: Math.max(...outs.map(x => x.v)), score: ev - lam * sd, rescaled: Math.abs(tot - 100) > .01 };
    }).filter(r => !r.bad).sort((a, b) => b.score - a.score);
  }

  /* ---------- growth ---------- */
  function growth(cfg) {
    const s0 = +cfg.start, r = (+cfg.rate) / 100, P = clamp(Math.round(cfg.periods) || 1, 1, 500), add = +cfg.add || 0;
    const points = [s0]; for (let i = 1; i <= P; i++) points.push(points[i - 1] * (1 + r) + add);
    let reach = null;
    if (cfg.target !== undefined && cfg.target !== null && cfg.target !== '' && isFinite(+cfg.target)) {
      const tg = +cfg.target, up = tg >= s0; let v = s0, i = 0; reach = 'never';
      while (i < 10000) {
        if (up ? v >= tg : v <= tg) { reach = i; break; }
        const nv = v * (1 + r) + add;
        if (up ? nv <= v : nv >= v) break;
        v = nv; i++;
      }
    }
    return { points, end: points[P], contributed: s0 + add * P, doubling: r > 0 ? Math.log(2) / Math.log(1 + r) : null, reach };
  }
  const cagr = (b, e, n) => (b > 0 && e > 0 && n > 0 ? Math.pow(e / b, 1 / n) - 1 : null);

  /* ---------- scoring forecasts ---------- */
  /** score([{p, outcome}]) -> {n, hitRate, brier, buckets[10]} (only resolved items count) */
  function score(preds) {
    const done = preds.filter(x => x.outcome === true || x.outcome === false);
    const buckets = Array.from({ length: 10 }, () => ({ n: 0, p: 0, o: 0 }));
    done.forEach(x => { const b = buckets[Math.min(9, Math.floor(x.p * 10))]; b.n++; b.p += x.p; b.o += x.outcome ? 1 : 0; });
    return {
      n: done.length,
      hitRate: done.length ? done.filter(x => x.outcome).length / done.length : null,
      brier: done.length ? avg(done.map(x => (x.p - (x.outcome ? 1 : 0)) ** 2)) : null,
      buckets
    };
  }

  return { parseNumbers, compile, forecast, crossing, simulate, bayes, decide, growth, cagr, score, rng, Z, METHODS };
});
