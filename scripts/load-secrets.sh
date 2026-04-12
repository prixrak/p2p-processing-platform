#!/bin/bash
set -euo pipefail

# Pulls secrets from AWS Secrets Manager and writes .env.prod
# Usage: ./scripts/load-secrets.sh [secret-name] [region]
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Secret created in AWS Secrets Manager as JSON key-value pairs

SECRET_NAME=${1:-"p2p/production"}
REGION=${2:-"eu-central-1"}
OUTPUT_FILE="/opt/p2p/.env.prod"

echo "Loading secrets from AWS Secrets Manager: $SECRET_NAME"

SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --region "$REGION" \
  --query 'SecretString' \
  --output text)

# Convert JSON {"KEY":"VALUE"} to KEY=VALUE format
echo "$SECRET_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for key, value in data.items():
    print(f'{key}={value}')
" > "$OUTPUT_FILE"

chmod 600 "$OUTPUT_FILE"
echo "Secrets written to $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE") variables)"
