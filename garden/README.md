# Stromboli Garden

The home page (`index.html`) is a scroll-driven 3D walk from the crater of Stromboli down to the sea.
The content is ordinary HTML in `index.html`; the scene behind it is `js/garden.js`.

Nothing in this folder is deployed: the Pages workflow only copies the root HTML files plus `assets`, `css`, `data` and `js`.

## What lives where

- `index.html`: the content cards. Each `<section data-z="…">` names the point on the path the camera reaches when that card is centred.
- The garden gallery (the optional detour under the pergola) hangs one panel per public SmugMug album, at least eight (topped up with extra photos) and at most eighteen: past eight, an open-air annex west of the pergola fills in, in the order set by `rank` in `ANNEX_SPOTS` (`garden/web/main.js`). `index.html` lists built-in photos in `#garden-photos`; the album feed replaces them when it loads.
- `css/garden.css`: styles for the cards, altitude ruler and garden-gallery panel (shared tokens come from `css/styles.css`).
- `js/garden.js`: built bundle (three.js included, no third-party requests). Do not edit by hand.
- `assets/garden/*.glb`: the models the page loads.
- `classic.html`: the previous home page, kept as a plain version and as the fallback when WebGL is unavailable.
- `garden/web/main.js`: source for `js/garden.js`.
- `garden/blender/build_kit.py`: builds every model; `stromboli-garden.blend` is its output.
- `garden/export/*.glb`: fresh exports from Blender.

## Rebuild the script

Needs Node.js, only for this step:

```sh
cd garden/web
npm install
npm run build
```

## Rebuild the models

Open `garden/blender/stromboli-garden.blend` and run `build_kit.py` in Blender's Text Editor (`build()` then `export_all("…/garden/export")`),
then copy the changed files from `garden/export/` to `assets/garden/`.
The script regenerates every model, so hand edits to the meshes are overwritten.
