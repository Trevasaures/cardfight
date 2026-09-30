"""Bounded downloads from public image URLs, without proxy or cookie forwarding."""

import ipaddress
import socket
from time import monotonic
from urllib.parse import urljoin, urlsplit

import urllib3

from backend.services.image_processing import MAX_IMAGE_BYTES, validate_image_size


ALLOWED_IMAGE_HOSTS = {
    "images.ygoprodeck.com",
}


def _public_destination(url):
    if not isinstance(url, str) or len(url) > 2048:
        raise ValueError("Enter a public HTTP or HTTPS image URL.")
    try:
        parts = urlsplit(url)
        port = parts.port or (443 if parts.scheme == "https" else 80)
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username is not None
            or parts.password is not None
            or port != (443 if parts.scheme == "https" else 80)
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


def download_image(url: str) -> bytes:
    deadline = monotonic() + 20
    for _ in range(4):
        parts, hostname, port, address = _public_destination(url)
        # Connect to the validated address, while keeping the original TLS name.
        # This avoids resolving the hostname again after the public-address check.
        pool = (
            urllib3.HTTPSConnectionPool(
                address, port=port, server_hostname=hostname, assert_hostname=hostname
            )
            if parts.scheme == "https"
            else urllib3.HTTPConnectionPool(address, port=port)
        )
        path = parts.path or "/"
        if parts.query:
            path += "?" + parts.query
        response = None
        try:
            if monotonic() >= deadline:
                raise ValueError("Image download timed out. Upload the file instead.")
            response = pool.request(
                "GET",
                path,
                headers={
                    "Host": hostname,
                    "Accept": "image/*",
                    "User-Agent": "CardfightLab/1.0",
                },
                redirect=False,
                retries=False,
                preload_content=False,
                timeout=urllib3.Timeout(connect=3, read=5),
            )
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location:
                    raise ValueError("Image URL redirected without a destination.")
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
