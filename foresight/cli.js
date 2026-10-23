#!/usr/bin/env node
/* Foresight CLI: every command prints JSON, takes no network and runs no user code. */
'use strict';
const fs = require('fs');
const F = require('./engine.js');

const HELP = `foresight <command> [options]

  trend  "1,2,3,..."  [--h 8] [--ci 80] [--method auto|linear|exp|holt] [--target N]
  sim    --formula "a*b" --var "a=low,likely,high" [--var ...] [--trials 20000] [--seed 1] [--threshold N]
  bayes  --prior 5 --ev "pIfTrue,pIfFalse[,no]" [--ev ...]        (percentages)
  decide --opt "Name:chance,payoff;chance,payoff" [--opt ...] [--risk 0.5]
  growth --start N --rate PCT --periods N [--add N] [--target N]
  cagr   BEGIN END PERIODS
  score  FILE.json | -      (list of {"p":0.7,"outcome":true})

Examples:
  foresight trend "120,128,131,145,152,149,166,171" --h 6
  foresight sim --formula "units*price" --var "units=100,150,300" --var "price=9,12,15" --seed 1`;

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2), v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      (opt[k] = opt[k] || []).push(v);
    } else pos.push(a);
  }
  return { pos, opt, one: k => (opt[k] ? opt[k][opt[k].length - 1] : undefined) };
}
const num = (v, d) => (v === undefined ? d : Number(v));
const out = o => console.log(JSON.stringify(o, (k, v) => (typeof v === 'number' && !isFinite(v) ? null : v), 2));
const die = m => { console.error('foresight: ' + m); process.exit(1); };

function main(argv) {
  const [cmd, ...rest] = argv, a = parse(rest);
  switch (cmd) {
    case 'trend': {
      const y = F.parseNumbers(a.pos.join(' '));
      const ci = num(a.one('ci'), 80), z = F.Z[ci];
      if (!z) die('--ci must be one of ' + Object.keys(F.Z).join(', '));
      const r = F.forecast(y, { h: num(a.one('h'), 8), z, method: a.one('method') || 'auto' });
      const res = { used: r.used, name: r.name, range: ci + '%', mean: r.mean, lo: r.lo, hi: r.hi, backtest: r.backtest, note: r.note || undefined };
      if (a.one('target') !== undefined) res.crossing = F.crossing(y, r, Number(a.one('target')));
      return out(res);
    }
    case 'sim': {
      const inputs = (a.opt.var || []).map(s => {
        const [name, rhs] = s.split('='), [min, mode, max] = (rhs || '').split(',').map(Number);
        return { name, min, mode, max };
      });
      const r = F.simulate({ inputs, formula: a.one('formula'), trials: num(a.one('trials'), 20000), seed: num(a.one('seed'), undefined), threshold: a.one('threshold') });
      if (r.error) die(r.error);
      return out(r);
    }
    case 'bayes': {
      const rows = (a.opt.ev || []).map((s, i) => { const [ph, pn, flag] = s.split(','); return { label: 'Evidence ' + (i + 1), ph: +ph, pn: +pn, seen: flag !== 'no' }; });
      return out(F.bayes(num(a.one('prior'), 50), rows));
    }
    case 'decide': {
      const options = (a.opt.opt || []).map(s => {
        const [name, rhs] = s.split(':');
        return { name, outcomes: (rhs || '').split(';').map(p => { const [c, v] = p.split(',').map(Number); return { p: c, v }; }) };
      });
      return out(F.decide(options, num(a.one('risk'), .5)));
    }
    case 'growth': return out(F.growth({ start: num(a.one('start'), 0), rate: num(a.one('rate'), 0), periods: num(a.one('periods'), 10), add: num(a.one('add'), 0), target: a.one('target') }));
    case 'cagr': {
      const [b, e, n] = a.pos.map(Number), r = F.cagr(b, e, n);
      if (r === null) die('cagr needs three positive numbers: BEGIN END PERIODS');
      return out({ ratePerPeriod: r, percent: r * 100 });
    }
    case 'score': {
      const src = a.pos[0] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(a.pos[0] || die('score needs a file or -'), 'utf8');
      return out(F.score(JSON.parse(src)));
    }
    default:
      console.log(HELP); process.exit(cmd && cmd !== 'help' && cmd !== '--help' ? 1 : 0);
  }
}
try { main(process.argv.slice(2)); } catch (e) { die(e.message); }
