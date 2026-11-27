/** Keep the macOS window available for Dock activation without ending Studio or agent sessions. */
export function keepWindowOnClose(win, { mac, isQuitting, save }) {
  let leavingFullScreen = false;
  function cancelClose() {
    leavingFullScreen = false;
    win.removeListener('leave-full-screen', hide);
  }
  function hide() {
    cancelClose();
    if (!win.isDestroyed() && !isQuitting()) win.hide();
  }
  win.on('close', (event) => {
    save();
    if (mac && !isQuitting()) {
      event.preventDefault();
      if (leavingFullScreen) return;
      if (!win.isFullScreen()) { win.hide(); return; }
      /* Hiding a native full-screen window leaves its Space black. Its exit is asynchronous on macOS. */
      leavingFullScreen = true;
      win.once('leave-full-screen', hide);
      win.setFullScreen(false);
    } else cancelClose();
  });
  /* Dock activation while full screen is leaving keeps the window open. */
  return cancelClose;
}

/** An empty projects page closes its window only on macOS. */
export function closeTabOrWindow(win, { mac, activeId, closeTab }) {
  if (activeId) void closeTab(activeId);
  else if (mac) win?.close();
}

/** Mark Quit before window close can run, even before Studio has started or after startup failed. */
export function quitAfterStudio(event, { quitting, markQuitting, studio, closeAgents, quit }) {
  /* closing the agents may take a moment (they end on their own first, so a sign-in being renewed is not cut short) */
  const closing = closeAgents();
  if (quitting) return;
  markQuitting();
  if (!studio) return;
  event.preventDefault();
  const stop = () => studio.quit();
  void (typeof closing?.then === 'function' ? closing.catch(() => {}).then(stop) : stop()).then(quit, quit);
}
