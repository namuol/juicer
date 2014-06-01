cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Flash = require 'Flash'

class Bullet extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  reset: ->
    @addClass 'bullet'
    @strength = 1
    @texture = 'bullet_basic'
    @anchor.x = @anchor.y = 0.5
    @body.width = @width
    @body.height = @height
    @body.offset.x = -@width/2
    @body.offset.y = -@height/2

    # Whenever a bullet hits a wall...
    @once @body, 'collision', (spot) ->
      cg.sounds.wallHit.play(cg.rand(0.1,0.3))
      scale = cg.rand(0.75,1.25)
      cg('#game').addChild Flash.pool.spawn
        x: spot.x
        y: spot.y
        scale:
          x: scale
          y: scale

      @destroy()

module.exports = Bullet
