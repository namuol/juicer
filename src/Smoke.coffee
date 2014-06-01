cg = require 'cg'
Physical = require 'plugins/physics/Physical'

class Smoke extends cg.Actor
  @plugin Physical, cg.util.HasPooling

  init: ->
    @texture = 'smoke'

  reset: ->
    @alpha = 1
    @body.bounded = false
    @body.v.randomize(cg.rand(20,60))
    @anchor.x = @anchor.y = 0.5
    @tween
      duration: @ttl
      values:
        'scale.x': 0
        'scale.y': 0
      easeFunc: 'linear'
    .then @destroy

module.exports = Smoke
