#!/bin/bash
set -eu

test_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
test_app="$test_dir/Excord.app/Contents/MacOS/excord"
if [ ! -x "$test_app" ]; then
    echo "Extract the Mac test ZIP here, with Excord.app beside this launcher. Do not move it into Applications."
    exit 1
fi
if pgrep -x excord >/dev/null || pgrep -x Excord >/dev/null; then
    echo "Quit Excord completely before starting the Favorites test build, then run this launcher again."
    exit 1
fi

export EXCORD_USER_DATA_DIR="$HOME/Library/Application Support/excord-favorites-dev"
echo "DEV DO NOT INSTALL - ExcordFavorites"
echo "Using the separate test profile: $EXCORD_USER_DATA_DIR"
echo "Sign in again for testing. Do not install updates from this test build."
exec "$test_app"
