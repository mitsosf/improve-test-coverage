#!/bin/bash
set -e

ACTION=$1
REPO_URL=$2
BRANCH=$3

# Detect package manager
detect_pm() {
  if [ -f pnpm-lock.yaml ]; then echo "pnpm"
  elif [ -f yarn.lock ]; then echo "yarn"
  else echo "npm"
  fi
}

# Check if package.json has a build script
has_build_script() {
  grep -q '"build"' package.json 2>/dev/null
}

# Check if package.json has a test script
has_test_script() {
  grep -q '"test"' package.json 2>/dev/null
}

run_with_pm() {
  local PM=$(detect_pm)
  local EXIT_CODE=0

  echo "[sandbox] Using package manager: $PM"

  # Install dependencies (ignore scripts for security)
  echo "[sandbox] Installing dependencies..."
  $PM install --ignore-scripts || true

  # Build if script exists
  if has_build_script; then
    echo "[sandbox] Running build..."
    $PM run build || true
  fi

  # Run tests with coverage
  if has_test_script; then
    echo "[sandbox] Running tests with coverage..."
    # Ensure we get JSON format coverage output
    COVERAGE_FLAGS="--coverage --coverageReporters=json --coverageReporters=text --passWithNoTests --forceExit"
    $PM test -- $COVERAGE_FLAGS "$@" || EXIT_CODE=$?
  else
    echo "[sandbox] No test script found"
    EXIT_CODE=1
  fi

  return $EXIT_CODE
}

case $ACTION in
  analyze)
    echo "[sandbox] Cloning repository: $REPO_URL (branch: $BRANCH)"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /workspace/repo 2>&1
    cd /workspace/repo

    echo "[sandbox] Starting analysis..."
    run_with_pm || true

    # Copy coverage output
    if [ -d coverage ]; then
      echo "[sandbox] Copying coverage data..."
      cp -r coverage /output/
    else
      echo "[sandbox] No coverage directory found"
    fi

    # Copy source files for AI context (TypeScript files, excluding tests and node_modules)
    echo "[sandbox] Extracting source files..."
    find . -name "*.ts" \
      -not -path "*/node_modules/*" \
      -not -path "*/.git/*" \
      -not -path "*/dist/*" \
      -not -path "*/build/*" \
      -not -name "*.test.ts" \
      -not -name "*.spec.ts" \
      -not -name "*.d.ts" \
      | head -200 > /tmp/source_files.txt

    if [ -s /tmp/source_files.txt ]; then
      tar -cf /output/sources.tar -T /tmp/source_files.txt 2>/dev/null || echo "[sandbox] Warning: Could not create source archive"
    fi

    echo "[sandbox] Analysis complete"
    ;;

  test)
    echo "[sandbox] Cloning repository: $REPO_URL (branch: $BRANCH)"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /workspace/repo 2>&1
    cd /workspace/repo

    # Copy test files from input volume
    if [ -d /input ] && [ "$(ls -A /input 2>/dev/null)" ]; then
      echo "[sandbox] Copying test files from input..."
      cp -r /input/* . 2>/dev/null || true
    fi

    echo "[sandbox] Running tests..."
    if run_with_pm; then
      echo "[sandbox] Tests passed"
      echo "TESTS_PASSED=true" > /output/result.txt
    else
      echo "[sandbox] Tests failed"
      echo "TESTS_PASSED=false" > /output/result.txt
    fi

    # Copy coverage output
    if [ -d coverage ]; then
      echo "[sandbox] Copying coverage data..."
      cp -r coverage /output/
    fi

    echo "[sandbox] Test run complete"
    ;;

  *)
    echo "Usage: $0 {analyze|test} <repo_url> <branch>"
    exit 1
    ;;
esac
