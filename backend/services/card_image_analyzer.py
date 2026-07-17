import base64
import json
import os
import re
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from backend.services.card_set_names import lookup_set_name

MAX_IMAGE_BYTES = 8 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

RARITY_VALUES = {
    "C",
    "R",
    "RR",
    "RRR",
    "ORRR",
    "FR",
    "FFR",
    "SEC",
    "SP",
    "DSR",
    "LSR",
}


def _empty_fields():
    return {
        "name": "",
        "grade": "",
        "nation": "",
        "card_type": "",
        "set_code": "",
        "set_name": "",
        "card_number": "",
        "rarity": "",
    }


def _empty_confidence():
    return {
        "name": 0,
        "grade": 0,
        "nation": 0,
        "card_type": 0,
        "set_code": 0,
        "set_name": 0,
        "card_number": 0,
        "rarity": 0,
    }


def _to_data_url(image_bytes: bytes, mimetype: str):
    encoded_image = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mimetype};base64,{encoded_image}"


def _make_bottom_crop_bytes(image_bytes: bytes):
    """
    Creates an enlarged crop of the bottom area of the card.

    This is where Vanguard cards usually keep:
    - set code
    - card number
    - rarity
    - copyright/year line
    - power/nameplate area
    """
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image = image.convert("RGB")

            width, height = image.size

            # Bottom 32% gives the model the nameplate + tiny footer text.
            crop_top = int(height * 0.68)
            bottom_crop = image.crop((0, crop_top, width, height))

            crop_width, crop_height = bottom_crop.size
            scale = 4

            enlarged = bottom_crop.resize(
                (crop_width * scale, crop_height * scale),
                Image.Resampling.LANCZOS,
            )

            output = BytesIO()
            enlarged.save(output, format="JPEG", quality=95)
            return output.getvalue()
    except UnidentifiedImageError:
        return None


def _clean_text(value):
    return str(value or "").strip()


def _normalize_set_code(value):
    return _clean_text(value).upper()


def _normalize_card_number(value):
    return _clean_text(value).upper()


def _normalize_rarity(value):
    rarity = _clean_text(value).upper()

    # Sometimes models may return "Triple Rare" even though we ask for "RRR".
    rarity_aliases = {
        "COMMON": "C",
        "RARE": "R",
        "DOUBLE RARE": "RR",
        "TRIPLE RARE": "RRR",
        "OVER RARE": "ORRR",
        "FRAME RARE": "FR",
        "FRAMED RARE": "FR",
        "DOUBLE FRAME RARE": "FFR",
        "SPECIAL": "SP",
        "SECRET": "SEC",
    }

    rarity = rarity_aliases.get(rarity, rarity)

    if rarity in RARITY_VALUES:
        return rarity

    return rarity


def _apply_local_set_name(fields: dict, confidence: dict, warnings: list[str]):
    fields["set_code"] = _normalize_set_code(fields.get("set_code"))
    fields["card_number"] = _normalize_card_number(fields.get("card_number"))
    fields["rarity"] = _normalize_rarity(fields.get("rarity"))

    if fields.get("set_name"):
        return

    mapped_set_name = lookup_set_name(fields.get("set_code"))

    if not mapped_set_name:
        return

    fields["set_name"] = mapped_set_name
    confidence["set_name"] = max(int(confidence.get("set_name") or 0), 100)
    warnings.append(
        f"Set name filled from local set code catalog for {fields['set_code']}."
    )


def _normalize_result(result: dict, provider: str):
    fields = _empty_fields()
    confidence = _empty_confidence()

    result_fields = result.get("fields") or {}
    result_confidence = result.get("confidence") or {}

    for key in fields:
        fields[key] = _clean_text(result_fields.get(key))

    fields["set_code"] = _normalize_set_code(fields["set_code"])
    fields["card_number"] = _normalize_card_number(fields["card_number"])
    fields["rarity"] = _normalize_rarity(fields["rarity"])

    for key in confidence:
        try:
            value = int(result_confidence.get(key) or 0)
        except (TypeError, ValueError):
            value = 0

        confidence[key] = max(0, min(100, value))

    warnings = result.get("warnings") or []

    if not isinstance(warnings, list):
        warnings = [str(warnings)]

    warnings = [str(warning) for warning in warnings]

    _apply_local_set_name(fields, confidence, warnings)

    return {
        "provider": provider,
        "fields": fields,
        "confidence": confidence,
        "warnings": warnings,
        "raw_text": result.get("raw_text"),
    }


def _infer_from_filename(filename: str):
    fields = _empty_fields()
    confidence = _empty_confidence()
    warnings = [
        "Mock analyzer result. Review every field before saving.",
        "Real image analysis is disabled while CARD_IMAGE_ANALYZER_PROVIDER=mock.",
    ]

    safe_name = secure_filename(filename or "")
    stem = Path(safe_name).stem
    readable = re.sub(r"[_-]+", " ", stem).strip()

    if readable:
        fields["name"] = readable.title()
        confidence["name"] = 35

    lower = readable.lower()

    nation_map = {
        "dragon empire": "Dragon Empire",
        "dark states": "Dark States",
        "brandt gate": "Brandt Gate",
        "keter sanctuary": "Keter Sanctuary",
        "stoicheia": "Stoicheia",
    }

    for needle, nation in nation_map.items():
        if needle in lower:
            fields["nation"] = nation
            confidence["nation"] = 55
            break

    grade_match = re.search(r"(?:grade|g)[\s_-]*([0-4])", lower)
    if grade_match:
        fields["grade"] = grade_match.group(1)
        confidence["grade"] = 50

    set_code_match = re.search(
        r"\b(?:d|dz|bt|ss|pr|v|g)[a-z0-9-]*\d{1,3}\b",
        readable,
        re.IGNORECASE,
    )
    if set_code_match:
        fields["set_code"] = set_code_match.group(0).upper()
        confidence["set_code"] = 45

    rarity_match = re.search(
        r"\b(?:c|r|rr|rrr|orrr|sec|ffr|fr|sr|sp|dsr|lsr)\b",
        readable,
        re.IGNORECASE,
    )
    if rarity_match:
        fields["rarity"] = rarity_match.group(0).upper()
        confidence["rarity"] = 45

    fields["card_type"] = "Normal Unit"
    confidence["card_type"] = 25

    return _normalize_result(
        {
            "fields": fields,
            "confidence": confidence,
            "warnings": warnings,
            "raw_text": None,
        },
        "mock",
    )


CARD_IMAGE_ANALYSIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["fields", "confidence", "warnings"],
    "properties": {
        "fields": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "name",
                "grade",
                "nation",
                "card_type",
                "set_code",
                "set_name",
                "card_number",
                "rarity",
            ],
            "properties": {
                "name": {"type": "string"},
                "grade": {"type": "string"},
                "nation": {"type": "string"},
                "card_type": {"type": "string"},
                "set_code": {"type": "string"},
                "set_name": {"type": "string"},
                "card_number": {"type": "string"},
                "rarity": {"type": "string"},
            },
        },
        "confidence": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "name",
                "grade",
                "nation",
                "card_type",
                "set_code",
                "set_name",
                "card_number",
                "rarity",
            ],
            "properties": {
                "name": {"type": "integer"},
                "grade": {"type": "integer"},
                "nation": {"type": "integer"},
                "card_type": {"type": "integer"},
                "set_code": {"type": "integer"},
                "set_name": {"type": "integer"},
                "card_number": {"type": "integer"},
                "rarity": {"type": "integer"},
            },
        },
        "warnings": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
}


def _build_openai_content(image_bytes: bytes, mimetype: str):
    image_url = _to_data_url(image_bytes, mimetype)

    content = [
        {
            "type": "input_text",
            "text": """
You are extracting metadata from a Cardfight!! Vanguard card image.

Return only the fields requested by the schema.

Important:
- If a field is not clearly visible, return an empty string for that field.
- Do not guess set_name unless it is visible in the image.
- The backend may fill set_name later from a trusted local set-code catalog.
- The grade is usually in the top-left circle.
- The card name is usually in the lower nameplate.
- Nation may be shown by text, icon, or card frame. If uncertain, leave it blank.
- Use confidence from 0 to 100 for each field.
- Add warnings for fields that were hard to read.
- Conservative extraction is better than confident guessing.

Card type guidance:
- Most unit cards are "Normal Unit" unless a trigger icon/type is clearly visible.
- Cards printed as G units should use "G Unit".
- If the card is an order, return the printed order type if visible.
- If uncertain, use "Normal Unit" with low or medium confidence.

Set and card number guidance:
- The set code, card number, rarity, copyright, and year are usually in the tiny bottom strip.
- Prefer the full printed collector number if visible, such as DZ-BT02/004EN.
- If only part of the card number is readable, return the visible part and add a warning.
- set_code should be the product/set prefix only, such as DZ-BT02.
- card_number should be the collector number portion visible on the card, such as 004EN or DZ-BT02/004EN depending on what is printed.

Rarity guidance:
- Rarity is usually a short abbreviation near the bottom of the card.
- Return the abbreviation only, such as C, R, RR, RRR, ORRR, FR, FFR, SEC, SP, DSR, or LSR.
- Do not expand rarity into words like "Triple Rare"; return "RRR".
- If rarity is too small or unclear, return an empty string and add a warning.
""".strip(),
        },
        {
            "type": "input_text",
            "text": "Full card image. Use this for name, grade, nation, and card type.",
        },
        {
            "type": "input_image",
            "image_url": image_url,
            "detail": "high",
        },
    ]

    bottom_crop_bytes = _make_bottom_crop_bytes(image_bytes)

    if bottom_crop_bytes:
        bottom_crop_image_url = _to_data_url(bottom_crop_bytes, "image/jpeg")

        content.extend(
            [
                {
                    "type": "input_text",
                    "text": (
                        "Enlarged bottom crop. Use this specifically for set code, "
                        "card number, rarity, copyright, and year. Prefer this crop "
                        "over the full image for tiny footer text."
                    ),
                },
                {
                    "type": "input_image",
                    "image_url": bottom_crop_image_url,
                    "detail": "high",
                },
            ]
        )

    return content


def _analyze_with_openai(image_bytes: bytes, mimetype: str):
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ValueError(
            "OpenAI SDK is not installed. Run: pip install openai"
        ) from exc

    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        raise ValueError("OPENAI_API_KEY is not set.")

    model = os.getenv("CARD_IMAGE_ANALYZER_MODEL", "gpt-5.5-2026-04-23")
    client = OpenAI(api_key=api_key, timeout=60.0)

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "user",
                "content": _build_openai_content(image_bytes, mimetype),
            }
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "card_image_analysis",
                "schema": CARD_IMAGE_ANALYSIS_SCHEMA,
                "strict": True,
            }
        },
    )

    raw_text = response.output_text
    parsed = json.loads(raw_text)
    parsed["raw_text"] = raw_text

    normalized = _normalize_result(parsed, "openai")

    normalized["warnings"].insert(
        0,
        "AI analyzer result. Review every field before saving.",
    )

    return normalized


def analyze_card_image(image_file: FileStorage | None):
    if image_file is None:
        raise ValueError("image file is required.")

    if not image_file.filename:
        raise ValueError("image filename is required.")

    content_type = image_file.mimetype or ""

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("image must be a PNG, JPG, JPEG, or WEBP file.")

    image_bytes = image_file.read(MAX_IMAGE_BYTES + 1)

    if not image_bytes:
        raise ValueError("image file is empty.")

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise ValueError("image file is too large. Maximum size is 8 MB.")

    provider = os.getenv("CARD_IMAGE_ANALYZER_PROVIDER", "mock").strip().lower()

    print(
        "[card-image-analyzer]",
        f"provider={provider}",
        f"model={os.getenv('CARD_IMAGE_ANALYZER_MODEL')}",
        f"key_set={bool(os.getenv('OPENAI_API_KEY'))}",
        flush=True,
    )

    if provider == "mock":
        return _infer_from_filename(image_file.filename)

    if provider == "openai":
        return _analyze_with_openai(image_bytes, content_type)

    raise ValueError(f"Unsupported card image analyzer provider: {provider}")
