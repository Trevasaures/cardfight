"""Bounded downloads from public image URLs, without proxy or cookie forwarding."""

import ipaddress
import re
import socket
from time import monotonic
from urllib.parse import quote, urljoin, urlsplit

import urllib3

from backend.services.image_processing import MAX_IMAGE_BYTES, validate_image_size


ALLOWED_IMAGE_HOSTS = {
    "images.ygoprodeck.com",
    "tcgplayer-cdn.tcgplayer.com",
}


def _validate_url_text(url):
    # urlsplit silently removes some control characters. Reject ambiguous input
    # before parsing, including redirect locations, rather than normalizing it.
    if (
        not isinstance(url, str)
        or not url
        or len(url) > 2048
        or re.search(r"[\x00-\x20\x7f\\]", url)
    ):
        raise ValueError("Enter a public HTTP or HTTPS image URL.")


def _public_destination(url):
    _validate_url_text(url)
    try:
        parts = urlsplit(url)
        default_port = 443 if parts.scheme == "https" else 80
        port = parts.port if parts.port is not None else default_port
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username is not None
            or parts.password is not None
            or port != default_port
        ):
            raise ValueError
        hostname = parts.hostname.encode("idna").decode("ascii")
        if hostname not in ALLOWED_IMAGE_HOSTS:
            raise ValueError
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        ips = [ipaddress.ip_address(entry[4][0]) for entry in addresses]
        if not ips or any(not ip.is_global or ip.is_multicast for ip in ips):
            raise ValueError
    except (ValueError, UnicodeError, OSError) as exc:
        raise ValueError("Use a public image URL, or upload the image file.") from exc
    return parts, hostname, port, str(ips[0])


def _request_target(parts):
    """Build an origin-form target; the validated pool owns the destination."""
    path = quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~")
    query = quote(parts.query, safe="/?%:@!$&'()*+,;=-._~")
    target = path + ("?" + query if query else "")
    # Only one leading slash: no absolute URL, network-path authority, backslash,
    # whitespace, or request-line controls can reach the HTTP client's URL slot.
    if not re.fullmatch(r"/(?!/)[A-Za-z0-9/%.~_!$&'()*+,;=:@?\-]*", target):
        raise ValueError("Use a direct image URL, or upload the image file.")
    return target


def download_image(url: str) -> bytes:
    deadline = monotonic() + 20
    for _ in range(4):
        parts, hostname, port, address = _public_destination(url)
        target = _request_target(parts)
        # Connect to the validated address, while keeping the original TLS name.
        # This avoids resolving the hostname again after the public-address check.
        pool = (
            urllib3.HTTPSConnectionPool(
                address, port=port, server_hostname=hostname, assert_hostname=hostname
            )
            if parts.scheme == "https"
            else urllib3.HTTPConnectionPool(address, port=port)
        )
        response = None
        try:
            if monotonic() >= deadline:
                raise ValueError("Image download timed out. Upload the file instead.")
            response = pool.request(
                "GET",
                target,
                headers={
                    "Host": hostname,
                    "Accept": "image/*",
                    "User-Agent": "CardfightLab/1.0",
                },
                redirect=False,
                assert_same_host=True,
                retries=False,
                preload_content=False,
                timeout=urllib3.Timeout(connect=3, read=5),
            )
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location:
                    raise ValueError("Image URL redirected without a destination.")
                _validate_url_text(location)
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ValueError(
                    "Could not download this image. Upload the file instead."
                )
            length = response.headers.get("Content-Length")
            if length and int(length) > MAX_IMAGE_BYTES:
                raise ValueError("Image file is too large. Maximum size is 8 MB.")
            chunks = bytearray()
            for chunk in response.stream(16 * 1024, decode_content=True):
                chunks.extend(chunk)
                if len(chunks) > MAX_IMAGE_BYTES:
                    raise ValueError("Image file is too large. Maximum size is 8 MB.")
                if monotonic() >= deadline:
                    raise ValueError(
                        "Image download timed out. Upload the file instead."
                    )
            data = bytes(chunks)
            validate_image_size(data)
            return data
        except (urllib3.exceptions.HTTPError, OSError) as exc:
            raise ValueError(
                "Could not download this image. Upload the file instead."
            ) from exc
        finally:
            if response is not None:
                response.close()
            pool.close()
    raise ValueError("Image URL redirected too many times. Upload the file instead.")
