# Card artwork

Card details in Card Library and Deck Builder accept an approved public image URL or a
JPEG, PNG, or WebP upload. Import shows a preview; Save attaches it to the card's
primary printing. Add printing can also attach artwork to a new printing.
Removing artwork is a draft change until Save. Failed imports leave the previous
preview intact. Card details and their primary printing save in one transaction.

## Implementation

- `backend/services/image_processing.py` shares upload limits and image encoding
  with the existing card image analyzer. Artwork import does not invoke analysis.
- `backend/services/remote_images.py` downloads bounded public HTTP(S) resources
  from `ALLOWED_IMAGE_HOSTS` (`images.ygoprodeck.com` and
  `tcgplayer-cdn.tcgplayer.com`). Each redirect is
  validated and connections use the validated IP with the original TLS hostname.
  The HTTP client receives a validated path/query target, never the supplied URL.
  Imports do not forward cookies or use environment proxies. Other sources can
  be uploaded as files; review additional hosts before extending the allowlist.
- `backend/services/card_images.py` applies orientation and generates variants
  once. Detail images fit within 1200 × 1680; thumbnails within 240 × 336. Neither
  variant is upscaled. A smaller original can remain the detail image when its
  size and orientation are already suitable. The thumbnail is always WebP.
- `CardImage` stores immutable variants as deferred SQLite BLOB columns. A hash of
  the input and processing recipe identifies an asset. Identical imports reuse it.
  `CardPrinting.image_id` references the asset without loading its bytes.
- `backend/routes/card_images.py` serves individual variants with content types,
  ETags, and immutable cache headers. A conditional request can return 304 without
  reading the BLOB. Card/deck JSON contains only image references.
- `CardArtworkInput` stages the preview in form state. The shared `CardArtwork`
  component uses thumbnails by default and full artwork in detail views, with an
  accessible enlargement dialog. `apiAssetUrl` resolves local paths against the
  backend origin, including during Vite development.

Inputs are limited to 8 MB and 20 megapixels. Animated images are not accepted.
TCGplayer product URLs such as
`https://tcgplayer-cdn.tcgplayer.com/product/708712_in_1000x1000.jpg` work through
the same validation in development and production; no development bypass is needed.
Unlinked assets older than one day are reclaimed on a subsequent new import;
linked artwork is retained. Removal/replacement starts a new grace period for
open previews. An expired unsaved preview must be imported again before saving.

## API and migration

`POST /api/card-images` accepts either multipart `image` or JSON `{ "url": "…" }`
and returns `id`, `image_url`, `thumbnail_url`, dimensions, and byte sizes.
`GET /api/card-images/<id>/full` and `/thumbnail` serve the image bytes.

Card creation and printing updates accept `image_id`; `null` detaches artwork.
The form also clears the legacy `image_url` on removal so old external artwork
does not reappear. Existing external URLs continue to work until replaced.
`PATCH /api/cards/<id>` accepts a nested `printing` object to update card details
and the primary printing atomically.

Application startup creates the image table and adds the nullable printing
reference/index through the existing schema upgrade helper. Existing card and
deck records are preserved. Artwork is included in normal SQLite backups.

## Checks

Run `python -m pytest tests/test_card_images.py -q` and the frontend test, lint,
and build scripts. Coverage includes conversion, orientation, size limits,
deduplication, draft cleanup, atomic saves, image responses, cache validation,
lightweight catalog queries, and remote import validation.
