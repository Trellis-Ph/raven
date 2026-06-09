import io
import unittest

from PIL import Image

from raven.api.upload_file import _transpose_and_reencode_jpeg


def _png_bytes(mode, size=(64, 48)):
	"""Return PNG-encoded bytes of a solid image in the given PIL mode."""
	color = (10, 20, 30, 128) if mode in ("RGBA",) else (10, 20, 30)
	image = Image.new(mode, size, color)
	buffer = io.BytesIO()
	image.save(buffer, format="PNG")
	return buffer.getvalue()


class TestTransposeAndReencodeJPEG(unittest.TestCase):
	"""Regression for ISS-2026-00145.

	Attaching an alpha-channel image (e.g. a screenshot) under a .jpg name
	took Raven's JPEG branch and crashed the upload with
	OSError("cannot write mode RGBA as JPEG"), so the message silently never
	sent — the user just saw "cannot attach photos in raven".
	"""

	def test_rgba_image_is_flattened_to_rgb_jpeg(self):
		# Before the fix this raised OSError("cannot write mode RGBA as JPEG").
		out = _transpose_and_reencode_jpeg(_png_bytes("RGBA"))
		with Image.open(io.BytesIO(out)) as reencoded:
			self.assertEqual(reencoded.format, "JPEG")
			self.assertEqual(reencoded.mode, "RGB")  # alpha flattened, not crashed

	def test_palette_image_with_transparency_is_flattened(self):
		out = _transpose_and_reencode_jpeg(_png_bytes("P"))
		with Image.open(io.BytesIO(out)) as reencoded:
			self.assertEqual(reencoded.format, "JPEG")

	def test_plain_rgb_image_still_reencodes(self):
		out = _transpose_and_reencode_jpeg(_png_bytes("RGB"))
		with Image.open(io.BytesIO(out)) as reencoded:
			self.assertEqual(reencoded.format, "JPEG")
			self.assertEqual(reencoded.mode, "RGB")


if __name__ == "__main__":
	unittest.main()
