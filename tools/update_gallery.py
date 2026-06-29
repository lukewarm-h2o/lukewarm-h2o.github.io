#!/usr/bin/env python3
"""Import captioned photos into the static gallery.

Batch mode:
    python tools/update_gallery.py tools/gallery_uploads_template.csv

Interactive mode:
    python tools/update_gallery.py --interactive

The script copies originals into assets/images, creates thumbnails in
assets/images/thumbs, and updates data/gallery.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print(
        "Missing dependency: Pillow. Install it with:\n"
        "  python -m pip install Pillow\n"
        "Then rerun this script.",
        file=sys.stderr,
    )
    raise SystemExit(1)


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}


@dataclass
class ImportResult:
    added: int = 0
    updated: int = 0
    thumbnails: int = 0

    def add(self, other: "ImportResult") -> None:
        self.added += other.added
        self.updated += other.updated
        self.thumbnails += other.thumbnails


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "photo"


def split_tags(value: str) -> list[str]:
    if not value:
        return []
    raw_tags = re.split(r"[,;|]", value)
    return [tag.strip() for tag in raw_tags if tag.strip()]


def unique_path(directory: Path, filename: str) -> Path:
    candidate = directory / filename
    if not candidate.exists():
        return candidate

    stem = candidate.stem
    suffix = candidate.suffix
    index = 2
    while True:
        next_candidate = directory / f"{stem}-{index}{suffix}"
        if not next_candidate.exists():
            return next_candidate
        index += 1


def display_name(value: str) -> str:
    return value.replace("-", " ").replace("_", " ").title()


def title_from_filename(path: Path) -> str:
    return display_name(path.stem)


def image_files_in_folder(folder: Path, recursive: bool = False) -> list[Path]:
    if not folder.exists() or not folder.is_dir():
        raise FileNotFoundError(f"Could not find folder: {folder}")

    iterator = folder.rglob("*") if recursive else folder.iterdir()
    return sorted(
        [path for path in iterator if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS],
        key=lambda path: path.name.lower(),
    )


def resolve_source(csv_path: Path, source_value: str) -> Path:
    source = Path(source_value).expanduser()
    if source.is_absolute() and source.exists():
        return source

    candidates = [
        csv_path.parent / source,
        Path.cwd() / source,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    raise FileNotFoundError(f"Could not find photo: {source_value}")


def load_gallery(path: Path) -> dict:
    if not path.exists():
        return {"collections": [], "items": []}

    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def save_gallery(path: Path, gallery: dict) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(gallery, handle, indent=2)
        handle.write("\n")


def ensure_collection(gallery: dict, row: dict, first_thumb: str | None = None) -> None:
    collection_id = row["collection"].strip()
    collections = gallery.setdefault("collections", [])
    existing = next((item for item in collections if item["id"] == collection_id), None)
    if existing:
        if first_thumb and not existing.get("cover"):
            existing["cover"] = first_thumb
        return

    collections.append(
        {
            "id": collection_id,
            "name": row.get("collection_name", "").strip() or display_name(collection_id),
            "description": row.get("collection_description", "").strip() or "A photo collection.",
            "cover": first_thumb or "",
        }
    )


def copy_original(source: Path, images_dir: Path, title: str) -> Path:
    suffix = source.suffix.lower()
    if suffix not in IMAGE_EXTENSIONS:
        raise ValueError(f"Unsupported image extension for {source.name}")

    source_resolved = source.resolve()
    images_dir_resolved = images_dir.resolve()
    try:
        source_resolved.relative_to(images_dir_resolved)
        return source_resolved.relative_to(Path.cwd().resolve())
    except ValueError:
        pass

    filename = f"{slugify(title or source.stem)}{suffix}"
    destination = unique_path(images_dir, filename)
    shutil.copy2(source, destination)
    return destination


def make_thumbnail(source: Path, destination: Path, max_size: int, quality: int) -> tuple[int, int]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        width, height = image.size
        thumb = image.convert("RGB")
        thumb.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        thumb.save(destination, "JPEG", quality=quality, optimize=True, progressive=True)
        return width, height


def validate_row(row: dict, line_number: int | str) -> None:
    required = ["file", "title", "caption", "location", "collection", "alt"]
    missing = [field for field in required if not row.get(field, "").strip()]
    if missing:
        raise ValueError(f"{line_number}: missing {', '.join(missing)}")


def make_item(row: dict, src: str, thumb_src: str, width: int, height: int) -> dict:
    return {
        "title": row["title"].strip(),
        "caption": row["caption"].strip(),
        "location": row["location"].strip(),
        "collection": row["collection"].strip(),
        "tags": split_tags(row.get("tags", "")),
        "src": src,
        "thumb": thumb_src,
        "alt": row["alt"].strip(),
        "width": width,
        "height": height,
    }


def import_one_photo(gallery: dict, args: argparse.Namespace, source: Path, row: dict) -> ImportResult:
    validate_row(row, source.name)
    original = copy_original(source, args.images_dir, row["title"])
    thumb = args.thumbs_dir / f"{original.stem}.jpg"
    width, height = make_thumbnail(original, thumb, args.max_size, args.quality)

    src = original.as_posix()
    thumb_src = thumb.as_posix()
    item = make_item(row, src, thumb_src, width, height)
    items = gallery.setdefault("items", [])
    existing = next((entry for entry in items if entry.get("src") == src), None)
    result = ImportResult(thumbnails=1)

    if existing:
        existing.update(item)
        result.updated = 1
    else:
        items.append(item)
        result.added = 1

    ensure_collection(gallery, row, thumb_src)
    return result


def prepare_paths(args: argparse.Namespace) -> None:
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.images_dir.mkdir(parents=True, exist_ok=True)
    args.thumbs_dir.mkdir(parents=True, exist_ok=True)


def import_photos(args: argparse.Namespace) -> ImportResult:
    prepare_paths(args)
    gallery = load_gallery(args.manifest)
    result = ImportResult()

    if args.csv is None:
        raise ValueError("CSV path is required unless --interactive is used.")

    with args.csv.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for line_number, row in enumerate(reader, start=2):
            validate_row(row, f"CSV line {line_number}")
            source = resolve_source(args.csv, row["file"].strip())
            result.add(import_one_photo(gallery, args, source, row))

    save_gallery(args.manifest, gallery)
    return result


def existing_values(gallery: dict) -> dict[str, list[str]]:
    items = gallery.get("items", [])
    collections = gallery.get("collections", [])
    return {
        "locations": sorted({item.get("location", "") for item in items if item.get("location")}),
        "collections": sorted({item.get("id", "") for item in collections if item.get("id")}),
        "tags": sorted({tag for item in items for tag in item.get("tags", [])}),
    }


class InteractiveImporter:
    def __init__(self, args: argparse.Namespace):
        import tkinter as tk
        from tkinter import filedialog, messagebox, ttk
        from PIL import ImageTk

        self.tk = tk
        self.ttk = ttk
        self.filedialog = filedialog
        self.messagebox = messagebox
        self.image_tk = ImageTk
        self.args = args
        prepare_paths(args)
        self.gallery = load_gallery(args.manifest)
        self.result = ImportResult()
        self.values = existing_values(self.gallery)
        self.files: list[Path] = []
        self.index = 0
        self.preview_image = None
        self.previous_metadata: dict[str, str] = {}

        self.root = tk.Tk()
        self.root.title("Gallery Import")
        self.root.geometry("920x640")
        self.root.minsize(780, 560)
        self.build_ui()

    def run(self) -> ImportResult:
        if self.args.folder:
            self.load_folder(self.args.folder)
        else:
            self.show_empty_state()

        self.root.mainloop()
        return self.result

    def choose_folder(self) -> None:
        selected_folder = self.filedialog.askdirectory(title="Choose a folder of photos to review")
        if selected_folder:
            self.load_folder(Path(selected_folder))

    def choose_individual_files(self) -> None:
        selected = self.filedialog.askopenfilenames(
            title="Choose individual photos to import",
            filetypes=[
                ("Image files", "*.jpg *.jpeg *.png *.webp *.tif *.tiff"),
                ("All files", "*.*"),
            ],
        )
        if selected:
            self.load_files([Path(item) for item in selected])

    def load_folder(self, folder: Path) -> None:
        try:
            files = image_files_in_folder(folder, self.args.recursive)
        except Exception as error:  # noqa: BLE001 - GUI needs a friendly message for any load failure.
            self.messagebox.showerror("Could not open folder", str(error))
            return

        if not files:
            self.messagebox.showinfo("No images found", "That folder does not contain supported image files.")
            self.show_empty_state()
            return

        self.load_files(files)

    def load_files(self, files: list[Path]) -> None:
        self.files = files
        self.index = 0
        self.load_current_photo()

    def show_empty_state(self) -> None:
        self.files = []
        self.index = 0
        self.preview_image = None
        self.progress_label.config(text="Choose a folder to start reviewing photos")
        self.source_label.config(text="")
        self.filename_label.config(text="")
        self.preview_label.config(image="", text="No folder selected")

    def build_ui(self) -> None:
        tk = self.tk
        ttk = self.ttk

        self.root.columnconfigure(0, weight=1)
        self.root.columnconfigure(1, weight=1)
        self.root.rowconfigure(0, weight=1)

        preview_frame = ttk.Frame(self.root, padding=16)
        preview_frame.grid(row=0, column=0, sticky="nsew")
        preview_frame.rowconfigure(1, weight=1)
        preview_frame.columnconfigure(0, weight=1)

        self.progress_label = ttk.Label(preview_frame, text="")
        self.progress_label.grid(row=0, column=0, sticky="w")
        queue_actions = ttk.Frame(preview_frame)
        queue_actions.grid(row=1, column=0, sticky="ew", pady=(10, 0))
        queue_actions.columnconfigure(2, weight=1)
        ttk.Button(queue_actions, text="Choose Folder", command=self.choose_folder).grid(row=0, column=0)
        ttk.Button(queue_actions, text="Choose Photos", command=self.choose_individual_files).grid(row=0, column=1, padx=(8, 0))
        self.source_label = ttk.Label(preview_frame, text="", wraplength=380)
        self.source_label.grid(row=2, column=0, sticky="w", pady=(8, 0))
        self.preview_label = ttk.Label(preview_frame, anchor="center")
        self.preview_label.grid(row=3, column=0, sticky="nsew", pady=(12, 0))
        self.filename_label = ttk.Label(preview_frame, text="", wraplength=380)
        self.filename_label.grid(row=4, column=0, sticky="w", pady=(12, 0))

        form = ttk.Frame(self.root, padding=16)
        form.grid(row=0, column=1, sticky="nsew")
        form.columnconfigure(1, weight=1)

        self.title_var = tk.StringVar()
        self.caption_text = tk.Text(form, height=4, wrap="word")
        self.location_var = tk.StringVar()
        self.collection_var = tk.StringVar()
        self.collection_name_var = tk.StringVar()
        self.collection_description_var = tk.StringVar()
        self.tags_var = tk.StringVar()
        self.tag_choice_var = tk.StringVar()
        self.alt_text = tk.Text(form, height=3, wrap="word")

        row = 0
        self.add_entry(form, row, "Title", self.title_var)
        row += 1
        ttk.Label(form, text="Caption").grid(row=row, column=0, sticky="nw", pady=6)
        self.caption_text.grid(row=row, column=1, sticky="ew", pady=6)
        row += 1
        self.location_combo = self.add_combo(form, row, "Location", self.location_var, self.values["locations"])
        row += 1
        self.collection_combo = self.add_combo(form, row, "Collection ID", self.collection_var, self.values["collections"])
        row += 1
        self.add_entry(form, row, "Collection Name", self.collection_name_var)
        row += 1
        self.add_entry(form, row, "Collection Description", self.collection_description_var)
        row += 1
        self.add_entry(form, row, "Tags", self.tags_var)
        row += 1
        ttk.Label(form, text="Add Tag").grid(row=row, column=0, sticky="w", pady=6)
        tag_row = ttk.Frame(form)
        tag_row.grid(row=row, column=1, sticky="ew", pady=6)
        tag_row.columnconfigure(0, weight=1)
        self.tag_combo = ttk.Combobox(tag_row, textvariable=self.tag_choice_var, values=self.values["tags"])
        self.tag_combo.grid(row=0, column=0, sticky="ew")
        ttk.Button(tag_row, text="Add", command=self.add_tag).grid(row=0, column=1, padx=(8, 0))
        row += 1
        ttk.Label(form, text="Alt Description").grid(row=row, column=0, sticky="nw", pady=6)
        self.alt_text.grid(row=row, column=1, sticky="ew", pady=6)
        row += 1

        actions = ttk.Frame(form)
        actions.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(14, 0))
        actions.columnconfigure(0, weight=1)
        ttk.Button(actions, text="Use Previous", command=self.use_previous).grid(row=0, column=0, sticky="w")
        ttk.Button(actions, text="Skip", command=self.skip_photo).grid(row=0, column=1, padx=6)
        ttk.Button(actions, text="Save & Next", command=self.save_and_next).grid(row=0, column=2)

        self.collection_var.trace_add("write", self.sync_collection_fields)

    def add_entry(self, parent, row: int, label: str, variable) -> None:
        self.ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", pady=6)
        self.ttk.Entry(parent, textvariable=variable).grid(row=row, column=1, sticky="ew", pady=6)

    def add_combo(self, parent, row: int, label: str, variable, values: list[str]):
        self.ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", pady=6)
        combo = self.ttk.Combobox(parent, textvariable=variable, values=values)
        combo.grid(row=row, column=1, sticky="ew", pady=6)
        return combo

    def current_file(self) -> Path:
        return self.files[self.index]

    def load_current_photo(self) -> None:
        path = self.current_file()
        self.progress_label.config(text=f"Photo {self.index + 1} of {len(self.files)}")
        self.source_label.config(text=f"Source folder: {path.parent}")
        self.filename_label.config(text=str(path))
        self.title_var.set(title_from_filename(path))
        self.caption_text.delete("1.0", "end")
        self.alt_text.delete("1.0", "end")
        self.alt_text.insert("1.0", title_from_filename(path))

        if self.previous_metadata:
            self.location_var.set(self.previous_metadata.get("location", ""))
            self.collection_var.set(self.previous_metadata.get("collection", ""))
            self.collection_name_var.set(self.previous_metadata.get("collection_name", ""))
            self.collection_description_var.set(self.previous_metadata.get("collection_description", ""))
            self.tags_var.set(self.previous_metadata.get("tags", ""))
        else:
            self.location_var.set(self.values["locations"][0] if self.values["locations"] else "")
            self.collection_var.set(self.values["collections"][0] if self.values["collections"] else "")
            self.tags_var.set("")

        self.show_preview(path)

    def show_preview(self, path: Path) -> None:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((420, 420), Image.Resampling.LANCZOS)
            self.preview_image = self.image_tk.PhotoImage(image)
            self.preview_label.config(image=self.preview_image)

    def sync_collection_fields(self, *_args) -> None:
        collection_id = self.collection_var.get().strip()
        collection = next(
            (item for item in self.gallery.get("collections", []) if item.get("id") == collection_id),
            None,
        )
        if collection:
            self.collection_name_var.set(collection.get("name", ""))
            self.collection_description_var.set(collection.get("description", ""))
        elif collection_id:
            self.collection_name_var.set(display_name(collection_id))

    def add_tag(self) -> None:
        tag = self.tag_choice_var.get().strip()
        if not tag:
            return
        tags = split_tags(self.tags_var.get())
        if tag not in tags:
            tags.append(tag)
        self.tags_var.set(", ".join(tags))
        self.tag_choice_var.set("")

    def use_previous(self) -> None:
        if not self.previous_metadata:
            self.messagebox.showinfo("No previous photo", "Save one photo first, then reuse its metadata.")
            return
        self.location_var.set(self.previous_metadata.get("location", ""))
        self.collection_var.set(self.previous_metadata.get("collection", ""))
        self.collection_name_var.set(self.previous_metadata.get("collection_name", ""))
        self.collection_description_var.set(self.previous_metadata.get("collection_description", ""))
        self.tags_var.set(self.previous_metadata.get("tags", ""))

    def row_from_form(self) -> dict:
        collection = self.collection_var.get().strip()
        return {
            "file": str(self.current_file()),
            "title": self.title_var.get().strip(),
            "caption": self.caption_text.get("1.0", "end").strip(),
            "location": self.location_var.get().strip(),
            "collection": slugify(collection),
            "collection_name": self.collection_name_var.get().strip() or display_name(collection),
            "collection_description": self.collection_description_var.get().strip(),
            "tags": self.tags_var.get().strip(),
            "alt": self.alt_text.get("1.0", "end").strip(),
        }

    def save_and_next(self) -> None:
        if not self.files:
            self.choose_folder()
            return

        row = self.row_from_form()
        try:
            result = import_one_photo(self.gallery, self.args, self.current_file(), row)
        except Exception as error:  # noqa: BLE001 - GUI needs a friendly message for any import failure.
            self.messagebox.showerror("Could not import photo", str(error))
            return

        self.result.add(result)
        self.previous_metadata = {
            "location": row["location"],
            "collection": row["collection"],
            "collection_name": row["collection_name"],
            "collection_description": row["collection_description"],
            "tags": row["tags"],
        }
        save_gallery(self.args.manifest, self.gallery)
        self.refresh_suggestions()
        self.next_photo()

    def refresh_suggestions(self) -> None:
        self.values = existing_values(self.gallery)
        self.location_combo.config(values=self.values["locations"])
        self.collection_combo.config(values=self.values["collections"])
        self.tag_combo.config(values=self.values["tags"])

    def skip_photo(self) -> None:
        if not self.files:
            self.choose_folder()
            return
        self.next_photo()

    def next_photo(self) -> None:
        self.index += 1
        if self.index >= len(self.files):
            save_gallery(self.args.manifest, self.gallery)
            self.messagebox.showinfo(
                "Gallery updated",
                f"{self.result.added} added, {self.result.updated} updated, "
                f"{self.result.thumbnails} thumbnails generated.\n\n"
                "Choose another folder to keep going, or close the window.",
            )
            self.show_empty_state()
            return
        self.load_current_photo()


def run_interactive(args: argparse.Namespace) -> ImportResult:
    try:
        import tkinter  # noqa: F401
    except ImportError:
        raise SystemExit("Interactive mode requires tkinter, which is not available in this Python install.")

    app = InteractiveImporter(args)
    return app.run()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import photos and captions into the static gallery.")
    parser.add_argument("csv", type=Path, nargs="?", help="CSV with photo metadata.")
    parser.add_argument("--interactive", action="store_true", help="Open a lightweight Tk metadata entry window.")
    parser.add_argument("--folder", type=Path, help="Folder of photos to review in interactive mode.")
    parser.add_argument("--recursive", action="store_true", help="Scan the interactive folder recursively.")
    parser.add_argument("--manifest", type=Path, default=Path("data/gallery.json"))
    parser.add_argument("--images-dir", type=Path, default=Path("assets/images"))
    parser.add_argument("--thumbs-dir", type=Path, default=Path("assets/images/thumbs"))
    parser.add_argument("--max-size", type=int, default=900, help="Max thumbnail width/height in pixels.")
    parser.add_argument("--quality", type=int, default=78, help="JPEG thumbnail quality.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.csv is None:
        args.interactive = True
    result = run_interactive(args) if args.interactive else import_photos(args)
    print(
        f"Gallery updated: {result.added} added, {result.updated} updated, "
        f"{result.thumbnails} thumbnails generated."
    )


if __name__ == "__main__":
    main()
