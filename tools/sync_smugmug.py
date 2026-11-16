#!/usr/bin/env python3
"""Export public album previews and a few display-sized photos per album, using an API key, never owner credentials."""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit, parse_qsl, urlunsplit
from urllib.request import Request, urlopen

API = "https://api.smugmug.com"
SITE = "lukeboppart.smugmug.com"
MIN_INTERVAL = 0.75  # seconds between API calls
LOW_BUDGET = 5       # pause until the window resets when this few requests remain
MAX_WAIT = 300       # longest single pause, in seconds
MAX_ATTEMPTS = 3     # tries per request, including retries after a 429


class Throttle:
    """Spaces API calls apart and honours rate-limit pauses."""

    def __init__(self, min_interval=MIN_INTERVAL, sleep=time.sleep, clock=time.monotonic):
        self.min_interval = min_interval
        self.sleep = sleep
        self.clock = clock
        self.next_at = 0.0

    def wait(self):
        delay = self.next_at - self.clock()
        if delay > 0:
            self.sleep(delay)
        self.next_at = self.clock() + self.min_interval

    def pause(self, seconds):
        self.sleep(min(max(seconds, 0.0), MAX_WAIT))
        self.next_at = self.clock()


SHARED_THROTTLE = Throttle()


def seconds_until(value, default, now=time.time):
    """Rate-limit headers may carry seconds to wait or an epoch timestamp."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, number - now()) if number > 1_000_000_000 else number


def request(path, opener=urlopen, throttle=None):
    throttle = throttle or SHARED_THROTTLE
    url = urlsplit(API + path if path.startswith("/api/v2/") else path)
    if url.scheme != "https" or url.netloc != "api.smugmug.com" or not url.path.startswith("/api/v2/"):
        raise ValueError("Unexpected API URL")
    query = dict(parse_qsl(url.query))
    query.update(APIKey=os.environ["SMUGMUG_API_KEY"], _verbosity="1")
    url = urlunsplit(url._replace(query=urlencode(query)))
    for attempt in range(1, MAX_ATTEMPTS + 1):
        throttle.wait()
        try:
            with opener(Request(url, headers={"Accept": "application/json"}), timeout=30) as response:
                headers = response.headers
                data = json.load(response)
        except HTTPError as error:
            # The error text would include the request URL, which carries the key, so re-raise without logging it.
            if error.code != 429 or attempt == MAX_ATTEMPTS:
                raise
            throttle.pause(seconds_until(error.headers.get("Retry-After"), default=60.0))
            continue
        remaining = (headers.get("X-RateLimit-Remaining") or "").strip()
        if remaining.isdigit() and int(remaining) <= LOW_BUDGET:
            throttle.pause(seconds_until(headers.get("X-RateLimit-Reset"), default=60.0))
        if data.get("Code") != 200:
            raise ValueError("SmugMug API request failed")
        return data["Response"]


def memoized(fetch):
    """Reuse a response for the rest of one run, e.g. a cover image's sizes also listed as a photo."""
    cache = {}

    def wrapped(path):
        if path not in cache:
            cache[path] = fetch(path)
        return cache[path]

    return wrapped


def link(obj, name):
    value = obj.get("Uris", {}).get(name)
    return value.get("Uri") if isinstance(value, dict) else value


def safe_url(value, host):
    url = urlsplit(value or "")
    return value if url.scheme == "https" and url.netloc == host else None


PHOTOS_PER_ALBUM = 12
IMAGE_FETCH_COUNT = 30
LARGE_SIZES = ("X2LargeImageUrl", "XLargeImageUrl", "LargeImageUrl", "MediumImageUrl")
THUMB_SIZES = ("MediumImageUrl", "SmallImageUrl", "LargeImageUrl")


def first_safe(sizes, keys):
    for key in keys:
        value = safe_url(sizes.get(key), "photos.smugmug.com")
        if value:
            return value
    return None


def clean_text(value, limit=200):
    return " ".join(str(value or "").split())[:limit]


def collect_photos(album, fetch):
    """Public, visible photos with display-sized (not original) image URLs."""
    path = link(album, "AlbumImages")
    if not path:
        return []
    path += ("&" if "?" in path else "?") + f"count={IMAGE_FETCH_COUNT}"
    photos = []
    for image in fetch(path).get("AlbumImage", []):
        if len(photos) >= PHOTOS_PER_ALBUM:
            break
        if image.get("Hidden") or not link(image, "ImageSizes"):
            continue
        sizes = fetch(link(image, "ImageSizes"))["ImageSizes"]
        src, thumb = first_safe(sizes, LARGE_SIZES), first_safe(sizes, THUMB_SIZES)
        page = safe_url(image.get("WebUri"), SITE)
        if not (src and thumb and page):
            continue
        photo = {"title": clean_text(image.get("Title") or image.get("FileName", "").rsplit(".", 1)[0]),
                 "caption": clean_text(image.get("Caption"), 300),
                 "url": page, "src": src, "thumb": thumb}
        width, height = image.get("OriginalWidth"), image.get("OriginalHeight")
        if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
            photo.update(w=width, h=height)
        photos.append(photo)
    return photos


def unlocked(obj):
    # Public discovery can include passworded album titles. Do not export those.
    return (obj.get("SecurityType") == "None"
            and obj.get("EffectiveSecurityType", "None") == "None"
            and not link(obj, "UnlockNode") and not link(obj, "UnlockAlbum")
            and obj.get("Privacy", "Public") == "Public")


def collect(fetch=request):
    fetch = memoized(fetch)
    user = fetch("/api/v2/user/lukeboppart")["User"]
    root = fetch(link(user, "Node"))["Node"]
    if not unlocked(root):
        return []
    previews, visited = [], set()

    def walk(path):
        while path:
            if path in visited:
                raise ValueError("Repeated pagination or folder URL")
            visited.add(path)
            result = fetch(path)
            for node in result.get("Node", []):
                if not unlocked(node):
                    continue
                if node.get("Type") == "Folder" and link(node, "ChildNodes"):
                    walk(link(node, "ChildNodes"))
                elif node.get("Type") == "Album" and link(node, "Album"):
                    album = fetch(link(node, "Album"))["Album"]
                    if not unlocked(album) or not album.get("External") or not album.get("ImageCount"):
                        continue
                    href = safe_url(album.get("WebUri"), SITE)
                    if not href or not link(album, "AlbumHighlightImage"):
                        continue
                    image = fetch(link(album, "AlbumHighlightImage")).get("AlbumImage", {})
                    if image.get("Hidden") or not link(image, "ImageSizes"):
                        continue
                    sizes = fetch(link(image, "ImageSizes"))["ImageSizes"]
                    cover = next((safe_url(sizes.get(size), "photos.smugmug.com")
                                  for size in ("LargeImageUrl", "MediumImageUrl", "SmallImageUrl")
                                  if safe_url(sizes.get(size), "photos.smugmug.com")), None)
                    if cover:
                        previews.append({"name": album["Name"], "url": href,
                                         "cover": cover, "count": album["ImageCount"],
                                         "photos": collect_photos(album, fetch)})
            path = result.get("Pages", {}).get("NextPage")

    # Discover only what an anonymous visitor can browse; never look up supplied private links.
    if link(root, "ChildNodes"):
        walk(link(root, "ChildNodes"))
    return previews


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="data/smugmug.json")
    args = parser.parse_args()
    failed = False
    try:
        albums = collect()
    except Exception:
        # Do not log request URLs (which contain the key), or retain old previews on failure.
        print("SmugMug refresh failed; publishing no album previews.", file=sys.stderr)
        albums, failed = [], True
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"generatedAt": datetime.now(timezone.utc).isoformat(),
                                  "available": not failed, "albums": albums}, indent=2) + "\n")
    print(f"Exported {len(albums)} public album previews.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
