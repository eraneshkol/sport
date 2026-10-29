# vendor/

Everything the app needs at runtime, kept in the project rather than fetched
from a CDN on each launch.

It used to load React, Babel, Tailwind, SortableJS and canvas-confetti from
unpkg, jsdelivr and cdn.tailwindcss.com. All five are required to render, so
one unreachable CDN — an outage, a blocked domain, or a gym with no signal —
left a blank screen or `Failed to load app: Babel is not defined`. Nothing
here is fetched over the network now, so the app also works offline.

| file | what | version |
|---|---|---|
| `react.js` | React (production UMD) | 18.3.1 |
| `react-dom.js` | ReactDOM (production UMD) | 18.3.1 |
| `babel.js` | Babel standalone — used by `build.js`, **not sent to the browser** | 8.0.7 |
| `sortable.js` | SortableJS — drag to reorder exercises | 1.15.2 |
| `confetti.js` | canvas-confetti — the finish celebration | 1.9.3 |
| `tailwind.css` | the stylesheet, built ahead of time | Tailwind 3.4.17 |

`app.jsx` is **not** compiled in the browser any more. It used to be, on every
launch, which cost 1.4s on a laptop and 4.9s on a phone with an older
processor before anything was drawn — and it meant shipping a 2.3MB compiler.
`index.html` loads `app.js`, compiled ahead of time by `build.js`, which cut
that to 0.1s and 1.0s.

So, after **any** change to `app.jsx`:

```
node build.js
```

It borrows the Babel in this folder, so it needs nothing installed and works
offline. It compiles down to an older Safari baseline too: the browser no
longer transforms anything, so whatever lands in `app.js` is what an iPhone
has to parse as-is.

## Rebuilding the stylesheet

`tailwind.css` only contains the classes that appear in `app.jsx` and
`index.html` at build time, so **a class added to either file needs a
rebuild** or it will have no styling:

```
npx tailwindcss@3.4.17 -c vendor/tailwind.config.js -i vendor/tailwind.input.css -o vendor/tailwind.css --minify
```
