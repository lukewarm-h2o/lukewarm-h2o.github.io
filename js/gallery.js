import { loadFeed, shuffle } from './photos.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const status = document.getElementById('gallery-status');
const stage = document.getElementById('stage');
const filtersEl = document.getElementById('filters');
const masonry = document.getElementById('masonry');
const albumsEl = document.getElementById('albums');
const stats = { photos: document.getElementById('photo-count'), albums: document.getElementById('album-count') };
const lightbox = document.getElementById('lightbox');
const lbImg = lightbox.querySelector('img');
const lbTitle = lightbox.querySelector('h2');
const lbCaption = lightbox.querySelector('p');
const lbLink = lightbox.querySelector('[data-link]');
const lbCount = lightbox.querySelector('[data-count]');

let visiblePhotos = [];
let lbIndex = 0;
let lastFocus = null;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
const altFor = p => p.alt || p.title || p.album || 'Photo';

/* ---------- rotating stage ---------- */
function startStage(photos) {
    const wide = photos.filter(p => !p.w || !p.h || p.w / p.h >= 1.3);
    const pool = shuffle(wide.length >= 3 ? wide : photos);
    const slides = [el('img', 'stage-slide'), el('img', 'stage-slide')];
    const caption = el('div', 'stage-caption');
    const left = el('span');
    const right = el('a');
    caption.append(left, right);
    stage.append(...slides, caption);
    let i = 0, active = 0, timer = null;
    function show(index, first) {
        const photo = pool[index % pool.length];
        const next = slides[first ? 0 : 1 - active];
        const preload = new Image();
        preload.onload = () => {
            next.src = photo.src;
            next.alt = altFor(photo);
            slides.forEach(s => s.classList.remove('is-on'));
            next.classList.add('is-on');
            active = slides.indexOf(next);
            left.textContent = [photo.title, photo.album].filter(Boolean).join(' · ');
            if (photo.url) { right.href = photo.url; right.textContent = 'View on SmugMug →'; right.hidden = false; }
            else right.hidden = true;
        };
        preload.src = photo.src;
    }
    show(0, true);
    if (reduceMotion || pool.length < 2) return;
    const tick = () => { i += 1; show(i, false); };
    const run = () => { if (!timer) timer = setInterval(tick, 6500); };
    const stop = () => { clearInterval(timer); timer = null; };
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
    run();
}

/* ---------- masonry + filters ---------- */
function renderMasonry(photos) {
    visiblePhotos = photos;
    masonry.replaceChildren(...photos.map((photo, index) => {
        const figure = el('figure', 'photo');
        const button = el('button');
        button.type = 'button';
        button.setAttribute('aria-label', `Open ${photo.title || 'photo'} from ${photo.album}`);
        const img = el('img');
        img.src = photo.thumb;
        img.alt = altFor(photo);
        img.loading = 'lazy';
        img.decoding = 'async';
        if (photo.w && photo.h) { img.width = photo.w; img.height = photo.h; }
        button.append(img);
        button.addEventListener('click', () => openLightbox(index));
        const cap = el('figcaption');
        cap.append(el('span', '', photo.title), el('span', '', photo.album));
        figure.append(button, cap);
        return figure;
    }));
}

function renderFilters(albums, all) {
    const make = (label, count, selected, onClick) => {
        const b = el('button', 'filter-button', `${label} · ${count}`);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(selected));
        b.addEventListener('click', () => {
            filtersEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            onClick();
        });
        return b;
    };
    filtersEl.replaceChildren(make('All', all.length, true, () => renderMasonry(all)),
        ...albums.map(a => make(a.name, a.photos.length, false, () => renderMasonry(a.photos))));
}

/* ---------- album cards with rotating covers ---------- */
function renderAlbums(albums) {
    albumsEl.replaceChildren(...albums.map((album, n) => {
        const card = el('a', 'album-card');
        card.href = album.url;
        const a = el('img', 'cover-a');
        const b = el('img', 'cover-b');
        [a, b].forEach(img => { img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; });
        const order = shuffle(album.photos);
        a.src = order[0].src;
        const body = el('div', 'album-body');
        body.append(el('h3', '', album.name), el('span', '', `${album.count} ${album.count === 1 ? 'photo' : 'photos'} →`));
        card.append(a, b, body);
        if (!reduceMotion && order.length > 1) {
            let i = 0, flipped = false;
            const rotate = () => {
                if (document.hidden) return;
                i = (i + 1) % order.length;
                const incoming = flipped ? a : b;
                const pre = new Image();
                pre.onload = () => { incoming.src = order[i].src; flipped = !flipped; card.classList.toggle('is-flipped', flipped); };
                pre.src = order[i].src;
            };
            setTimeout(() => setInterval(rotate, 7000), 1500 + n * 1700);
        }
        return card;
    }));
}

/* ---------- lightbox ---------- */
function paintLightbox() {
    const photo = visiblePhotos[lbIndex];
    lbImg.src = photo.src;
    lbImg.alt = altFor(photo);
    lbTitle.textContent = photo.title || photo.album;
    lbCaption.textContent = photo.caption;
    lbCount.textContent = `${photo.album} · ${lbIndex + 1} / ${visiblePhotos.length}`;
    if (photo.url) { lbLink.href = photo.url; lbLink.hidden = false; } else lbLink.hidden = true;
}
function openLightbox(index) {
    lastFocus = document.activeElement;
    lbIndex = index;
    paintLightbox();
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('[data-close]').focus();
}
function closeLightbox() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
}
function step(delta) {
    lbIndex = (lbIndex + delta + visiblePhotos.length) % visiblePhotos.length;
    paintLightbox();
}
lightbox.querySelector('[data-close]').addEventListener('click', closeLightbox);
lightbox.querySelector('[data-prev]').addEventListener('click', () => step(-1));
lightbox.querySelector('[data-next]').addEventListener('click', () => step(1));
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Tab') {
        const focusable = [...lightbox.querySelectorAll('button, a[href]')].filter(n => !n.hidden);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
});

/* ---------- boot ---------- */
(async function init() {
    const feed = await loadFeed();
    if (!feed) {
        status.hidden = false;
        status.textContent = 'Photos are temporarily unavailable. You can still browse the galleries on SmugMug.';
        stage.hidden = true;
        return;
    }
    const albums = feed.albums;
    const all = albums.flatMap(a => a.photos);
    status.hidden = true;
    stats.photos.textContent = albums.reduce((n, a) => n + a.count, 0).toLocaleString();
    stats.albums.textContent = albums.length.toLocaleString();
    startStage(all);
    renderFilters(albums, all);
    renderMasonry(all);
    renderAlbums(albums);
})();
