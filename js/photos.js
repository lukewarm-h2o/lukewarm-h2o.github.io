// Shared photo feed: public SmugMug photos (via the scheduled sync), with the original local set as a fallback.
const SMUGMUG_SITE = 'lukeboppart.smugmug.com';
const SMUGMUG_CDN = 'photos.smugmug.com';
const PANEL_PATH = /^\/data\/garden\/[0-9a-f]{16}\.jpg$/;
// The sync is scheduled every six hours, but GitHub often runs it only about twice a day,
// so previews stay up for a day (plus two hours for delays) before they count as stale.
const MAX_AGE = 26 * 60 * 60 * 1000;

export function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function allowedUrl(value, host) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.host === host ? url.href : null;
    } catch { return null; }
}

function normalizePhoto(photo, album) {
    const src = allowedUrl(photo.src, SMUGMUG_CDN);
    const thumb = allowedUrl(photo.thumb, SMUGMUG_CDN) || src;
    if (!src) return null;
    const w = Number.isInteger(photo.w) && photo.w > 0 ? photo.w : null;
    const h = Number.isInteger(photo.h) && photo.h > 0 ? photo.h : null;
    // A copy on this website, for the 3D garden: WebGL cannot use SmugMug's images directly (no CORS headers).
    const panel = typeof photo.panel === 'string' && PANEL_PATH.test(photo.panel) ? photo.panel : null;
    return { title: String(photo.title || ''), caption: String(photo.caption || ''), src, thumb, panel,
        url: allowedUrl(photo.url, SMUGMUG_SITE), w, h, album: album.name };
}

async function fromSmugMug() {
    const response = await fetch('/data/smugmug.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    const age = Date.now() - Date.parse(data.generatedAt);
    if (!data.available || !Number.isFinite(age) || age < -300000 || age >= MAX_AGE || !Array.isArray(data.albums)) {
        throw new Error('Unavailable');
    }
    const albums = [];
    for (const raw of data.albums) {
        const url = allowedUrl(raw.url, SMUGMUG_SITE);
        const cover = allowedUrl(raw.cover, SMUGMUG_CDN);
        if (!url || !cover || !Number.isInteger(raw.count) || raw.count < 1) continue;
        const album = { name: String(raw.name), url, cover, count: raw.count, photos: [] };
        const listed = Array.isArray(raw.photos) ? raw.photos : [];
        album.photos = listed.map(p => normalizePhoto(p, album)).filter(Boolean);
        if (!album.photos.length) album.photos = [normalizePhoto({ src: cover, thumb: cover, title: album.name, url }, album)];
        albums.push(album);
    }
    if (!albums.length) throw new Error('No albums');
    return { source: 'smugmug', albums };
}

async function fromLocal() {
    const response = await fetch('/data/gallery.json');
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    const albums = data.collections.map(c => {
        const items = data.items.filter(item => item.collection === c.id);
        const album = { name: c.name, url: 'https://' + SMUGMUG_SITE + '/browse', cover: '/' + c.cover, count: items.length, photos: [] };
        album.photos = items.map(item => ({
            title: item.title, caption: item.caption || '', src: '/' + item.thumb, thumb: '/' + item.thumb, panel: '/' + item.thumb,
            url: null, w: item.width, h: item.height, album: c.name, alt: item.alt }));
        return album;
    }).filter(a => a.count > 0);
    if (!albums.length) throw new Error('No albums');
    return { source: 'local', albums };
}

export async function loadFeed() {
    try { return await fromSmugMug(); } catch { /* fall through */ }
    try { return await fromLocal(); } catch { return null; }
}
