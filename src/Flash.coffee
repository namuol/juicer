cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Smoke = require 'Smoke'

class Flash extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  init: ->
    @anim = cg.sheets.flash.anim [0,1], cg.dt*2, false

  reset: ->
    @texture = null
    @anchor.x = @anchor.y = 0.5
    @anim.rewind()
    @once @anim, 'end', ->
      scale = cg.rand(0.2,0.5)
      @parent.addChildAt Smoke.pool.spawn(
        x: @x + cg.rand(-5,5)
        y: @y + cg.rand(-5,5)
        scale:
          x: scale
          y: scale
        ttl: 2500 * scale
      ), @getChildIndex()
      @destroy()

module.exports = Flash
