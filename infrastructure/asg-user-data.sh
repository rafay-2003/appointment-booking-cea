
#!/bin/bash
set -euo pipefail

exec > >(tee -a /var/log/bookease-bootstrap.log) 2>&1

echo "Starting BookEase Auto Scaling bootstrap"

REGION="eu-north-1"
REGISTRY="506318770371.dkr.ecr.eu-north-1.amazonaws.com"
TAG="abd82dcf47ac3f2c3004b923d50ef6c046888a8c"

# Install Docker and required tools.
dnf install -y docker curl python3

systemctl enable --now docker

# Install Docker Compose plugin.
mkdir -p /usr/local/lib/docker/cli-plugins

curl -fSL \
  "https://github.com/docker/compose/releases/download/v2.40.2/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose

chmod 755 /usr/local/lib/docker/cli-plugins/docker-compose

# Create protected deployment directory.
install -d -m 700 /opt/bookease

# Retrieve RDS password using the EC2 IAM role.
# Never print the password or connection string.
python3 - <<'PY'
import json
import os
import subprocess
from urllib.parse import quote

result = subprocess.run(
    [
        "aws", "ssm", "get-parameter",
        "--name", "/cea/bookease/db-password",
        "--region", "eu-north-1",
        "--with-decryption",
        "--output", "json"
    ],
    check=True,
    capture_output=True,
    text=True
)

password = json.loads(result.stdout)["Parameter"]["Value"]

url = (
    "postgresql://ceaadmin:"
    + quote(password, safe="")
    + "@cea-postgres.c3o086i82ina.eu-north-1.rds.amazonaws.com"
    + ":5432/appointmentdb?sslmode=require"
)

path = "/opt/bookease/backend.env"
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)

with os.fdopen(fd, "w") as file:
    file.write("DATABASE_URL=" + url + "\n")

os.chmod(path, 0o600)
print("Database configuration prepared securely")
PY

# Create Docker Compose configuration.
cat > /opt/bookease/compose.yaml <<'EOF'
name: bookease

services:
  app:
    image: 506318770371.dkr.ecr.eu-north-1.amazonaws.com/cea-app:${BOOKEASE_TAG}
    restart: unless-stopped
    env_file:
      - /opt/bookease/backend.env
    expose:
      - "5000"
    networks:
      - bookease-network

  web:
    image: 506318770371.dkr.ecr.eu-north-1.amazonaws.com/cea-web:${BOOKEASE_TAG}
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "80:80"
    networks:
      - bookease-network

networks:
  bookease-network:
    driver: bridge
EOF

chmod 600 /opt/bookease/compose.yaml

# Authenticate to the private ECR registry.
aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "$REGISTRY"

# Start the BookEase application.
export BOOKEASE_TAG="$TAG"

docker compose -f /opt/bookease/compose.yaml pull
docker compose -f /opt/bookease/compose.yaml up -d

echo "BookEase bootstrap completed"
