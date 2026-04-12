#!/bin/bash
set -euo pipefail

# Run this script ONCE on a fresh Ubuntu 22.04+ EC2 instance
# Usage: ssh ubuntu@your-ec2-ip < scripts/setup-server.sh

echo "=== Installing Docker ==="
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu

echo "=== Installing AWS CLI ==="
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
sudo apt-get install -y unzip
unzip -q awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

echo "=== Creating app directory ==="
sudo mkdir -p /opt/p2p
sudo chown ubuntu:ubuntu /opt/p2p

echo "=== Done! ==="
echo ""
echo "Next steps:"
echo "  1. Run: aws configure"
echo "  2. Copy docker-compose.prod.yml and nginx.conf to /opt/p2p/"
echo "  3. Create /opt/p2p/.env.prod with real credentials"
echo "  4. Run: cd /opt/p2p && docker compose -f docker-compose.prod.yml up -d"
