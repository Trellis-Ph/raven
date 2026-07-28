# Sending markdown announcements (Trellis fork)

Two ways to post a well-formatted `.md` announcement to a Raven channel.

## Option A — paste into the chat box

Copy the markdown source and paste it into the composer. Pastes that look
like markdown are converted to rich formatting automatically (headings,
bold, lists, code). Review the result in the composer, then send.

The composer has no table support, so if a pasted document contains a
markdown table, the **entire paste** is left as literal, unconverted text —
not just the table. This is surprising: a `.md` file with headings, lists,
and a table will paste with none of it converted, headings and lists
included, because the whole paste is declined together (there is no way to
convert everything except the table). To get formatting on a document like
that, remove the table before pasting, or send it via Option B below, whose
server-side conversion does support tables.

If you did not want the conversion, hold **Shift while pasting**. That keeps
block-level structure — headings, lists, quotes, code blocks — as
plain text. Inline styling is a separate, always-on Tiptap behaviour and
still applies even with Shift held: `**bold**`, `*italic*`, `~~strike~~`,
`` `code` ``, `==highlight==`, and bare URLs are auto-formatted regardless.

Ctrl+Z undoes a conversion you already made, but it reverts the paste
entirely rather than leaving the literal markdown behind — so to get the
raw text, re-paste with Shift held.

## Option B — bot script (repeatable / automatable)

`RavenBot.send_message` converts markdown server-side. From
`bench --site <site> console`:

```python
bot = frappe.get_doc("Raven Bot", "<bot-name>")  # any existing bot
bot.send_message(
    channel_id="<channel-id>",  # Raven Channel name, e.g. from the channel URL
    text=open("/path/to/ANNOUNCEMENT.md").read(),
    markdown=True,
)
frappe.db.commit()
```

A **Raven Incoming Webhook** is the no-console equivalent — POST the
markdown as `content` and it converts the same way:

```json
{ "content": "# Heading\n\nSome **bold** text." }
```

The field must be `content`. Any other key is ignored and the webhook
posts an empty message while still returning success.

Incoming webhooks have no Raven-side UI — create one in the Frappe desk at
`/app/raven-incoming-webhook/new`. (Raven settings → Integrations →
Webhooks is the *outgoing* `Raven Webhook` doctype, which is a different
thing and will not do this.)

Verify on sandbox before posting to a production channel.
