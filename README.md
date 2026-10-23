# music

Two small static projects, no dependencies, no build step needed to run either.

## Wavelength (`index.html`, `css/`, `js/`)

Landing page for a music review site: hero, featured review, genre-filtered grid, about, newsletter form.
Open `index.html`, or `python3 -m http.server 8000`.

## Foresight Kit (`foresight/`)

Forecasting instruments: trend projection with backtest, Monte Carlo, Bayesian updating, decision comparison, growth maths and a prediction ledger.

| File | Role |
| --- | --- |
| `engine.js` | Headless maths. Runs in Node and the browser, no DOM, no network. User formulas go through a small parser, never `eval`. |
| `cli.js` | JSON-in, JSON-out command line over the engine. |
| `index.html` | The interface. Open it directly. |
| `test.js` | Engine tests. |
| `build.js` | Bundles page and engine into `dist/foresight.html`, one file. |

```
npm test
npm run bundle
node foresight/cli.js trend "120,128,131,145,152,149,166,171" --h 6 --target 220
node foresight/cli.js sim --formula "units*price" --var "units=100,150,300" --var "price=9,12,15" --seed 1
node foresight/cli.js help
```

The tools extend the numbers you give them. They do not know the future.
