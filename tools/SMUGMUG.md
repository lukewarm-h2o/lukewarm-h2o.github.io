# SmugMug public album previews

Upload photos and choose gallery visibility in SmugMug. Public, unlocked albums
with a cover and external embedding enabled appear in the website's Photo albums
section. Visitors follow a preview to the full SmugMug gallery. The local redesign
uses one album grid, with totals derived from its visible public albums. The old
gallery data and original photos are retained until migration is verified.

The sync uses only an API key and anonymous public discovery, without an API
secret, owner login, or private gallery links. It walks nested public folders and
pagination, excluding locked galleries and hidden cover images. Only album names,
counts, public links and display-sized image URLs (up to 12 visible photos per album,
at XLarge size where available, never originals) go into the deployed website;
originals and generated metadata are not committed to Git.

The 3D garden on the home page draws photos as WebGL textures, which browsers only
allow for images served with CORS headers. SmugMug's image host sends none, so the
sync also copies up to four display-sized photos per album into `data/garden/` of
the deployed site (ignored by Git) and lists each copy as the photo's `panel`. The
garden hangs only those copies. They are replaced on every sync and removed when a
sync fails.

## Activate deployment

1. Add a GitHub Actions repository secret named `SMUGMUG_API_KEY` containing the
   API key (not the API secret).
2. Commit and push the integration files, including `.gitignore`, to `main`.
3. In repository Settings → Pages, choose **GitHub Actions** as the deployment source.
4. Run **Publish website and public albums** from the Actions tab and verify it succeeds.

The workflow deploys the existing site plus refreshed metadata on pushes, manual
runs and every six hours at 00:23, 06:23, 12:23 and 18:23 UTC. It needs no paid hosting or additional Python packages.
The original branch-based Pages deployment must be switched for this workflow to work.

## Privacy changes and timing

New public albums and visibility changes appear after the next successful deployment.
GitHub schedules may be delayed; this is not an instant privacy revocation mechanism.
The browser hides previews more than 26 hours old and rechecks every five minutes
and when returning to the tab. The schedule asks for a run every six hours, but
GitHub usually delivers only about two a day, so a shorter limit left the site on
its fallback photos for much of the day. A failed sync deploys an empty list instead of old
previews, then marks the workflow failed. A deployment failure can still leave the
previous JSON and garden photo copies accessible at their URLs; the expiry rule
hides them in the UI only. Unlike the previews, which only link to SmugMug, the
garden copies are files on this website: after an album is made private they stay
reachable until the next successful deployment. Run the workflow manually to
remove them sooner.
Already-public cover URLs, downloaded copies and old Pages deployment artifacts
cannot be revoked by the website. Use SmugMug's direct-image URL reset if necessary.
Private sharing itself remains entirely controlled by SmugMug.

GitHub can disable scheduled workflows in inactive public repositories. Check the
Actions tab if previews disappear, re-enable the workflow and run it manually.

## Preparing migrated photos

Before any album upload, run `python3 tools/prepare_gallery_uploads.py` from the
repository root using a Python environment with Pillow. It reads the local
`migration/inventory.json` and stages copies under `migration/clean-uploads/`.
Upload only these verified copies. The originals stay untouched.

The preparation step removes empty EXIF UserComment values, including the
zero-filled `0x000...` text found in RapidRAW exports. Meaningful comments stay.
JPEG cleanup edits only the EXIF directory, without recompressing images. Every
copy is checked for identical decoded pixels and unchanged other EXIF fields;
`verification.json` records source/upload hashes. Unsupported formats with an
empty comment fail for review rather than silently uploading the placeholder.

## Local preview commands

Set `SMUGMUG_API_KEY` in your shell environment, then run:

```sh
python3 tools/sync_smugmug.py
./preview.command
```

The generated `data/smugmug.json` is ignored by Git. Without a current successful
sync, the gallery falls back to the local photos in `data/gallery.json`.

The gallery and home page shuffle the exported photos on each visit: the gallery
stage and album covers rotate through them. Add photos or new public albums in
SmugMug and they appear after the next sync.

Run the privacy and pagination checks with:

```sh
python3 -m unittest discover -s tools -p 'test_sync_smugmug.py'
```
