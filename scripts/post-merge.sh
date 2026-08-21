#!/bin/bash
set -e

# Install deps without requiring a frozen lockfile — task agents may add packages
pnpm install

# Rebuild shared packages so type-checked imports resolve
pnpm exec tsc -b lib/db lib/api-zod 2>/dev/null || true
