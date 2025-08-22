#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./deploy.sh -r us-east-1 -n offset-cf-api -t 0.1 [-p aws-profile]
#
# Requires: docker, awscli v2 (configured), and Docker Desktop running.

# Load environment variables from .env.local if it exists
if [[ -f ".env.local" ]]; then
    echo "→ Loading environment from .env.local"
    export $(grep -v '^#' .env.local | xargs)
    echo "→ Loaded environment variables:"
    env | grep -E "(AWS_|DB_|ENVIRONMENT)" | sort
    echo ""
else
    echo "→ No .env.local file found, using system environment variables"
fi

# default values if not provided (can be overridden by .env.local)
PROFILE="${AWS_PROFILE:-default}"
AWS_REGION="${AWS_REGION:-us-east-1}"
REPO_NAME="${REPO_NAME:-offset-cf-api}"
IMAGE_TAG="${IMAGE_TAG:-0.1}"

while getopts "p:r:n:t:h" opt; do
  case $opt in
    p) PROFILE="$OPTARG" ;;                     # optional: AWS named profile
    r) AWS_REGION="$OPTARG" ;;                  # e.g., us-west-2
    n) REPO_NAME="$OPTARG" ;;                   # e.g., offset-api
    t) IMAGE_TAG="$OPTARG" ;;                   # e.g., 0.1
    h) echo "Usage: $0 -r <region> -n <repo> -t <tag> [-p <profile>]"; exit 0 ;;
    *) echo "Invalid args"; exit 1 ;;
  esac
done

: "${AWS_REGION:?Missing -r <region>}"
: "${REPO_NAME:?Missing -n <repo>}"
: "${IMAGE_TAG:?Missing -t <tag>}"

# Helpers for optional profile flag
PF=()
[[ -n "${PROFILE}" ]] && PF=(--profile "$PROFILE")

# Sanity checks
command -v aws >/dev/null || { echo "aws not found"; exit 1; }
command -v docker >/dev/null || { echo "docker not found"; exit 1; }

echo "→ Using region: $AWS_REGION"
[[ -n "$PROFILE" ]] && echo "→ Using profile: $PROFILE"

# Get account ID
AWS_ACCOUNT_ID=$(aws "${PF[@]}" sts get-caller-identity --query Account --output text)
ECR_REG="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_URI="${ECR_REG}/${REPO_NAME}"

# Ensure repo exists (idempotent)
echo "→ Ensuring ECR repo ${REPO_NAME} exists..."
aws "${PF[@]}" ecr create-repository --region "$AWS_REGION" \
  --repository-name "$REPO_NAME" \
  --image-scanning-configuration scanOnPush=true >/dev/null 2>&1 || true

# Login Docker to ECR
echo "→ Logging in to ECR..."
aws "${PF[@]}" ecr get-login-password --region "$AWS_REGION" \
| docker login --username AWS --password-stdin "$ECR_REG"

# Ensure buildx is available (for linux/amd64 on Apple Silicon)
docker buildx inspect >/dev/null 2>&1 || docker buildx create --use

# Build, tag, push
echo "→ Building image (linux/amd64)..."
docker buildx build --platform linux/amd64 -t "${REPO_NAME}:${IMAGE_TAG}" .

echo "→ Tagging ${REPO_NAME}:${IMAGE_TAG} as ${ECR_URI}:${IMAGE_TAG}"
docker tag "${REPO_NAME}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"

echo "→ Pushing to ${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:${IMAGE_TAG}"

# Optional: also push :latest if env var is set
if [[ "${PUSH_LATEST:-}" == "1" ]]; then
  echo "→ Tagging and pushing :latest"
  docker tag "${REPO_NAME}:${IMAGE_TAG}" "${ECR_URI}:latest"
  docker push "${ECR_URI}:latest"
fi

echo "✅ Pushed: ${ECR_URI}:${IMAGE_TAG}"
