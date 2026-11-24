// What a page imports as 'film-compat' / reads as window.FilmCompat: the clock, the adapters, React's mount.
export { onFrame, waitFor, configure } from './core.mjs';
export { gsap, anime, lottie, three } from './adapters.mjs';
export { mount, html, Frame } from './react.mjs';
