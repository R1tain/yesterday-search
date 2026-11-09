FROM docker.io/searxng/searxng:latest

LABEL org.opencontainers.image.source="https://github.com/R1tain/yesterday-search"
LABEL org.opencontainers.image.description="Yesterday Search - Custom SearXNG instance optimized for Koyeb and AI"
LABEL org.opencontainers.image.licenses="AGPL-3.0"

USER root

# Copy customized settings
COPY ./searxng /etc/searxng

# Ensure correct permissions
RUN chown -R searxng:searxng /etc/searxng && \
    chmod -R 755 /etc/searxng

USER searxng

# Internal port for Koyeb (HTTP 8080)
EXPOSE 8080
