from flask import Blueprint, Response, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from backend.database import db
from backend.models import CardImage
from backend.services.card_images import prepare_image, serialize_image
from backend.services.image_processing import MAX_IMAGE_BYTES, read_image_upload
from backend.services.remote_images import download_image

bp_card_images = Blueprint("card_images", __name__, url_prefix="/api/card-images")


@bp_card_images.post("")
def import_image():
    # Includes a little room for multipart headers; the file itself has an 8 MB cap.
    request.max_content_length = MAX_IMAGE_BYTES + 64 * 1024
    try:
        if request.is_json:
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                raise ValueError("Enter an image URL or upload a file.")
            data = download_image(payload.get("url"))
        else:
            data = read_image_upload(request.files.get("image"))
        image = prepare_image(data)
    except RequestEntityTooLarge:
        return jsonify(error="Image file is too large. Maximum size is 8 MB."), 413
    except ValueError:
        return jsonify(error="Invalid image input."), 400
    return jsonify(serialize_image(image)), 201


@bp_card_images.get("/<string:image_id>/<string:variant>")
def get_image(image_id, variant):
    if variant not in {"full", "thumbnail"}:
        return jsonify(error="Image not found."), 404
    image = db.session.get(CardImage, image_id)
    if image is None:
        return jsonify(error="Image not found."), 404
    etag = f"{image.id}-{variant}"
    # Immutable hash URLs change on replacement. Conditional requests need only
    # metadata, avoiding a BLOB read when the browser already has this artwork.
    if request.if_none_match.contains_weak(etag) or request.if_none_match.star_tag:
        response = Response(status=304)
    else:
        thumbnail = variant == "thumbnail"
        response = Response(
            image.thumbnail_data if thumbnail else image.full_data,
            mimetype="image/webp" if thumbnail else image.mimetype,
        )
    response.set_etag(etag)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
