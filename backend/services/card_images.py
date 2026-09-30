"""Prepare artwork once, then keep normal catalog requests free of image bytes."""

from datetime import timedelta
from hashlib import sha256
from io import BytesIO

from PIL import Image

from backend.database import db
from backend.models import CardImage, CardPrinting, now_central
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


def prepare_image(data):
    """An import is a draft until a card save links it; identical input reuses bytes."""
    # Include the processing recipe so future encoding changes get fresh cache URLs.
    image_id = sha256(b"cardfight-artwork-v1\0" + data).hexdigest()
    existing = db.session.get(CardImage, image_id)
    if existing:
        existing.last_used_at = now_central()
        db.session.commit()
        return existing

    with decode_image(data) as original:
        full = original.copy()
        full.thumbnail((1200, 1680), Image.Resampling.LANCZOS)
        full_data = encode_image(full, "WEBP", quality=94, method=6)
        mimetype = "image/webp"
        # Preserve an already smaller source when it needs no resizing/orientation fix.
        # Re-encoding every JPEG can increase size and soften its small rules text.
        with Image.open(BytesIO(data)) as source:
            if (
                source.size == full.size
                and source.getexif().get(274, 1) == 1
                and len(data) <= len(full_data)
            ):
                full_data = data
                mimetype = Image.MIME[source.format]
        thumbnail = full.copy()
        thumbnail.thumbnail((240, 336), Image.Resampling.LANCZOS)
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
    db.session.commit()
    return image


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
