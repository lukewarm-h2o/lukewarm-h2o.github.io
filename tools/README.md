# Gallery Import Workflow

This site is hosted as static GitHub Pages, so thumbnails need to be generated before publishing.

1. Put new photos anywhere on your machine, or in an `incoming-gallery/` folder in this repo.
2. Copy `tools/gallery_uploads_template.csv` and fill one row per photo.
3. Install the image dependency once per machine:

   ```powershell
   python -m pip install -r tools/requirements.txt
   ```

4. Run the CSV import:

   ```powershell
   python tools/update_gallery.py path/to/your_photos.csv
   ```

The script copies originals into `assets/images/`, creates optimized JPEG thumbnails in `assets/images/thumbs/`, reads dimensions automatically, creates missing collections, and updates `data/gallery.json`.

## Interactive Import

For captioning photos as you go, run:

```powershell
python tools/update_gallery.py
```

or:

```powershell
python tools/update_gallery.py --interactive
```

The GUI opens with `Choose Folder` and `Choose Photos` buttons. To review every supported image in a folder directly from the command line:

```powershell
python tools/update_gallery.py --interactive --folder path/to/photos
```

For nested trip folders:

```powershell
python tools/update_gallery.py --interactive --folder path/to/photos --recursive
```

The Tk window previews each photo in the folder queue. Use `Save & Next` to import it, or `Skip` to leave it out. When a folder is finished, you can choose another folder without restarting the tool. For saved photos, it copies the original, generates the thumbnail, and prompts for title, caption, location, collection, tags, and alt text. Location, collection, and tag fields use previous gallery values as dropdown suggestions, and the `Use Previous` button repeats the last photo's location, collection, and tags to reduce repetitive typing.

New collection IDs are created automatically. For example, entering `iceland` as the collection ID with `Iceland` as the collection name creates a new folder in the gallery.
