cg = require 'cg'

class Eye extends cg.Actor

  init: ->
    @texture = 'eye'
    @anchor.x = @anchor.y = 0.5
    @rotationVelocity = 0
    @targetRotation = 0

  lookAt: (actor) ->
    actorWorldPos = new cg.math.Vector2 actor.worldX, actor.worldY
    worldPos = new cg.math.Vector2 @worldX, @worldY
    @targetRotation = actorWorldPos.sub(worldPos).angle()

  update: ->
    targetRotationVelocity = cg.math.angleDiff @targetRotation, @rotation

    if Math.abs targetRotationVelocity > Math.PI
      if @targetRotation > 0
        @targetRotation = Math.PI*2 - @targetRotation
      else
        @targetRotation = Math.PI*2 + @targetRotation
      targetRotationVelocity = @targetRotation - @rotation

    @rotationVelocity += (targetRotationVelocity - @rotationVelocity) * 0.1
    @rotation += @rotationVelocity

module.exports = Eye
