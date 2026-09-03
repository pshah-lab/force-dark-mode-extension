#!/bin/bash
# package-extension.sh — Creates a clean ZIP for Chrome Web Store submission

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

VERSION=$(node -p "require('./manifest.json').version")
OUTPUT="force-dark-mode-v${VERSION}.zip"

echo "Building release package for Force Dark Mode v${VERSION}..."

# Remove old package if exists
rm -f "$OUTPUT"

# Create clean zip archive
zip -r "$OUTPUT" . \
  -x ".git/*" \
  -x ".gitignore" \
  -x "tests/*" \
  -x "*.zip" \
  -x "*.sh" \
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  -x "CHROMEWEBSTORE.md" \
  -x "new_features.md" \
  -x "security_report.md"

echo ""
echo "========================================="
echo "✅ Packaged successfully: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
echo "========================================="
