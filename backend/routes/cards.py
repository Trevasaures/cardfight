from flask import Blueprint, current_app, jsonify, request
from openai import APIError, AuthenticationError, RateLimitError

from backend.errors import (
    NotFoundError,
    ValidationError,
    error_response,
    json_object,
    rollback_session,
)
from backend.services.cards import (
    DuplicateCardNameError,
    DuplicateCardPrintingError,
    add_card_printing,
    create_card,
    get_card_form_options,
    get_card_or_raise,
    list_cards_page,
    search_cards,
    update_card,
    update_card_printing,
)
from backend.services.serializers import (
    serialize_card,
    serialize_card_printing,
    serialize_cards,
)
from backend.services.card_image_analyzer import analyze_card_image
from backend.services.card_set_names import (
    CardSetInUseError,
    DuplicateCardSetError,
    delete_custom_set,
    list_custom_sets,
    save_custom_set,
    update_custom_set,
)


bp_cards = Blueprint("cards", __name__, url_prefix="/api/cards")


@bp_cards.errorhandler(DuplicateCardNameError)
@bp_cards.errorhandler(DuplicateCardPrintingError)
def duplicate_card_error(error):
    # Roll back first so the suggested existing card reflects saved data,
    # even if a caller had changed part of a printing before finding a conflict.
    rollback_session()
    return error_response(
        error.message,
        409,
        duplicate_card=serialize_card(error.card, include_printings=True),
    )


@bp_cards.get("/options")
def card_form_options_route():
    return jsonify(get_card_form_options())


@bp_cards.post("/sets")
def create_card_set_route():
    try:
        card_set, created = save_custom_set(json_object())
    except DuplicateCardSetError:
        return error_response("Card set already exists.", 409)
    except ValidationError:
        return error_response("Invalid card set data.", 400)

    return jsonify(card_set), 201 if created else 200


@bp_cards.get("/sets")
def list_card_sets_route():
    return jsonify(list_custom_sets())


@bp_cards.patch("/sets/<string:set_code>")
def update_card_set_route(set_code):
    try:
        card_set = update_custom_set(
            set_code,
            json_object(),
        )
    except DuplicateCardSetError:
        return error_response("Card set already exists.", 409)
    except NotFoundError:
        return error_response("Card set not found.", 404)
    except ValidationError:
        return error_response("Invalid card set data.", 400)

    return jsonify(card_set)


@bp_cards.delete("/sets/<string:set_code>")
def delete_card_set_route(set_code):
    try:
        delete_custom_set(set_code)
    except CardSetInUseError as exc:
        return error_response("Card set is in use.", 409, usage_count=exc.usage_count)
    except NotFoundError:
        return error_response("Card set not found.", 404)

    return ("", 204)


@bp_cards.get("")
@bp_cards.get("/")
@bp_cards.get("/search")
def search_cards_route():
    cards = search_cards(
        q=request.args.get("q"),
        nation=request.args.get("nation"),
        grade=request.args.get("grade"),
        card_type=request.args.get("card_type"),
        set_code=request.args.get("set_code"),
        limit=request.args.get("limit", 50),
    )

    return jsonify([serialize_card(card, include_printings=True) for card in cards])


@bp_cards.post("")
@bp_cards.post("/")
def create_card_route():
    card = create_card(json_object())

    return jsonify(serialize_card(card)), 201


@bp_cards.get("/library")
def card_library_route():
    try:
        result = list_cards_page(
            q=request.args.get("q"),
            nation=request.args.get("nation"),
            grade=request.args.get("grade"),
            card_type=request.args.get("card_type"),
            set_code=request.args.get("set_code"),
            page=request.args.get("page", 1),
            page_size=request.args.get("page_size", 24),
            sort=request.args.get("sort", "name_asc"),
        )
    except ValidationError:
        return error_response("Invalid card library filters or sort order.", 400)

    return jsonify(
        {
            "items": serialize_cards(result["items"]),
            "pagination": result["pagination"],
        }
    )


@bp_cards.get("/<int:card_id>")
def get_card_route(card_id):
    card = get_card_or_raise(card_id)

    return jsonify(serialize_card(card))


@bp_cards.patch("/<int:card_id>")
def update_card_route(card_id):
    card = update_card(card_id, json_object())

    return jsonify(serialize_card(card))


@bp_cards.post("/<int:card_id>/printings")
def add_card_printing_route(card_id):
    printing = add_card_printing(card_id, json_object())

    return jsonify(serialize_card_printing(printing)), 201


@bp_cards.patch("/printings/<int:printing_id>")
def update_card_printing_route(printing_id):
    printing = update_card_printing(printing_id, json_object())

    return jsonify(serialize_card_printing(printing))


@bp_cards.post("/analyze-image")
def analyze_card_image_route():
    try:
        result = analyze_card_image(request.files.get("image"))
    except AuthenticationError:
        current_app.logger.exception("Card image analysis authentication failed")
        return error_response(
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
            return error_response(
                (
                    "OpenAI says this project has insufficient quota. "
                    "If you just added credits, wait a few minutes, confirm the credits "
                    "are attached to the same project as this API key, then try again."
                ),
                429,
            )

        return error_response(
            (
                "OpenAI rate limit reached. Wait a minute, then try again. "
                "Avoid clicking Analyze repeatedly while a request is already running."
            ),
            429,
        )
    except APIError:
        current_app.logger.exception("Card image analysis API failed")
        return error_response(
            "Card image analysis provider is unavailable. Try again later.", 502
        )

    return jsonify(result)
