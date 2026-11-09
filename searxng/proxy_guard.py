import os
from searx.webapp import app as _flask_app

PROXY_SECRET = os.environ.get("SEARXNG_PROXY_SECRET", "yesterday_search_cf_worker_auth_2026")

def application(environ, start_response):
    # Pass-through if no secret is configured
    if not PROXY_SECRET:
        return _flask_app(environ, start_response)

    # Health check endpoints for container orchestrators
    path = environ.get("PATH_INFO", "/")
    if path in ("/healthz", "/health"):
        start_response("200 OK", [("Content-Type", "text/plain")])
        return [b"OK"]

    # Verify header HTTP_X_PROXY_SECRET (passed from Cloudflare Worker)
    token = environ.get("HTTP_X_PROXY_SECRET", "")
    if token == PROXY_SECRET:
        return _flask_app(environ, start_response)

    # Direct access: Redirect GET/HEAD requests to official domain
    method = environ.get("REQUEST_METHOD", "GET")
    query = environ.get("QUERY_STRING", "")
    full_path = path + ("?" + query if query else "")

    if method in ("GET", "HEAD"):
        target = f"https://search.yester-day.de{full_path}"
        start_response("302 Found", [
            ("Location", target),
            ("Content-Type", "text/html; charset=utf-8"),
            ("Cache-Control", "no-cache")
        ])
        return [b'<html><head><meta http-equiv="refresh" content="0;url=' + target.encode() + b'"></head><body>Redirecting to <a href="' + target.encode() + b'">search.yester-day.de</a>...</body></html>']

    # For non-GET direct access, return 403 Forbidden
    start_response("403 Forbidden", [("Content-Type", "text/plain; charset=utf-8")])
    return [b"403 Forbidden: Direct access not allowed. Please use https://search.yester-day.de"]

app = application
