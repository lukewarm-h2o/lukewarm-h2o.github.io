import json
import os
import unittest
from unittest import mock
from urllib.error import HTTPError

from sync_smugmug import Throttle, collect, memoized, request, seconds_until


class PublicDiscoveryTests(unittest.TestCase):
    def test_nested_paginated_public_albums_only(self):
        def node(kind, **extra):
            return dict(Type=kind, SecurityType="None", **extra)

        public = node("Album", Uris={"Album": "album"})
        responses = {
            "/api/v2/user/lukeboppart": {"User": {"Uris": {"Node": "root"}}},
            "root": {"Node": node("Folder", Uris={"ChildNodes": "first"})},
            "first": {"Node": [node("Folder", Uris={"ChildNodes": "nested"}),
                                dict(public, SecurityType="Password", Uris={"Album": "must-not-fetch"}),
                                dict(public, EffectiveSecurityType="Private", Uris={"Album": "must-not-fetch"})],
                      "Pages": {"NextPage": "second"}},
            "nested": {"Node": [dict(public, Privacy="Unlisted", Uris={"Album": "must-not-fetch"})]},
            "second": {"Node": [public]},
            "album": {"Album": dict(SecurityType="None", External=True, ImageCount=1,
                                      Name="Public", WebUri="https://lukeboppart.smugmug.com/Public",
                                      Uris={"AlbumHighlightImage": "image", "AlbumImages": "images"})},
            "images?count=30": {"AlbumImage": [
                {"Hidden": True, "Uris": {"ImageSizes": "must-not-fetch"}},
                {"Hidden": False, "Title": "  A  photo ", "WebUri": "https://lukeboppart.smugmug.com/Public/i-1",
                 "OriginalWidth": 4000, "OriginalHeight": 3000, "Uris": {"ImageSizes": "sizes"}},
                {"Hidden": False, "WebUri": "https://evil.example/i-2", "Uris": {"ImageSizes": "sizes"}},
            ]},
            "image": {"AlbumImage": {"Hidden": False, "Uris": {"ImageSizes": "sizes"}}},
            "sizes": {"ImageSizes": {"LargeImageUrl": "https://photos.smugmug.com/test.jpg"}},
        }
        albums = collect(responses.__getitem__)
        self.assertEqual([a["name"] for a in albums], ["Public"])
        photos = albums[0]["photos"]
        self.assertEqual(len(photos), 1)
        self.assertEqual(photos[0]["title"], "A photo")
        self.assertEqual((photos[0]["w"], photos[0]["h"]), (4000, 3000))
        self.assertTrue(photos[0]["src"].startswith("https://photos.smugmug.com/"))
        responses["image"]["AlbumImage"]["Hidden"] = True
        self.assertEqual(collect(responses.__getitem__), [])
        responses["root"]["Node"]["EffectiveSecurityType"] = "Password"
        self.assertEqual(collect(responses.__getitem__), [])


class FakeResponse:
    def __init__(self, body, headers=None):
        self.body = json.dumps(body).encode()
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self, *args):
        return self.body


def too_many(retry_after=None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return HTTPError("https://api.smugmug.com/x", 429, "Too Many Requests", headers, None)


class RateLimitTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, {"SMUGMUG_API_KEY": "test-key"})
        patcher.start()
        self.addCleanup(patcher.stop)

    def throttle(self, sleeps):
        return Throttle(min_interval=0.75, sleep=sleeps.append, clock=lambda: 0.0)

    def test_retries_after_429_honouring_retry_after(self):
        sleeps, calls = [], []

        def opener(req, timeout=30):
            calls.append(req)
            if len(calls) == 1:
                raise too_many("7")
            return FakeResponse({"Code": 200, "Response": {"ok": True}})

        self.assertEqual(request("/api/v2/user/x", opener=opener, throttle=self.throttle(sleeps)), {"ok": True})
        self.assertEqual(len(calls), 2)
        self.assertEqual(sleeps, [7.0])

    def test_gives_up_after_max_attempts(self):
        calls = []

        def opener(req, timeout=30):
            calls.append(req)
            raise too_many()

        with self.assertRaises(HTTPError):
            request("/api/v2/user/x", opener=opener, throttle=self.throttle([]))
        self.assertEqual(len(calls), 3)

    def test_pauses_until_reset_when_budget_is_low(self):
        sleeps = []

        def opener(req, timeout=30):
            return FakeResponse({"Code": 200, "Response": {}},
                                headers={"X-RateLimit-Remaining": "3", "X-RateLimit-Reset": "42"})

        request("/api/v2/user/x", opener=opener, throttle=self.throttle(sleeps))
        self.assertIn(42.0, sleeps)

    def test_throttle_spaces_consecutive_calls(self):
        sleeps, now = [], [0.0]
        throttle = Throttle(min_interval=0.75, sleep=sleeps.append, clock=lambda: now[0])
        throttle.wait()
        now[0] = 0.25
        throttle.wait()
        self.assertEqual(sleeps, [0.5])

    def test_seconds_until_accepts_seconds_or_epoch(self):
        self.assertEqual(seconds_until("10", default=1.0), 10.0)
        self.assertEqual(seconds_until("1900000010", default=1.0, now=lambda: 1900000000.0), 10.0)
        self.assertEqual(seconds_until("Wed, 21 Oct", default=5.0), 5.0)

    def test_memoized_fetches_each_path_once(self):
        calls = []
        fetch = memoized(lambda path: calls.append(path) or {"path": path})
        fetch("a")
        fetch("a")
        fetch("b")
        self.assertEqual(calls, ["a", "b"])


if __name__ == "__main__":
    unittest.main()
