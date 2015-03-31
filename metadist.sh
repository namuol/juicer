#!/bin/bash
# Builds a list of commands to run that will quickly build all the revisions you need...
echo "mkdir -p ./meta"
echo "cp -r gulpfile.coffee package.json src/index.html meta/."
git log 254cab4 --pretty="cp meta/index.html 'metadist/%h/.' # %s" | tac
