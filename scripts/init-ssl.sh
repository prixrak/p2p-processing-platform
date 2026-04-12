#!/bin/bash
set -euo pipefail

# Run this on the server to get initial SSL certificates
# Usage: ./scripts/init-ssl.sh yourdomain.com your@email.com

DOMAIN=${1:?"Usage: $0 <domain> <email>"}
EMAIL=${2:?"Usage: $0 <domain> <email>"}

echo "=== Getting SSL certificate for $DOMAIN ==="

# Create temporary nginx config for ACME challenge
mkdir -p certbot/conf certbot/www

# Stop nginx if running
docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true

# Get certificate
docker run --rm \
  -v "$(pwd)/certbot/conf:/etc/letsencrypt" \
  -v "$(pwd)/certbot/www:/var/www/certbot" \
  -p 80:80 \
  certbot/certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "api.$DOMAIN"

echo "=== SSL certificate obtained ==="
echo "Now update nginx.conf with your domain and run:"
echo "  docker compose -f docker-compose.prod.yml up -d"
