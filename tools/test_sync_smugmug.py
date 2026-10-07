import unittest
from sync_smugmug import collect


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
                                      Uris={"AlbumHighlightImage": "image"})},
            "image": {"AlbumImage": {"Hidden": False, "Uris": {"ImageSizes": "sizes"}}},
            "sizes": {"ImageSizes": {"LargeImageUrl": "https://photos.smugmug.com/test.jpg"}},
        }
        self.assertEqual([a["name"] for a in collect(responses.__getitem__)], ["Public"])
        responses["image"]["AlbumImage"]["Hidden"] = True
        self.assertEqual(collect(responses.__getitem__), [])
        responses["root"]["Node"]["EffectiveSecurityType"] = "Password"
        self.assertEqual(collect(responses.__getitem__), [])


if __name__ == "__main__":
    unittest.main()
