cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'

class Bullet extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'bullet'
    @texture = 'bullet_basic'
    @body.width = @width
    @body.height = @height

    # Whenever a bullet hits a wall...
    @on @body, 'collision', ->
      cg.sounds.wallHit.play(0.25)
      @destroy()

module.exports = Bullet