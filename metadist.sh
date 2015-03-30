#!/bin/bash
# Builds a list of commands to run that will quickly build all the revisions you need...
echo "cp -r meta _meta"
git log --pretty="mkdir -p 'metadist/%h' && cp _meta/gulpfile.coffee . && cp _meta/index.html src/. && rm -rf dist && git checkout %h && gulp build && cp -r dist/* 'metadist/%h'" | tac
