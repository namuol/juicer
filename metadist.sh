#!/bin/bash
# HACK:
# Builds a list of commands to run that will quickly build all revisions of the "game".
# A folder called "metadist" will be created that contains all the built revisions.
echo "mkdir -p ./meta"
echo "cp -r gulpfile.coffee package.json src/index.html meta/."
git log 254cab4 --pretty="mkdir -p 'metadist/%h' && rm -rf dist && git checkout -f %h && cp meta/gulpfile.coffee meta/package.json . && gulp build && cp -r dist/* 'metadist/%h' && cp meta/index.html 'metadist/%h/.' # %s" | tac
echo git checkout -f master