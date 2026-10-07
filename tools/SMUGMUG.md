# SmugMug public album previews

Upload photos and choose gallery visibility in SmugMug. Public, unlocked albums
with a cover and external embedding enabled appear in the website's Photo albums
section. Visitors follow a preview to the full SmugMug gallery. Existing local
portfolio collections remain available below it.

The sync uses only an API key and anonymous public discovery, without an API
secret, owner login, or private gallery links. It walks nested public folders and
pagination, excluding locked galleries and hidden cover images. Only album names,
counts, public links and display-sized cover URLs go into the deployed website;
originals and generated metadata are not committed to Git.

## Activate deployment

1. Add a GitHub Actions repository secret named `SMUGMUG_API_KEY` containing the
   API key (not the API secret).
2. Commit and push the integration files, including `.gitignore`, to `main`.
3. In repository Settings → Pages, choose **GitHub Actions** as the deployment source.
4. Run **Publish website and public albums** from the Actions tab and verify it succeeds.

The workflow deploys the existing site plus refreshed metadata on pushes, manual
runs and hourly at minute 23. It needs no paid hosting or additional Python packages.
The original branch-based Pages deployment must be switched for this workflow to work.

## Privacy changes and timing

New public albums and visibility changes appear after the next successful deployment.
GitHub schedules may be delayed; this is not an instant privacy revocation mechanism.
The browser hides previews more than two hours old and rechecks every five minutes
and when returning to the tab. A failed sync deploys an empty list instead of old
previews, then marks the workflow failed. A deployment failure can still leave the
previous JSON accessible at its URL; the expiry rule hides it in the UI only.
Already-public cover URLs, downloaded copies and old Pages deployment artifacts
cannot be revoked by the website. Use SmugMug's direct-image URL reset if necessary.
Private sharing itself remains entirely controlled by SmugMug.

GitHub can disable scheduled workflows in inactive public repositories. Check the
Actions tab if previews disappear, re-enable the workflow and run it manually.

## Local preview

Set `SMUGMUG_API_KEY` in your shell environment, then run:

```sh
python3 tools/sync_smugmug.py
./preview.command
```

The generated `data/smugmug.json` is ignored by Git. Without a current successful
sync, the page offers a direct link to browse the galleries.

Run the privacy and pagination checks with:

```sh
python3 -m unittest discover -s tools -p 'test_sync_smugmug.py'
```
