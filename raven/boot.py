import frappe


def boot_session(bootinfo):

	raven_settings = frappe.get_single("Raven Settings")

	bootinfo.show_raven_chat_on_desk = raven_settings.show_raven_on_desk

	tenor_api_key = raven_settings.tenor_api_key

	document_link_override = frappe.get_hooks("raven_document_link_override")

	if frappe.session.user and frappe.session.user != "Guest":
		chat_style = frappe.db.get_value("Raven User", frappe.session.user, "chat_style")
	else:
		chat_style = "Simple"

	if document_link_override and len(document_link_override) > 0:
		bootinfo.raven_document_link_override = True

	# Upstream fell back to a hardcoded Google API key here (its own comment asked
	# "should we remove this?"). Removed 2026-08-07: that key is revoked AND the
	# whole Tenor API is discontinued — tenor.googleapis.com answers 403 "Tenor API
	# is discontinued" for any key. The fallback only disguised a missing
	# configuration as a working one, and shipped a credential in bootinfo to every
	# client for the privilege. Absent config now reads as absent.
	if tenor_api_key:
		bootinfo.tenor_api_key = tenor_api_key

	bootinfo.chat_style = chat_style if chat_style else "Simple"

	bootinfo.push_notification_service = (
		raven_settings.push_notification_service
		if raven_settings.push_notification_service
		else "Frappe Cloud"
	)

	if raven_settings.push_notification_service == "Raven":
		bootinfo.vapid_public_key = raven_settings.vapid_public_key
		bootinfo.firebase_client_config = raven_settings.config
