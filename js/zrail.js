// Side ruler that tracks scroll position as a build height "Z". The top of the page is the tallest
// point and the bottom is Z 0, like a print: 100 px of page = 1 mm, so longer pages are taller builds.
(function () {
    const PX_PER_MM = 100;
    const STEPS = [1, 2, 5, 10, 20, 50, 100];
    const MIN_TICK_GAP = 9; // px between ticks
    const rail = document.createElement('div');
    rail.className = 'zrail';
    rail.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('div');
    mark.className = 'zrail-mark';
    const label = document.createElement('span');
    label.className = 'zrail-label';
    mark.appendChild(label);
    rail.appendChild(mark);
    document.body.appendChild(rail);

    let ticks = [];
    let signature = '';
    let pending = false;

    function buildTicks(zMax, railHeight) {
        const step = STEPS.find(s => railHeight / (zMax / s) >= MIN_TICK_GAP) || STEPS[STEPS.length - 1];
        const next = step + ':' + Math.floor(zMax / step) + ':' + Math.round(zMax * 1000 / (zMax || 1));
        if (next === signature && ticks.length) { positionTicks(zMax); return; }
        signature = next;
        ticks.forEach(t => t.el.remove());
        ticks = [];
        for (let k = 0; k <= zMax; k += step) {
            const el = document.createElement('i');
            el.className = 'zrail-tick' + (k % (step * 5) === 0 ? ' major' : '');
            rail.insertBefore(el, mark);
            ticks.push({ el, z: k });
        }
        positionTicks(zMax);
    }
    function positionTicks(zMax) {
        for (const t of ticks) t.el.style.top = (1 - t.z / zMax) * 100 + '%';
    }

    function update() {
        pending = false;
        const rawRoom = document.documentElement.scrollHeight - window.innerHeight;
        rail.hidden = rawRoom < 2; // nothing to scroll, so no ruler
        const room = Math.max(1, rawRoom);
        const zMax = room / PX_PER_MM;
        buildTicks(zMax, rail.clientHeight || window.innerHeight);
        const p = Math.min(1, Math.max(0, window.scrollY / room));
        const z = zMax * (1 - p);
        mark.style.top = p * 100 + '%';
        label.textContent = 'Z ' + z.toFixed(1);
        for (const t of ticks) t.el.classList.toggle('done', t.z >= z);
    }
    function schedule() { if (!pending) { pending = true; requestAnimationFrame(update); } }
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    new ResizeObserver(schedule).observe(document.body);
    update();
})();
