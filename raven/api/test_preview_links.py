import unittest
from unittest.mock import MagicMock, patch

import frappe

from raven.api import preview_links


def setUpModule():
	# The @frappe.whitelist type-validation wrapper reads frappe.local.flags; these tests need no site.
	if not getattr(frappe.local, "flags", None):
		frappe.local.flags = frappe._dict(in_test=True)


class _FakeCache:
	def __init__(self, initial=None):
		self.store = dict(initial or {})

	def get_value(self, key):
		return self.store.get(key)

	def set_value(self, key, value):
		self.store[key] = value


class TestPreviewLinksOffRequestPath(unittest.TestCase):
	"""The web request must never fetch a third-party page.

	Fetching inline held a gunicorn sync worker for up to 30 s per new link, and prod runs only a
	handful of workers — so a few fresh links made all of Raven (and Trellis) feel slow.
	"""

	def setUp(self):
		self.cache = _FakeCache()
		patcher = patch.object(preview_links.frappe, "cache", return_value=self.cache)
		patcher.start()
		self.addCleanup(patcher.stop)
		enqueue = patch.object(preview_links.frappe, "enqueue")
		self.enqueue = enqueue.start()
		self.addCleanup(enqueue.stop)

	def test_cache_miss_enqueues_instead_of_fetching(self):
		with patch.object(preview_links, "LinkGrabber") as grabber:
			result = preview_links.get_preview_link('["https://example.com/a"]')

		grabber.assert_not_called()
		self.assertEqual(result, [preview_links.EMPTY_PREVIEW])
		self.enqueue.assert_called_once()
		kwargs = self.enqueue.call_args.kwargs
		self.assertEqual(kwargs["url"], "https://example.com/a")
		self.assertTrue(kwargs["deduplicate"])
		self.assertEqual(kwargs["job_id"], preview_links._preview_job_id("https://example.com/a"))
		# The placeholder must NOT be cached, or the real preview would never be shown
		self.assertNotIn("https://example.com/a", self.cache.store)

	def test_cache_hit_returns_cached_without_enqueue(self):
		cached = dict(preview_links.EMPTY_PREVIEW, title="Hi", site_name="Ex", description="d")
		self.cache.store["https://example.com/a"] = cached

		result = preview_links.get_preview_link('["https://example.com/a"]')

		self.assertEqual(result, [cached])
		self.enqueue.assert_not_called()

	def test_unpreviewable_links_cached_empty_and_not_enqueued(self):
		urls = ["mailto:a@b.c", "tel:123", "http://10.0.0.1/x", "https://192.168.1.1"]
		result = preview_links.get_preview_link(preview_links.json.dumps(urls))

		self.assertEqual(result, [preview_links.EMPTY_PREVIEW] * 4)
		self.enqueue.assert_not_called()
		for url in urls:
			self.assertEqual(self.cache.store[url], preview_links.EMPTY_PREVIEW)

	def test_empty_input(self):
		self.assertEqual(preview_links.get_preview_link("[]"), [])
		self.assertEqual(preview_links.get_preview_link(""), [])


class TestFetchAndCachePreview(unittest.TestCase):
	def setUp(self):
		self.cache = _FakeCache()
		patcher = patch.object(preview_links.frappe, "cache", return_value=self.cache)
		patcher.start()
		self.addCleanup(patcher.stop)

	def test_uses_short_timeouts_and_caches_result(self):
		grabber = MagicMock()
		grabber.get_content.return_value = (
			'<html><head><meta property="og:title" content="T"><meta property="og:site_name" '
			'content="S"><meta property="og:description" content="D"></head></html>',
			"https://example.com/a",
		)
		with patch.object(preview_links, "LinkGrabber", return_value=grabber) as grabber_cls:
			preview_links.fetch_and_cache_preview("https://example.com/a")

		grabber_cls.assert_called_once_with(
			initial_timeout=preview_links.PREVIEW_CONNECT_TIMEOUT,
			receive_timeout=preview_links.PREVIEW_RECEIVE_TIMEOUT,
		)
		data = self.cache.store["https://example.com/a"]
		self.assertEqual((data["title"], data["site_name"], data["description"]), ("T", "S", "D"))

	def test_failure_caches_empty_so_it_is_not_retried_forever(self):
		grabber = MagicMock()
		grabber.get_content.side_effect = TimeoutError("timeout reached")
		with patch.object(preview_links, "LinkGrabber", return_value=grabber):
			preview_links.fetch_and_cache_preview("https://slow.example.com")

		self.assertEqual(self.cache.store["https://slow.example.com"], preview_links.EMPTY_PREVIEW)

	def test_twitter_uses_imessagebot_headers(self):
		grabber = MagicMock()
		grabber.get_content.return_value = ("<html></html>", "https://x.com/a")
		with patch.object(preview_links, "LinkGrabber", return_value=grabber):
			preview_links.fetch_and_cache_preview("https://x.com/a")

		grabber.get_content.assert_called_once_with("https://x.com/a", headers="imessagebot")

	def test_already_cached_is_a_noop(self):
		self.cache.store["https://example.com/a"] = {"title": "kept"}
		with patch.object(preview_links, "LinkGrabber") as grabber_cls:
			preview_links.fetch_and_cache_preview("https://example.com/a")

		grabber_cls.assert_not_called()
		self.assertEqual(self.cache.store["https://example.com/a"], {"title": "kept"})


if __name__ == "__main__":
	unittest.main()
