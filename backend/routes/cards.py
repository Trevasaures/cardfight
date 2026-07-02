from flask import Blueprint, current_app, jsonify, request
from openai import APIError, AuthenticationError, RateLimitError

from backend.services.cards import (
    DuplicateCardPrintingError,
    add_card_printing,
    create_card,
    get_card_or_raise,
    list_cards_page,
    search_cards,
    update_card,
    update_card_printing,
)
from backend.services.serializers import serialize_card, serialize_card_printing
from backend.services.card_image_analyzer import analyze_card_image


bp_cards = Blueprint("cards", __name__, url_prefix="/api/cards")


def _json_error(message, status_code):
    return jsonify({"error": message}), status_code


@bp_cards.get("")
@bp_cards.get("/")
@bp_cards.get("/search")
def search_cards_route():
    cards = search_cards(
        q=request.args.get("q"),
        nation=request.args.get("nation"),
        grade=request.args.get("grade"),
        card_type=request.args.get("card_type"),
        limit=request.args.get("limit", 50),
    )

    return jsonify([serialize_card(card, include_printings=True) for card in cards])


@bp_cards.post("")
@bp_cards.post("/")
def create_card_route():
    try:
        card = create_card(request.get_json(silent=True) or {})
    except DuplicateCardPrintingError as exc:
        return jsonify(
            {
                "error": str(exc),
                "duplicate_card": serialize_card(exc.card, include_printings=True),
            }
        ), 409
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card(card)), 201


@bp_cards.get("/library")
def card_library_route():
    result = list_cards_page(
        q=request.args.get("q"),
        nation=request.args.get("nation"),
        grade=request.args.get("grade"),
        card_type=request.args.get("card_type"),
        page=request.args.get("page", 1),
        page_size=request.args.get("page_size", 250),
    )

    return jsonify(
        {
            "items": [
                serialize_card(card, include_printings=True)
                for card in result["items"]
            ],
            "pagination": result["pagination"],
        }
    )


@bp_cards.get("/<int:card_id>")
def get_card_route(card_id):
    try:
        card = get_card_or_raise(card_id)
    except LookupError as exc:
        return _json_error(str(exc), 404)

    return jsonify(serialize_card(card))


@bp_cards.patch("/<int:card_id>")
def update_card_route(card_id):
    try:
        card = update_card(card_id, request.get_json(silent=True) or {})
    except DuplicateCardPrintingError as exc:
        return jsonify(
            {
                "error": str(exc),
                "duplicate_card": serialize_card(exc.card, include_printings=True),
            }
        ), 409
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card(card))


@bp_cards.post("/<int:card_id>/printings")
def add_card_printing_route(card_id):
    try:
        printing = add_card_printing(card_id, request.get_json(silent=True) or {})
    except DuplicateCardPrintingError as exc:
        return jsonify(
            {
                "error": str(exc),
                "duplicate_card": serialize_card(exc.card, include_printings=True),
            }
        ), 409
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card_printing(printing)), 201


@bp_cards.patch("/printings/<int:printing_id>")
def update_card_printing_route(printing_id):
    try:
        printing = update_card_printing(printing_id, request.get_json(silent=True) or {})
    except DuplicateCardPrintingError as exc:
        return jsonify(
            {
                "error": str(exc),
                "duplicate_card": serialize_card(exc.card, include_printings=True),
            }
        ), 409
    except LookupError as exc:
        return _json_error(str(exc), 404)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    return jsonify(serialize_card_printing(printing))


@bp_cards.post("/analyze-image")
def analyze_card_image_route():
    try:
        result = analyze_card_image(request.files.get("image"))
    except ValueError as exc:
        return _json_error(str(exc), 400)
    except AuthenticationError:
        current_app.logger.exception("Card image analysis authentication failed")
        return _json_error(
            "OpenAI authentication failed. Check OPENAI_API_KEY in your .env file.",
            401,
        )
    except RateLimitError as exc:
        current_app.logger.exception("Card image analysis quota/rate limit failed")

        error_code = None
        try:
            error_code = exc.body.get("code") if isinstance(exc.body, dict) else None
        except AttributeError:
            error_code = None

        if error_code == "insufficient_quota":
            return _json_error(
                (
                    "OpenAI says this project has insufficient quota. "
                    "If you just added credits, wait a few minutes, confirm the credits "
                    "are attached to the same project as this API key, then try again."
                ),
                429,
            )

        return _json_error(
            (
                "OpenAI rate limit reached. Wait a minute, then try again. "
                "Avoid clicking Analyze repeatedly while a request is already running."
            ),
            429,
        )
    except APIError as exc:
        current_app.logger.exception("Card image analysis API failed")
        return _json_error(f"OpenAI API error: {exc}", 502)
    except Exception as exc:
        current_app.logger.exception("Card image analysis failed")
        return _json_error(f"Card image analysis failed: {exc}", 500)

    return jsonify(result)