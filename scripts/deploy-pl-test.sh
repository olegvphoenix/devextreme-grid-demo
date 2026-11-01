#!/usr/bin/env bash
# Publishes the committed HEAD to PL-Test: http://82.38.66.177:8095/
set -euo pipefail

git archive --format=tar HEAD | ssh PL-Test '
  rm -rf /opt/devextreme-grid-demo &&
  mkdir -p /opt/devextreme-grid-demo &&
  tar -xf - -C /opt/devextreme-grid-demo'

ssh PL-Test '
  cd /opt/devextreme-grid-demo &&
  docker build -t devextreme-grid-demo:latest . &&
  { docker rm -f devextreme-grid-demo 2>/dev/null || true; } &&
  docker run -d --name devextreme-grid-demo --restart unless-stopped \
    --memory=4g --cpus=3 -p 8095:5080 devextreme-grid-demo:latest'
