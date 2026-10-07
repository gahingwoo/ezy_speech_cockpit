# extract name from package.json
PACKAGE_NAME := $(shell awk '/"name":/ {gsub(/[",]/, "", $$2); print $$2}' package.json)
VERSION := $(shell T=$$(git describe 2>/dev/null) || T=1; echo $$T | tr '-' '.')
PREFIX ?= /usr/local
# Cockpit's po tools need Python 3.10 or later, and name /usr/bin/python3
PYTHON ?= python3
APPSTREAMFILE=org.cockpit_project.$(subst -,_,$(PACKAGE_NAME)).metainfo.xml
# stamp file to check for node_modules/
NODE_MODULES_TEST=package-lock.json
# build.js ran in non-watch mode
DIST_TEST=runtime-npm-modules.txt
# one example file in pkg/lib to check if it was already checked out
COCKPIT_REPO_STAMP=pkg/lib/cockpit-po-plugin.js

all: $(DIST_TEST)

# checkout common files from Cockpit repository required to build this project;
# this has no API stability guarantee, so check out a stable tag when you start
# a new project, use the latest release, and update it from time to time
COCKPIT_REPO_FILES = \
	pkg/lib \
	$(NULL)

COCKPIT_REPO_URL = https://github.com/cockpit-project/cockpit.git
COCKPIT_REPO_COMMIT = 92e0108df1034207bcf7852c7747707d7da044ac # 358 + 2 commits

$(COCKPIT_REPO_FILES): $(COCKPIT_REPO_STAMP)
COCKPIT_REPO_TREE = '$(strip $(COCKPIT_REPO_COMMIT))^{tree}'
$(COCKPIT_REPO_STAMP): Makefile
	@git rev-list --quiet --objects $(COCKPIT_REPO_TREE) -- 2>/dev/null || \
	    git fetch --no-tags --no-write-fetch-head --depth=1 $(COCKPIT_REPO_URL) $(COCKPIT_REPO_COMMIT)
	git archive $(COCKPIT_REPO_TREE) -- $(COCKPIT_REPO_FILES) | tar x

#
# i18n
#

LINGUAS=$(basename $(notdir $(wildcard po/*.po)))

po/$(PACKAGE_NAME).js.pot:
	xgettext --default-domain=$(PACKAGE_NAME) --output=- --language=C --keyword= \
		--add-comments=Translators: \
		--keyword=_:1,1t --keyword=_:1c,2,2t --keyword=C_:1c,2 \
		--keyword=N_ --keyword=NC_:1c,2 \
		--keyword=gettext:1,1t --keyword=gettext:1c,2,2t \
		--keyword=ngettext:1,2,3t --keyword=ngettext:1c,2,3,4t \
		--keyword=gettextCatalog.getString:1,3c --keyword=gettextCatalog.getPlural:2,3,4c \
		--from-code=UTF-8 $$(find src/ -name '*.[jt]s' -o -name '*.[jt]sx') | \
		sed '/^#/ s/, c-format//' > $@

po/$(PACKAGE_NAME).html.pot: $(NODE_MODULES_TEST) $(COCKPIT_REPO_STAMP)
	$(PYTHON) pkg/lib/html2po -o $@ $$(find src -name '*.html')

po/$(PACKAGE_NAME).manifest.pot: $(COCKPIT_REPO_STAMP)
	$(PYTHON) pkg/lib/manifest2po -o $@ src/manifest.json

po/$(PACKAGE_NAME).metainfo.pot: $(APPSTREAMFILE)
	xgettext --default-domain=$(PACKAGE_NAME) --output=$@ $<

po/$(PACKAGE_NAME).pot: po/$(PACKAGE_NAME).html.pot po/$(PACKAGE_NAME).js.pot po/$(PACKAGE_NAME).manifest.pot po/$(PACKAGE_NAME).metainfo.pot
	msgcat --sort-output --output-file=$@ $^

# bring every translation up to date with the strings in the source
update-po: po/$(PACKAGE_NAME).pot
	for po in po/*.po; do msgmerge --update --backup=none --no-fuzzy-matching $$po $<; done

po/LINGUAS:
	echo $(LINGUAS) | tr ' ' '\n' > $@

#
# Build/Install
#

$(DIST_TEST): $(NODE_MODULES_TEST) $(COCKPIT_REPO_STAMP) $(shell find src/ po/ -type f) package.json build.js
	NODE_ENV=$(NODE_ENV) ./build.js

watch: $(NODE_MODULES_TEST) $(COCKPIT_REPO_STAMP)
	NODE_ENV=$(NODE_ENV) ./build.js --watch

clean:
	rm -rf dist/
	rm -f po/LINGUAS po/*.pot
	rm -f metafile.json runtime-npm-modules.txt

install: $(DIST_TEST) po/LINGUAS
	mkdir -p $(DESTDIR)$(PREFIX)/share/cockpit/$(PACKAGE_NAME)
	cp -r dist/* $(DESTDIR)$(PREFIX)/share/cockpit/$(PACKAGE_NAME)
	mkdir -p $(DESTDIR)$(PREFIX)/share/metainfo/
	msgfmt --xml -d po \
		--template $(APPSTREAMFILE) \
		-o $(DESTDIR)$(PREFIX)/share/metainfo/$(APPSTREAMFILE)

# this requires a built source tree and avoids having to install anything system-wide
devel-install: $(DIST_TEST)
	mkdir -p ~/.local/share/cockpit
	ln -s `pwd`/dist ~/.local/share/cockpit/$(PACKAGE_NAME)

# assumes that there was symlink set up using the above devel-install target,
# and removes it
devel-uninstall:
	rm -f ~/.local/share/cockpit/$(PACKAGE_NAME)

print-version:
	@echo "$(VERSION)"

#
# Checks
#

# types and lint, for the code and the styles: what CI runs before the browser tests
codecheck: $(NODE_MODULES_TEST) $(COCKPIT_REPO_STAMP)
	npx tsc --noEmit -p .
	npx eslint src/ test/
	npx stylelint 'src/*.scss'

# the browser tests, against a Cockpit with the module and the stand-in
# ezyspeech command installed; see "Checks and tests" in README.md
check: $(NODE_MODULES_TEST)
	npx playwright test

$(NODE_MODULES_TEST): package.json
	# if it exists already, npm install won't update it; force that so that we always get up-to-date packages
	rm -f package-lock.json
	# unset NODE_ENV, skips devDependencies otherwise; this often hangs, so try a
	# few times, under timeout(1) where there is one (macOS has none)
	T=$$(command -v timeout >/dev/null && echo "timeout 10m"); \
	for _ in `seq 3`; do $$T env -u NODE_ENV npm install --ignore-scripts && exit 0; done; exit 1
	env -u NODE_ENV npm prune

.PHONY: all clean install devel-install devel-uninstall print-version update-po codecheck check
