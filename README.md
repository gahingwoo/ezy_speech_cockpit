# EzySpeech Cockpit Module

A [Cockpit](https://cockpit-project.org/) module for managing the EzySpeech Translate service. This module provides a web-based interface to monitor and control EzySpeech translation services.

## Overview

A page in Cockpit for running EzySpeech on the server:

- whether the listener page and the operator's console are up, how many are listening, and links to both
- start, stop and restart
- checking GitHub for a new release, updating to it with a progress bar, and rolling back
- setting a new admin password (shown once; only its hash is kept)
- backing up settings and transcripts to /var/backups
- the log, filtered or followed live

It works for a native install and a Docker one alike, because it does none of
this itself: everything goes through the `ezyspeech` command that EzySpeech's
installer puts on the server, the same one used from a terminal.

## Installing

EzySpeech's installer offers to add this module when Cockpit is on the
machine, and every EzySpeech release carries a built copy of it
(`ezyspeech-cockpit-<version>.tar.gz`), so most people never build it:

```bash
curl -fsSL https://github.com/gahingwoo/ezy_speech_translate/releases/latest/download/install.sh | sudo bash
```

The rest of this file is for working on the module itself.

## Prerequisites

### System Requirements
- Linux system with Cockpit installed (Cockpit >= 235 recommended)
- Node.js 16 or higher
- npm and make build tools

### Development dependencies

#### On Debian/Ubuntu:

```bash
sudo apt install gettext nodejs npm make
```

#### On Fedora:

```bash
sudo dnf install gettext nodejs npm make
```

#### On openSUSE Tumbleweed and Leap:

```bash
sudo zypper in gettext-runtime nodejs npm make
```

## Getting and Building the Source

Clone the repository and build the module:

```bash
git clone https://github.com/gahingwoo/ezy_speech_cokcpit.git
cd ezy_speech_cokcpit
npm install
make
```

This will build the module into the `dist/` directory.

## Installation

### Production Installation

To compile and install the module into the standard Cockpit location:

```bash
make install
```

This installs the module to `/usr/local/share/cockpit/ezy-speech-cockpit/`.

You can also build RPM packages using:

```bash
make rpm      # Build binary RPM
make srpm     # Build source RPM
```

In production mode, source files are automatically minified and compressed. Set `NODE_ENV=production` to enable this optimizations:

```bash
NODE_ENV=production make
```

### Development Installation

For development workflow, install the module as a symbolic link:

```bash
make devel-install
```

This creates a link at `~/.local/share/cockpit/ezy-speech-cockpit` pointing to your checkout directory, so you can test changes immediately without reinstalling.

To uninstall the development version:

```bash
make devel-uninstall
```

Or manually:

```bash
rm ~/.local/share/cockpit/ezy-speech-cockpit
```

### Manual Installation

If you prefer to set up the module manually:

```bash
mkdir -p ~/.local/share/cockpit
ln -s $(pwd)/dist ~/.local/share/cockpit/ezy-speech-cockpit
```

## Development Workflow

### Watching for Changes

Use watch mode to automatically rebuild the bundle when source files change:

```bash
./build.js -w
```

Or using make:

```bash
make watch
```

After each rebuild, reload the Cockpit page in your browser to see the changes.

### Remote Development

When developing against a remote virtual machine or host, you can automatically upload code changes:

**For virtual machines:**

```bash
RSYNC=virtual-machine-hostname make watch
```

**For remote hosts (as regular user):**

If you want to upload to `~/.local/share/cockpit/` on the remote host instead of `/usr/local`:

```bash
RSYNC_DEVEL=remote-hostname make watch
```

## Code Quality

### Running ESLint

EzySpeech Cockpit Module uses [ESLint](https://eslint.org/) to automatically check
JavaScript/TypeScript code style in `.js[x]` and `.ts[x]` files.

ESLint is executed as part of the static code tests:

```bash
make codecheck
```

For developer convenience, you can run ESLint manually:

```bash
npm run eslint
```

To automatically fix code style violations:

```bash
npm run eslint:fix
```

ESLint rules are configured in the `.eslintrc.json` file.

### Running Stylelint

The module uses [Stylelint](https://stylelint.io/) to check CSS and SCSS code style.

Stylelint is executed as part of the static code tests:

```bash
make codecheck
```

For developer convenience, run Stylelint manually:

```bash
npm run stylelint
```

To automatically fix style violations:

```bash
npm run stylelint:fix
```

Stylelint rules are configured in the `.stylelintrc.json` file.

## Running tests locally

Run `make check` to build an RPM, install it into a standard Cockpit test VM
(centos-9-stream by default), and run the test/check-application integration test on
it. This uses Cockpit's Chrome DevTools Protocol based browser tests, through a
Python API abstraction. Note that this API is not guaranteed to be stable, so
if you run into failures and don't want to adjust tests, consider checking out
Cockpit's test/common from a tag instead of main (see the `test/common`
target in `Makefile`).

After the test VM is prepared, you can manually run the test without rebuilding
the VM, possibly with extra options for tracing and halting on test failures
(for interactive debugging):

    TEST_OS=centos-9-stream test/check-application -tvs

It is possible to setup the test environment without running the tests:

    TEST_OS=centos-9-stream make prepare-check

You can also run the test against a different Cockpit image, for example:

    TEST_OS=fedora-40 make check

## Running tests locally

Run `make check` to build an RPM, install it into a standard Cockpit test VM
(centos-9-stream by default), and run the integration test. This uses Cockpit's 
Chrome DevTools Protocol based browser tests through a Python API abstraction.

After the test VM is prepared, you can manually run tests without rebuilding
the VM, with extra options for tracing and debugging:

```bash
TEST_OS=centos-9-stream test/check-application -tvs
```

To setup the test environment without running tests:

```bash
TEST_OS=centos-9-stream make prepare-check
```

To run tests against a different OS image:

```bash
TEST_OS=fedora-40 make check
```

## Running tests in CI

The project integrates with continuous integration systems:

- **Cirrus CI**: Free Linux Container environment with `/dev/kvm` support
- **Packit**: Automated testing for Fedora releases

Tests use the [FMF metadata format](https://github.com/teemtee/fmf) with the 
[tmt test management tool](https://docs.fedoraproject.org/en-US/ci/tmt/) for 
consistency between upstream and Fedora package gating.

## Project Structure

The repository is organized as follows:

```
ezy_speech_cockpit/
├── src/              # TypeScript/TSX source files
│   ├── app.tsx       # Main application component
│   ├── index.tsx     # Application entry point
│   └── ...           # Other components and styles
├── pkg/lib/          # Cockpit component library
├── test/             # Integration tests
├── build.js          # Build script
├── package.json      # Node.js dependencies
└── Makefile          # Build automation
```

## Contributing

When contributing to the EzySpeech Cockpit module:

1. Follow the code style standards enforced by ESLint and Stylelint
2. Run `make codecheck` before submitting changes
3. Write or update tests as needed
4. Ensure tests pass locally before submitting pull requests

## License

Licensed under the LGPL 2.1. See [LICENSE](LICENSE) file for details.

## Resources

- [Cockpit Project](https://cockpit-project.org/)
- [Cockpit Development Guide](https://cockpit-project.org/guide)
- [EzySpeech Project](https://github.com/gahingwoo/ezy_speech_translate)

## Release Management

When ready to release a new version:

1. Create a signed tag with the version number and release notes:
   ```bash
   git tag -s v1.0.0 -m "Release v1.0.0
   
   - feature description
   - bug fix description"
   ```

2. Push the tag to trigger the release workflow

The release workflow builds the official tarball and publishes it to GitHub.

## Dependency Management

The project uses [dependabot](https://github.com/dependabot) to keep NPM dependencies 
up to date with security patches and bug fixes. Check the 
[configuration file](.github/dependabot.yml) for details.

Keep dependencies updated by running:

```bash
npm update
```

## Further Reading

- [Cockpit Project](https://cockpit-project.org/)
- [Cockpit Development and Deployment Guide](https://cockpit-project.org/guide/latest/)
- [Making Your Application Easily Discoverable](https://cockpit-project.org/blog/making-a-cockpit-application.html)
