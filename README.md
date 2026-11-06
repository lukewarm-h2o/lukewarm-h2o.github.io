# Luke's website

Static HTML, CSS, and JavaScript hosted on GitHub Pages. No build step or Node.js is required.

## Preview locally

Double-click `preview.command` in Finder, or run:

```sh
cd path/to/lukewarm-h2o.github.io
./preview.command
```

Open http://127.0.0.1:8000 in your browser. Save edits and refresh to see them. Press Control-C in the terminal to stop. To use another port, run `PORT=8001 ./preview.command`.

## Edit the site

- `index.html`: home page (hero bucket is `js/hero.js`)
- `fun.html` (the Lab), `gallery.html`, `notebook.html`, `contact.html`: other pages
- `info.html`: redirect to the Notebook, kept so old links work
- `js/photos.js`, `js/gallery.js`: public SmugMug photo feed, rotating stage and lightbox
- `css/styles.css`: shared styles
- Navigation lives in the `<header>` of each page; update all five pages when links change
- `data/`: local fallback gallery data (`gallery.json`); `smugmug.json` is generated
- `assets/`: images, icons, and 3D models

## Publish changes

Sign in to the GitHub CLI once if needed:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

Review your edits, then commit and push the intended files:

```sh
git diff
git status
git add path/to/changed-file
git commit -m "Describe the change"
git push origin main
```

Check the repository's Actions and Pages settings for deployment status after pushing.

## Gallery import tools

Previewing does not require Python packages. For the optional photo import tool:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tools/requirements.txt
```

See [tools/README.md](tools/README.md) for photo import instructions. Run its Python commands using `.venv/bin/python` on this Mac. The interactive GUI also requires Python with Tk support.
