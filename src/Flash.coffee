cg = require 'cg'
Physical = require 'plugins/physics/Physical'

class Flash extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  init: ->
    @anim = cg.sheets.flash.anim [0,1], cg.dt*2, false

  reset: ->
    @texture = null
    @anchor.x = @anchor.y = 0.5
    @anim.rewind()
    @once @anim, 'end', -> @destroy()

module.exports = Flash
