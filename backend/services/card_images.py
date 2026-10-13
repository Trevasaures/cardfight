"""Prepare artwork once, then keep normal catalog requests free of image bytes."""

from datetime import timedelta
from hashlib import sha256
from io import BytesIO

from PIL import Image

from backend.database import db
from backend.models import CardImage, CardPrinting, now_central
from backend.services.card_types import crest_card_type
from backend.services.image_processing import decode_image, encode_image


def image_urls(image_id):
    return {
        "image_url": f"/api/card-images/{image_id}/full",
        "thumbnail_url": f"/api/card-images/{image_id}/thumbnail",
    }


def serialize_image(image):
    return {
        "id": image.id,
        **image_urls(image.id),
        "width": image.width,
        "height": image.height,
        "byte_size": image.byte_size,
        "thumbnail_byte_size": image.thumbnail_byte_size,
    }


def _artwork_recipe(card_type):
    crest = crest_card_type(card_type)
    return (
        b"cardfight-crest-artwork-v1-ccw-contain-7x5\0" + crest.encode() + b"\0"
        if crest
        else b"cardfight-artwork-v1\0"
    )


def _crest_canvas(original):
    """Rotate sideways CDN scans, then contain every pixel in an exact 7:5 frame."""
    full = (
        original.transpose(Image.Transpose.ROTATE_90)
        if original.height > original.width
        else original.copy()
    )
    # Multiples of seven/five give an exact ratio at any size. The minimal
    # enclosing frame adds padding without upscaling small source artwork.
    scale = min(240, max((full.width + 6) // 7, (full.height + 4) // 5))
    canvas = Image.new("RGBA", (scale * 7, scale * 5), (0, 0, 0, 0))
    full.thumbnail(canvas.size, Image.Resampling.LANCZOS)
    canvas.paste(
        full, ((canvas.width - full.width) // 2, (canvas.height - full.height) // 2)
    )
    return canvas


def prepare_image(data, card_type=None, *, commit=True):
    """An import is a draft until a card save links it; identical input reuses bytes."""
    # Include the processing recipe so future encoding changes get fresh cache URLs.
    recipe = _artwork_recipe(card_type)
    crest = crest_card_type(card_type)
    image_id = sha256(recipe + data).hexdigest()
    existing = db.session.get(CardImage, image_id)
    if existing:
        existing.last_used_at = now_central()
        if commit:
            db.session.commit()
        return existing

    with decode_image(data) as original:
        full = _crest_canvas(original) if crest else original.copy()
        if not crest:
            full.thumbnail((1200, 1680), Image.Resampling.LANCZOS)
        # Lossless crest output makes normalizing an already-normalized saved
        # asset stable: decoded pixels and its cache identity do not drift.
        full_data = encode_image(
            full, "WEBP", quality=94, method=6, lossless=bool(crest)
        )
        mimetype = "image/webp"
        # Preserve an already smaller source when it needs no resizing/orientation fix.
        # Re-encoding every JPEG can increase size and soften its small rules text.
        if crest:
            image_id = sha256(recipe + full_data).hexdigest()
            existing = db.session.get(CardImage, image_id)
            if existing:
                existing.last_used_at = now_central()
                if commit:
                    db.session.commit()
                return existing
        else:
            with Image.open(BytesIO(data)) as source:
                if (
                    source.size == full.size
                    and source.getexif().get(274, 1) == 1
                    and len(data) <= len(full_data)
                ):
                    full_data = data
                    mimetype = Image.MIME[source.format]
        thumbnail = full.copy()
        thumbnail.thumbnail(
            (336, 240) if crest else (240, 336), Image.Resampling.LANCZOS
        )
        thumbnail_data = encode_image(thumbnail, "WEBP", quality=85, method=6)
        image = CardImage(
            id=image_id,
            full_data=full_data,
            thumbnail_data=thumbnail_data,
            mimetype=mimetype,
            width=full.width,
            height=full.height,
            byte_size=len(full_data),
            thumbnail_byte_size=len(thumbnail_data),
        )

    # Reclaim abandoned previews and replaced artwork after a grace period. Linked
    # artwork is never removed, including assets shared by several printings.
    cutoff = now_central() - timedelta(days=1)
    linked = (
        db.session.query(CardPrinting.id)
        .filter(CardPrinting.image_id == CardImage.id)
        .exists()
    )
    CardImage.query.filter(CardImage.last_used_at < cutoff, ~linked).delete(
        synchronize_session=False
    )
    db.session.add(image)
    if commit:
        db.session.commit()
    return image


def prepare_existing_image(image_id, card_type=None, *, commit=True):
    """Create an unattached derived asset; linked originals remain immutable."""
    if image_id is None:
        raise ValueError("Choose a saved artwork image")
    checked_image_id(image_id)
    image = db.session.get(CardImage, image_id)
    image.last_used_at = now_central()
    if not crest_card_type(card_type):
        if commit:
            db.session.commit()
        return image
    # The normalized lossless bytes form the crest cache key. Checking it
    # avoids even re-encoding artwork when a user saves its card again.
    if (
        image.width * 5 == image.height * 7
        and image.id == sha256(_artwork_recipe(card_type) + image.full_data).hexdigest()
    ):
        if commit:
            db.session.commit()
        return image
    return prepare_image(image.full_data, card_type, commit=commit)


def normalize_image_id(image_id, card_type):
    """Relink crest artwork in the caller's card/printing save transaction."""
    image_id = checked_image_id(image_id)
    if image_id is None or not crest_card_type(card_type):
        return image_id
    return prepare_existing_image(image_id, card_type, commit=False).id


def checked_image_id(value):
    if value is None:
        return None
    if (
        not isinstance(value, str)
        or not db.session.query(CardImage.id).filter_by(id=value).first()
    ):
        raise ValueError(
            "Artwork preview expired. Import the image again before saving."
        )
    return value


def touch_images(*image_ids):
    """Give linked/replaced artwork a grace period for open forms and cached previews."""
    ids = [image_id for image_id in image_ids if image_id]
    if ids:
        CardImage.query.filter(CardImage.id.in_(ids)).update(
            {CardImage.last_used_at: now_central()},
            synchronize_session=False,
        )
