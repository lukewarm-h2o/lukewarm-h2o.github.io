// Only public metadata is published here. API keys stay in GitHub Actions secrets.
const grid = document.getElementById('smugmug-collections');
const status = document.getElementById('smugmug-status');
const maxAge = 2 * 60 * 60 * 1000;
let expiry;

function showUnavailable() {
    grid.replaceChildren();
    status.hidden = false;
    status.textContent = 'Album previews are temporarily unavailable. You can still browse the galleries on SmugMug.';
}

function allowedUrl(value, host) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.host === host ? url.href : null;
    } catch { return null; }
}

async function refresh() {
    clearTimeout(expiry);
    try {
        const response = await fetch('/data/smugmug.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        const age = Date.now() - Date.parse(data.generatedAt);
        if (!data.available || !Number.isFinite(age) || age < -300000 || age >= maxAge || !Array.isArray(data.albums)) {
            throw new Error('Unavailable');
        }
        const cards = [];
        for (const album of data.albums) {
            const href = allowedUrl(album.url, 'lukeboppart.smugmug.com');
            const cover = allowedUrl(album.cover, 'photos.smugmug.com');
            if (!href || !cover) continue;
            const card = document.createElement('a');
            card.className = 'collection-folder smugmug-preview';
            card.href = href;
            const image = document.createElement('img');
            image.src = cover;
            image.alt = '';
            image.loading = 'lazy';
            image.decoding = 'async';
            const body = document.createElement('div');
            body.className = 'folder-body';
            const details = document.createElement('div');
            const title = document.createElement('h3');
            title.textContent = album.name;
            const action = document.createElement('p');
            action.textContent = 'View gallery →';
            const count = document.createElement('span');
            count.textContent = `${album.count} ${album.count === 1 ? 'photo' : 'photos'}`;
            details.append(title, action);
            body.append(details, count);
            card.append(image, body);
            cards.push(card);
        }
        grid.replaceChildren(...cards);
        status.hidden = cards.length > 0;
        status.textContent = 'No public albums to show yet.';
        expiry = setTimeout(showUnavailable, Math.max(0, maxAge - age));
    } catch { showUnavailable(); }
}

refresh();
setInterval(refresh, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
});
