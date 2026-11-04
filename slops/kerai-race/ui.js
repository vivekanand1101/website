// Browser-only instruments and controls. No network services.
(() => {
  const $ = id => document.getElementById(id);
  const body = document.body, root = document.documentElement;
  const needle = $('speed-needle'), arc = $('speed-arc'), meter = $('speedometer'), badge = $('drive-status');
  const pauseScreen = $('pause-screen'), pauseButton = $('pause-control'), viewButton = $('view-control');
  const touchQuery = matchMedia('(any-pointer: coarse), (max-width: 960px)');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'loading', shownSpeed = 0, previousTime = 0, previousInteger = -1, lastAngle = '', lastRush = '', releaseInput = () => {};
  function layout() { body.classList.toggle('touch-layout', touchQuery.matches); releaseInput(); }
  touchQuery.addEventListener('change', layout); layout();
  $('standings-toggle').addEventListener('click', () => {
    const open = body.classList.toggle('standings-open'); $('standings-toggle').setAttribute('aria-expanded', String(open));
  });
  function bindInput(keys, handleKey, getState) {
    const onKey = code => { handleKey(code); syncState(getState()); };
    const keyboard = new Set(), pointers = new Map();
    const controls = [...document.querySelectorAll('[data-k]')];
    const sync = code => { keys[code] = keyboard.has(code) || [...pointers.values()].some(p => p.code === code); };
    const paint = button => button.classList.toggle('on', [...pointers.values()].some(p => p.button === button));
    function release(id) {
      const held = pointers.get(id); if (!held) return;
      pointers.delete(id); sync(held.code); paint(held.button);
      try { if (held.button.hasPointerCapture(id)) held.button.releasePointerCapture(id); } catch {}
    }
    releaseInput = () => {
      keyboard.clear(); for (const id of [...pointers.keys()]) release(id);
      for (const code of Object.keys(keys)) keys[code] = false;
    };
    function suspend() { releaseInput(); if (state === 'play') onKey('KeyP'); }
    addEventListener('keydown', event => {
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
      keyboard.add(event.code); sync(event.code); if (!event.repeat) onKey(event.code);
    });
    addEventListener('keyup', event => { keyboard.delete(event.code); sync(event.code); });
    addEventListener('blur', suspend);
    addEventListener('pagehide', releaseInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
    addEventListener('orientationchange', releaseInput);
    controls.forEach(button => {
      button.addEventListener('contextmenu', event => event.preventDefault());
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        event.preventDefault(); if (pointers.has(event.pointerId)) return;
        const code = button.dataset.k, wasDown = !!keys[code];
        pointers.set(event.pointerId, {code, button}); sync(code); paint(button);
        try { button.setPointerCapture(event.pointerId); } catch {}
        if (!wasDown) onKey(code);
      });
      button.addEventListener('lostpointercapture', event => release(event.pointerId));
      button.addEventListener('click', event => {
        // Native keyboard/accessibility activation has no preceding pointer event.
        if (event.detail === 0) onKey(button.dataset.k);
      });
    });
    addEventListener('pointerup', event => release(event.pointerId), true);
    addEventListener('pointercancel', event => release(event.pointerId), true);
    const results = $('results');
    results.addEventListener('click', event => { if (event.target.closest('[data-lobby]')) onKey('Enter'); });
  }
  function syncState(nextState) {
    if (state !== nextState) {
      state = nextState; body.dataset.state = state;
      if (state !== 'play') { $('speed-fx').style.opacity = '0'; body.classList.remove('speed-active'); lastRush = '0.00'; }
      const paused = state === 'paused'; pauseScreen.hidden = !paused;
      if (paused) releaseInput();
      if (['title','over','loading'].includes(state)) { releaseInput(); body.classList.remove('standings-open'); $('standings-toggle').setAttribute('aria-expanded','false'); }
      pauseButton.textContent = paused ? 'Resume' : 'Pause'; pauseButton.setAttribute('aria-label', paused ? 'Resume race' : 'Pause race');
    }
  }
  function update(kmh, nextState, keys, now, pov, crashed) {
    syncState(nextState);
    const speed = Math.abs(kmh), dt = Math.max(0, Math.min(.1, (now - previousTime) / 1000)); previousTime = now;
    shownSpeed = reducedQuery.matches ? speed : shownSpeed + (speed - shownSpeed) * (1 - Math.exp(-dt * 13));
    const fraction = Math.min(1, shownSpeed / 220), angle = (-120 + fraction * 240).toFixed(2);
    if (angle !== lastAngle) { needle.setAttribute('transform', `rotate(${angle} 90 82)`); arc.setAttribute('stroke-dasharray', `${(fraction * 100).toFixed(2)} 100`); lastAngle = angle; }
    const integer = Math.round(speed);
    if (integer !== previousInteger) { meter.setAttribute('aria-valuenow', String(integer)); previousInteger = integer; }
    const brake = keys.ArrowDown || keys.KeyS, gas = keys.ArrowUp || keys.KeyW;
    const label = crashed ? 'CRASH' : state === 'paused' ? 'PAUSED' : brake ? 'BRAKING' : gas && state === 'play' ? 'THROTTLE' : speed > 2 ? 'COAST' : 'READY';
    if (badge.textContent !== label) badge.textContent = label;
    const tone = integer > 170 ? 'fast' : brake ? 'braking' : 'normal'; if (meter.dataset.tone !== tone) meter.dataset.tone = tone;
    const rush = (!reducedQuery.matches && state === 'play' && !crashed ? Math.min(.3, Math.max(0, (speed - 65) / 160) * .3) : 0).toFixed(2);
    if (rush !== lastRush) { $('speed-fx').style.opacity = rush; body.classList.toggle('speed-active', Number(rush) > 0); lastRush = rush; }
    viewButton.setAttribute('aria-pressed', String(pov));
  }
  body.classList.toggle('fullscreen-supported', typeof document.documentElement.requestFullscreen === 'function' || typeof document.documentElement.webkitRequestFullscreen === 'function');
  body.dataset.state = state;
  window.KERAI_UI = {bindInput, update, syncState, releaseInput: () => releaseInput()};
})();
