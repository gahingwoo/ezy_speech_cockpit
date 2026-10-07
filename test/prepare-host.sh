#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Make this machine ready for the browser tests: Cockpit, a user to sign in as,
# the stand-in ezyspeech command, and the module from dist/. Run as root from
# the repository, after `make`. Meant for a throwaway machine (a CI runner or
# a test VM): it gives the test user password-less sudo.
#
#   sudo TEST_USER=ezytester TEST_PASSWORD=... test/prepare-host.sh
set -eu

: "${TEST_USER:=ezytester}"
: "${TEST_PASSWORD:?set TEST_PASSWORD}"
here=$(cd "$(dirname "$0")" && pwd)
repo=$(dirname "$here")

if ! command -v cockpit-bridge >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends cockpit-ws cockpit-system
    else
        dnf install -y -q cockpit-ws cockpit-system
    fi
fi

# Two users: as the second, the stand-in command pretends to be a Podman install.
for user in "$TEST_USER" ezypodman; do
    id "$user" >/dev/null 2>&1 || useradd -m -s /bin/bash "$user"
    echo "$user:$TEST_PASSWORD" | chpasswd
    echo "$user ALL=(ALL) NOPASSWD: ALL" > "/etc/sudoers.d/90-$user"
    chmod 440 "/etc/sudoers.d/90-$user"
done
mkdir -p /etc/fake-ezyspeech-mode.d
echo podman > /etc/fake-ezyspeech-mode.d/ezypodman

# Both places the installer links the real command, so the module finds this
# one wherever it looks.
install -m 755 "$here/fake-ezyspeech" /usr/local/bin/ezyspeech
ln -sf /usr/local/bin/ezyspeech /usr/bin/ezyspeech
rm -f /tmp/fake-ezyspeech.log

rm -rf /usr/share/cockpit/ezyspeech
mkdir -p /usr/share/cockpit/ezyspeech
cp -r "$repo"/dist/* /usr/share/cockpit/ezyspeech/
chmod -R a+rX /usr/share/cockpit/ezyspeech

systemctl enable --now cockpit.socket
