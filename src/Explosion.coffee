cg = require 'cg'
Physical = require 'plugins/physics/Physical'

class Explosion extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  reset: ->
    cg('#game').shake.randomize(20)
    @addClass 'explosion'
    @texture = null
    @width = @height = 30
    @anchor.x = @anchor.y = 0.5
    @scale.x = @scale.y = cg.rand(1,2)

    @anim = cg.sheets.flash.anim [0,1], cg.dt*2, false
    @on @anim, 'end', -> @destroy()

    @radius = 60
    @body.width = @body.height = @radius * 2
    @body.offset.x = @body.offset.y = -@body.width/2
    @body.bounded = false
    @strength = 1
    @exploded = false

  update: ->
    return  if @exploded
    r2 = @radius * @radius
    for e in cg('enemy') by -1
      if @touches e
        to = @vecTo(e)
        strength = (r2 - to.len2()) / r2
        strength *= strength
        continue  unless strength > 0
        e.body.v.$add(to.mag(strength*700).limit(700))
        e.damage @strength
    @exploded = true

module.exports = Explosion
