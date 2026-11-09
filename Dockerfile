FROM docker.io/searxng/searxng:latest

LABEL org.opencontainers.image.source="https://github.com/R1tain/yesterday-search"
LABEL org.opencontainers.image.description="Yesterday Search - Custom SearXNG instance optimized for Koyeb and AI"
LABEL org.opencontainers.image.licenses="AGPL-3.0"

USER root

# Copy customized settings
COPY ./searxng /etc/searxng

# Install Proxy Guard middleware to block direct Koyeb access
COPY ./searxng/proxy_guard.py /usr/local/searxng/searx/proxy_guard.py
RUN sed -i 's|searx.webapp:app|searx.proxy_guard:app|g' /usr/local/searxng/entrypoint.sh

# Copy custom Yesterday Search logos and favicons
COPY ./assets/searxng.png /usr/local/searxng/searx/static/themes/simple/img/searxng.png
COPY ./assets/searxng.svg /usr/local/searxng/searx/static/themes/simple/img/searxng.svg
COPY ./assets/favicon.png /usr/local/searxng/searx/static/themes/simple/img/favicon.png
COPY ./assets/favicon.svg /usr/local/searxng/searx/static/themes/simple/img/favicon.svg

# Ensure correct permissions
RUN chown -R searxng:searxng /etc/searxng && \
    chmod -R 755 /etc/searxng && \
    chmod 644 /usr/local/searxng/searx/static/themes/simple/img/searxng.* && \
    chmod 644 /usr/local/searxng/searx/static/themes/simple/img/favicon.*

USER searxng

# Internal port for Koyeb (HTTP 8080)
EXPOSE 8080
