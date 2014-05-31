gulp = require 'gulp'
gutil = require 'gulp-util'
path = require 'path'
source = require 'vinyl-source-stream'
streamify = require 'gulp-streamify'
exorcist = require 'exorcist'
uglify = require 'gulp-uglify'
gulpif = require 'gulp-if'
connect = require 'connect'
open = require 'gulp-open'
notify = require 'gulp-notify'

browserify = require 'browserify'
coffeeify = require 'coffeeify'
watchify = require 'watchify'

DEFAULT_PORT = 9042

usage = ->
  console.log """
  Usage: gulp <command> [options...]

  gulp dev       : run a development server and open it in your browser
    Options:
      --port, -p : port number that the server will bind to (default #{DEFAULT_PORT})

  gulp build     : build a production version of main-built.js
  """

gulp.task 'usage', usage
gulp.task 'help', usage

paths =
  images: [
    'src/assets/**/*.png'
    'src/assets/**/*.jpg'
  ]

if (gutil.env._.length is 0) or (gutil.env.help?) or (gutil.env.h?)
  usage()
  process.exit -1

handleErrors = ->
  # Send error to notification center with gulp-notify
  notify.onError(
    title: 'Compile Error'
    message: "\n<%= error.toString().replace('#{__dirname}/','') %>"
  ).apply @, arguments

  # Keep gulp from hanging on this task
  @emit 'end'

bundle = (b, debug=false) ->
  b.bundle({debug: true})
  .on 'error', handleErrors
  .pipe exorcist path.join __dirname, 'src/main-built.js.map'
  .pipe source 'main-built.js'
  .pipe gulpif !debug, streamify uglify
    inSourceMap: path.join __dirname, 'src/main-built.js.map'
    outSourceMap: path.join __dirname, 'src/main-built.js.map'
  .pipe gulp.dest './src/'

createBundler = (_browserify) ->
  b = _browserify
    extensions: ['.coffee']
    paths: [
      path.join __dirname, 'node_modules/combo/src'
      path.join __dirname, 'src'
    ]

  b.add path.join __dirname, 'src/main'
  b.transform coffeeify

gulp.task 'build', ->
  bundle createBundler browserify

livereload = null

gulp.task 'watch', ->
  # Code:
  b = createBundler watchify
  b.on 'update', ->
    bundle b, true
    for a in arguments
      console.log a
  bundle b, true

  # Assets:
  gulp.watch paths.images, {}, (event) ->
    console.log 'RELOAD IMAGE: ', event.path, event.type
    setTimeout ->
      livereload.reloadImage event.path.replace __dirname + '/src/', ''
    , 500
  return

port = gutil.env.port || gutil.env.p || DEFAULT_PORT

gulp.task 'connect', ['build'], ->
  livereload = require 'combo-livereload'
  app = connect()
    .use livereload
    .use connect.static './src'
  livereload.listen(require('http').createServer(app).listen(port))

gulp.task 'open', ['connect'], ->
  gulp.src 'src/index.html'
  .pipe open '',
    url: "http://localhost:#{port}/index.html"

gulp.task 'default', ['build']
gulp.task 'dev', ['build', 'connect', 'watch', 'open']
