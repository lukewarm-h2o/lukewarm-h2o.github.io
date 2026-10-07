#!/usr/bin/env python3
"""Export public album previews using an API key, never owner credentials."""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urlsplit, parse_qsl, urlunsplit
from urllib.request import Request, urlopen

API = "https://api.smugmug.com"
SITE = "lukeboppart.smugmug.com"


def request(path):
    url = urlsplit(API + path if path.startswith("/api/v2/") else path)
    if url.scheme != "https" or url.netloc != "api.smugmug.com" or not url.path.startswith("/api/v2/"):
        raise ValueError("Unexpected API URL")
    query = dict(parse_qsl(url.query))
    query.update(APIKey=os.environ["SMUGMUG_API_KEY"], _verbosity="1")
    url = urlunsplit(url._replace(query=urlencode(query)))
    with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=30) as response:
        data = json.load(response)
    if data.get("Code") != 200:
        raise ValueError("SmugMug API request failed")
    return data["Response"]


def link(obj, name):
    value = obj.get("Uris", {}).get(name)
    return value.get("Uri") if isinstance(value, dict) else value


def safe_url(value, host):
    url = urlsplit(value or "")
    return value if url.scheme == "https" and url.netloc == host else None


def unlocked(obj):
    # Public discovery can include passworded album titles. Do not export those.
    return (obj.get("SecurityType") == "None"
            and obj.get("EffectiveSecurityType", "None") == "None"
            and not link(obj, "UnlockNode") and not link(obj, "UnlockAlbum")
            and obj.get("Privacy", "Public") == "Public")


def collect(fetch=request):
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
                                         "cover": cover, "count": album["ImageCount"]})
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
