cg = require 'cg'

class Explosion extends cg.Actor
  @plugin cg.util.HasPooling

  reset: ->
    cg('#game').shake.randomize(20)
    @addClass 'explosion'
    @texture = null
    @width = @height = 30
    @anchor.x = @anchor.y = 0.5
    @scale.x = @scale.y = cg.rand(1,2)

    @anim = cg.sheets.flash.anim [0,1], cg.dt*2, false
    @on @anim, 'end', -> @destroy()


module.exports = Explosion
