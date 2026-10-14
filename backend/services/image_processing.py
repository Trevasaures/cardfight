"""Shared image input and encoding helpers for artwork and card analysis."""

from io import BytesIO
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.datastructures import FileStorage

from backend.errors import ValidationError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def read_image_upload(image_file: FileStorage | None) -> bytes:
    if image_file is None or not image_file.filename:
        raise ValidationError("Choose an image file.")
    if image_file.mimetype not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Image must be a PNG, JPG, JPEG, or WebP file.")
    data = image_file.read(MAX_IMAGE_BYTES + 1)
    validate_image_size(data)
    return data


def validate_image_size(data: bytes) -> None:
    if not data:
        raise ValidationError("Image file is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValidationError("Image file is too large. Maximum size is 8 MB.")


def decode_image(data: bytes) -> Image.Image:
    """Decode real image contents, apply orientation, and detach from the input stream."""
    validate_image_size(data)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValidationError(
                        "Image must be a PNG, JPG, JPEG, or WebP file."
                    )
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise ValidationError(
                        "Image dimensions are too large. Maximum is 20 megapixels."
                    )
                if getattr(image, "is_animated", False):
                    raise ValidationError(
                        "Choose a still image, rather than an animation."
                    )
                image.load()
                oriented = ImageOps.exif_transpose(image)
                return oriented.convert("RGBA" if "A" in oriented.getbands() else "RGB")
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ValidationError(
            "Could not read this image. Choose a valid PNG, JPEG, or WebP."
        ) from exc


def encode_image(image: Image.Image, image_format: str, **options) -> bytes:
    output = BytesIO()
    image.save(output, format=image_format, **options)
    return output.getvalue()
