/* Hero light/dark divider, gallery tabs. */
(function () {
  const split = document.querySelector('.lo-split');
  if (split) {
    const handle = split.querySelector('.lo-handle');
    let pct = 50;
    const set = (v) => {
      pct = Math.max(4, Math.min(96, v));
      split.style.setProperty('--split', pct + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
    const fromEvent = (e) => {
      const r = split.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    };
    let dragging = false;
    split.addEventListener('pointerdown', (e) => { dragging = true; split.setPointerCapture(e.pointerId); fromEvent(e); });
    split.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
    split.addEventListener('pointerup', () => { dragging = false; });
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { set(pct - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(pct + 4); e.preventDefault(); }
    });
    // One intro sweep: the page goes dark from right to left, then settles.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let t0 = null;
      const from = 100, to = 50;
      const step = (t) => {
        if (dragging) return;
        if (t0 === null) t0 = t;
        const p = Math.min((t - t0) / 1400, 1);
        set(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      set(100);
      setTimeout(() => requestAnimationFrame(step), 350);
    }
  }

  document.querySelectorAll('.lo-compare').forEach((box) => {
    const handle = box.querySelector('.lo-handle');
    let pct = 50, dragging = false;
    const set = (v) => {
      pct = Math.max(4, Math.min(96, v));
      box.style.setProperty('--split', pct + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
    };
    const fromEvent = (e) => { const r = box.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
    box.addEventListener('pointerdown', (e) => { dragging = true; box.setPointerCapture(e.pointerId); fromEvent(e); });
    box.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
    box.addEventListener('pointerup', () => { dragging = false; });
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { set(pct - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(pct + 4); e.preventDefault(); }
    });
  });

  const tabs = document.querySelectorAll('.lo-tab');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }));
})();
