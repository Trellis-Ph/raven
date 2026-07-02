# Copyright (c) 2026, Trellis-Ph and contributors
# See license.txt
"""A Raven User `enabled` flip must invalidate the per-channel members cache.

`get_channel_members` (raven/utils.py) builds each channel's members map with a
`WHERE raven_user.enabled = 1` filter and caches it with no TTL, busted only on
membership changes to that channel — never when a member's Raven User is
enabled/disabled. Without the fix, a disabled-then-re-enabled user (e.g. from
Trellis role churn) stays wrongly excluded/included in every channel's cached
map until the next membership change, which surfaced as "you do not have
permission to access this channel" on their DMs.

Uses FrappeTestCase (frappe.tests.utils) rather than IntegrationTestCase so the
module imports on the deployed frappe (v15.111) as well as newer.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from raven.api.raven_channel import create_direct_message_channel
from raven.utils import get_channel_members


class TestRavenUserEnabledCacheInvalidation(FrappeTestCase):
	def _ensure_user(self, email):
		# Idempotent: reuse if present (a Raven User can't be hard-deleted once it
		# has channel links), and always reset enabled=1 so the disable test is
		# repeatable even if a prior run committed.
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": email.split("@")[0],
					"send_welcome_email": 0,
					"roles": [{"role": "Raven User"}],
				}
			).insert(ignore_permissions=True)
		if frappe.db.exists("Raven User", email):
			ru = frappe.get_doc("Raven User", email)
			if not ru.enabled:
				ru.enabled = 1
				ru.save(ignore_permissions=True)
		return frappe.get_doc("User", email)

	def setUp(self):
		self.addCleanup(frappe.set_user, "Administrator")
		self.user_a = self._ensure_user("raven-cache-a@example.com")
		self.user_b = self._ensure_user("raven-cache-b@example.com")

	def _dm_channel(self):
		frappe.set_user(self.user_a.name)
		channel = create_direct_message_channel(self.user_b.name)
		frappe.set_user("Administrator")
		return channel

	def test_enabled_flip_busts_channel_member_cache(self):
		channel = self._dm_channel()
		cache_key = f"raven:channel_members:{channel}"
		frappe.cache().delete_value(cache_key)
		self.assertIn(self.user_b.name, get_channel_members(channel))  # populate cache

		rb = frappe.get_doc("Raven User", self.user_b.name)
		rb.enabled = 0
		rb.save(ignore_permissions=True)

		self.assertIsNone(
			frappe.cache().get_value(cache_key),
			"enabled flip must invalidate the channel members cache",
		)
		# a rebuild reflects the new enabled state
		self.assertNotIn(self.user_b.name, get_channel_members(channel))

	def test_non_enabled_save_keeps_channel_member_cache(self):
		# A save that does NOT change enabled must leave the cache intact (avoid
		# churn on frequent availability/status updates).
		channel = self._dm_channel()
		cache_key = f"raven:channel_members:{channel}"
		frappe.cache().delete_value(cache_key)
		get_channel_members(channel)  # populate

		rb = frappe.get_doc("Raven User", self.user_b.name)
		rb.full_name = "Changed Name"
		rb.save(ignore_permissions=True)

		self.assertIsNotNone(frappe.cache().get_value(cache_key))
