cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'

class Bullet extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'bullet'
    @strength = 1
    @texture = 'bullet_basic'
    @anchor.x = @anchor.y = 0.5
    @body.width = @width
    @body.height = @height
    @body.offset.x = -@width/2
    @body.offset.y = -@height/2

    # Whenever a bullet hits a wall...
    @on @body, 'collision', ->
      cg.sounds.wallHit.play(cg.rand(0.1,0.3))
      @destroy()

module.exports = Bullet
