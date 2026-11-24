// The part every adapter shares: one `window.film` for the page, and a list of things to draw at t.
// A library that runs its own clock registers here (`onFrame`) and is driven by t instead (SPEC §3).
const subs = new Set();
const waits = [];
let installed = false;

/** Draws at t (seconds) whatever `fn` draws, after the ones registered before it. Returns a function that takes it off. */
export function onFrame(fn) {
  install();
  subs.add(fn);
  return () => subs.delete(fn);
}

/** A promise (or a function returning one, called when `film.ready` is) that `film.ready` also waits for: a Lottie file loading, a model, a font. */
export function waitFor(what) {
  install();
  waits.push(what);
  return what;
}

/** The page's own fields of SPEC §2 (`duration`, `width`, `height`), set on `window.film` beside `frame` and `ready`. */
export function configure(fields) {
  install();
  for (const [key, value] of Object.entries(fields)) if (value != null) window.film[key] = value;
}

function install() {
  if (installed) return;
  installed = true;
  const film = (window.film ??= {});
  const own = film.frame;
  const ready = film.ready;
  film.frame = async (t) => {
    if (typeof own === 'function') await own.call(film, t);
    for (const fn of [...subs]) await fn(t);
  };
  film.ready = async () => {
    if (typeof ready === 'function') await ready.call(film);
    else await ready;
    await Promise.all(waits.map((w) => (typeof w === 'function' ? w() : w)));
  };
  /* opened as an ordinary page (SPEC §4): plays itself, from 0 and around */
  if (!window.filmHost) {
    const start = () => {
      Promise.resolve(film.ready()).then(() => {
        const t0 = performance.now();
        const loop = () => {
          const t = (performance.now() - t0) / 1000;
          Promise.resolve(film.frame(film.duration ? t % film.duration : t)).finally(() => requestAnimationFrame(loop));
        };
        loop();
      });
    };
    if (document.readyState === 'complete') setTimeout(start); else addEventListener('load', () => setTimeout(start));
  }
}
