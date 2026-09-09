from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request: Request) -> str:
    """Behind the Cloudflare tunnel every request arrives from localhost, so
    keying limits on the socket address would throttle the whole pool as one
    user. Prefer the proxy-supplied client IP."""
    for header in ("CF-Connecting-IP", "X-Forwarded-For"):
        value = request.headers.get(header)
        if value:
            return value.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip)
