cg = require 'cg'

class Eye extends cg.Actor

  init: ->
    @texture = 'eye'
    @anchor.x = @anchor.y = 0.5

  lookAt: (actor) ->
    actorWorldPos = new cg.math.Vector2 actor.worldX, actor.worldY
    worldPos = new cg.math.Vector2 @worldX, @worldY
    @rotation = actorWorldPos.sub(worldPos).angle()

module.exports = Eye
