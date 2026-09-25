import hashlib
import json
import re

import frappe
from frappe import _
from linkpreview import Link, LinkGrabber, LinkPreview


# Link previews are fetched from third-party sites. Doing that inside the web request held one of
# the (few) gunicorn sync workers for up to initial_timeout + receive_timeout per URL (20 s + 10 s
# with the library defaults), so a burst of new links queued every other request on the site behind
# them. The request path now only reads the cache; a cache miss enqueues ONE deduplicated background
# fetch with tight timeouts and answers "no preview yet" (not cached), so the next read shows it.
PREVIEW_CONNECT_TIMEOUT = 5
PREVIEW_RECEIVE_TIMEOUT = 5
PREVIEW_JOB_TIMEOUT = 30

EMPTY_PREVIEW = {
	"title": "",
	"description": "",
	"image": "",
	"force_title": "",
	"absolute_image": "",
	"site_name": "",
}


@frappe.whitelist(methods=["GET"])
def get_preview_link(urls: list[str] | str):
	message_links = []

	if urls and urls != "[]":
		if isinstance(urls, str):
			urls = json.loads(urls)

		for url in urls:
			data = frappe.cache().get_value(url)
			if data is None:
				if _is_unpreviewable(url):
					data = dict(EMPTY_PREVIEW)
					frappe.cache().set_value(url, data)
				else:
					_enqueue_preview_fetch(url)
					data = dict(EMPTY_PREVIEW)
			message_links.append(data)

	return message_links


def _is_unpreviewable(url: str) -> bool:
	"""Don't try to preview insecure links like IP addresses, or mailto/tel links."""
	return bool(
		url.startswith("mailto")
		or url.startswith("tel")
		or re.match(r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", url)
	)


def _preview_job_id(url: str) -> str:
	return "raven_link_preview::" + hashlib.sha1(url.encode()).hexdigest()


def _enqueue_preview_fetch(url: str):
	frappe.enqueue(
		"raven.api.preview_links.fetch_and_cache_preview",
		queue="short",
		timeout=PREVIEW_JOB_TIMEOUT,
		job_id=_preview_job_id(url),
		deduplicate=True,
		url=url,
	)


def fetch_and_cache_preview(url: str):
	"""Background job: fetch the preview for one URL and cache it (empty on any failure)."""
	if frappe.cache().get_value(url) is not None:
		return

	data = dict(EMPTY_PREVIEW)
	try:
		grabber = LinkGrabber(
			initial_timeout=PREVIEW_CONNECT_TIMEOUT, receive_timeout=PREVIEW_RECEIVE_TIMEOUT
		)
		# The linkpreview library doesn't support Twitter/X previews with the default bot headers
		if "twitter.com" in url or "x.com" in url:
			content, url_fetched = grabber.get_content(url, headers="imessagebot")
		else:
			content, url_fetched = grabber.get_content(url)
		preview = LinkPreview(Link(url_fetched, content))

		# Description might have emojis in them, which comes in with special characters like copyright etc
		# TODO: We need to replace these special characters with the actual emojis
		data = {
			"title": str(preview.title or ""),
			"description": str(preview.description or ""),
			"image": str(preview.image or ""),
			"force_title": str(preview.force_title or ""),
			"absolute_image": str(preview.absolute_image or ""),
			"site_name": str(preview.site_name or ""),
		}
	except Exception:
		pass

	frappe.cache().set_value(url, data)


@frappe.whitelist(methods=["POST"])
def hide_link_preview(message_id: str):
	"""
	Remove the preview from the message
	"""
	message = frappe.get_doc("Raven Message", message_id)

	if not message.has_permission():
		frappe.throw(_("You do not have permission to hide link previews on this message."))

	message.flags.ignore_permissions = True
	message.hide_link_preview = 1
	message.flags.editing_metadata = True
	message.save()
