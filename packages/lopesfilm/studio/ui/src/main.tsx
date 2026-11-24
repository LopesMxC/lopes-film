import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FocusNav } from './components/FocusNav';
import './globals.css';
import { applyStudioHost } from './lib/host';
import './lib/ui-prefs';

applyStudioHost();

/* the middle button does nothing here: it neither opens a link in another tab nor scrolls, and so can never close or
   replace the project that is open (a link under it, a tab, the autoscroll). Text fields keep it (paste on Linux). */
const middle = (event: MouseEvent) => {
  if (event.button !== 1) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;
  event.preventDefault();
  event.stopPropagation();
};
window.addEventListener('mousedown', middle, true);
window.addEventListener('mouseup', middle, true);
window.addEventListener('auxclick', middle, true);

createRoot(document.getElementById('root')!).render(<StrictMode><FocusNav /><App /></StrictMode>);
