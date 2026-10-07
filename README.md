# EzySpeech Cockpit Module

A [Cockpit](https://cockpit-project.org/) module for running
[EzySpeech](https://github.com/gahingwoo/ezy_speech_translate), live speech
translation, on the server it is installed on.

## Overview

A page in Cockpit for running EzySpeech on the server:

- whether the listener page and the operator's console are up, how many are listening, and links to both
- start, stop and restart (stopping asks first: it cuts everyone off)
- checking GitHub for a new release, updating to it with a progress bar, and rolling back (which asks first too)
- setting a new admin password, made for you or typed in (only its hash is kept)
- backing up settings and transcripts to /var/backups
- memory and CPU of each server, the size of the transcripts, and the free disk
- the log, filtered or followed live, with web requests left out unless asked for

It works for a native install and a Docker one alike, because it does none of
this itself: everything goes through the `ezyspeech` command that EzySpeech's
installer puts on the server, the same one used from a terminal. It is in
English and Chinese, following Cockpit's own language setting.

## Installing

EzySpeech's installer offers to add this module when Cockpit is on the
machine, and every EzySpeech release carries a built copy of it
(`ezyspeech-cockpit-<version>.tar.gz`); updating EzySpeech updates the module
with it. So most people never build it:

```bash
curl -fsSL https://github.com/gahingwoo/ezy_speech_translate/releases/latest/download/install.sh | sudo bash
```

The rest of this file is for working on the module itself.

## Building

Needs Node.js 20 or later, npm, make, git and gettext.

```bash
git clone https://github.com/gahingwoo/ezy_speech_cockpit.git
cd ezy_speech_cockpit
make
```

`make` fetches the parts of Cockpit's source the build uses into `pkg/lib`
(pinned by `COCKPIT_REPO_COMMIT` in the Makefile; move it to a newer Cockpit
release by hand, now and then), installs the npm packages,
and builds the module into `dist/`. `make NODE_ENV=production` builds it
minified, as releases are.

To try it in a Cockpit on the same machine, link the build into your own
Cockpit packages and rebuild on every change:

```bash
make devel-install     # ~/.local/share/cockpit/ezyspeech -> dist/
make watch             # rebuild as files change; reload the page to see it
make devel-uninstall   # remove the link again
```

`sudo make install` copies it to `/usr/local/share/cockpit/ezyspeech` instead.

## Layout

```
src/
  index.tsx, index.html, manifest.json   the module's entry, as Cockpit loads it
  app.tsx                                the page
  ezyspeech.ts                           the ezyspeech command: types and calls
  hooks.ts                               status, polled; administrative access
  components/                            one file per card or tab, and the parts they share
po/zh_CN.po                              the Chinese translation
test/                                    browser tests, and the stand-in ezyspeech command they use
```

## Checks and tests

```bash
make codecheck    # TypeScript, ESLint and Stylelint
make check        # the browser tests
```

The browser tests drive the page in a real Cockpit with
[Playwright](https://playwright.dev/). They do not need EzySpeech:
`test/fake-ezyspeech` stands in for the `ezyspeech` command, answering with
fixed data (4.1.9 installed, 4.2.0 available, 4.1.8 kept to roll back to), so
what they test is the page. To run them, on a throwaway machine or VM with
systemd (they give the test user password-less sudo):

```bash
make NODE_ENV=production
sudo TEST_PASSWORD=<a password for the test user> test/prepare-host.sh
TEST_PASSWORD=<the same> make check
```

`prepare-host.sh` installs Cockpit if it is missing, creates the user
`ezytester`, and puts the stand-in command and the built module in place.
`COCKPIT_URL` points the tests at a Cockpit elsewhere (the default is
`https://localhost:9090`); outside CI they use the Chrome already installed.

GitHub Actions runs both on every push and pull request
(`.github/workflows/ci.yml`), on an Ubuntu runner.

## Translations

The strings in the source are marked with `_()`, and `po/zh_CN.po` translates
them. After changing or adding strings:

```bash
make update-po    # merge the new strings into every po/*.po
```

then translate the new entries. Cockpit's po tools need Python 3.10 or later;
on a machine whose `python3` is older, pass one: `make update-po PYTHON=python3.12`.

## Releasing

There is no release of its own: EzySpeech's release workflow checks out this
repository's `main`, builds it, and publishes it with each EzySpeech release.

## License

The module is free software under the GNU Affero General Public License,
version 3 or (at your option) any later version; see [LICENSE](LICENSE).

`build.js`, `src/index.html` and `src/index.tsx` come from Cockpit's
starter-kit and stay under the GNU Lesser General Public License, version 2.1
or later, as does the Cockpit library the build fetches into `pkg/lib`; see
[LICENSE.LGPL-2.1](LICENSE.LGPL-2.1).

## Further reading

- [Cockpit Development Guide](https://cockpit-project.org/guide/latest/)
- [PatternFly](https://www.patternfly.org/)
