cg = require 'cg'

class Eye extends cg.Actor
  @plugin cg.util.HasPooling
  reset: ->
    @ball = @addChild new cg.Actor
      texture: 'eye'
      anchor:
        x: 0.5
        y: 0.5
      rotation: cg.rand -Math.PI, Math.PI

    @rotationVelocity = 0
    @targetRotation = 0

  lookAt: (otherWorldPos) ->
    worldPos = new cg.math.Vector2 @worldX, @worldY
    @targetRotation = otherWorldPos.sub(worldPos).angle()

  wince: (scale=0.1) ->
    @tween 'scale.y', scale, 25
    .then ->
      @tween 'scale.y', 1, 250
    return @

  update: ->
    targetRotationVelocity = cg.math.minAngle @targetRotation - @ball.rotation
    @rotationVelocity += (targetRotationVelocity - @rotationVelocity) * 0.1
    @ball.rotation += @rotationVelocity

module.exports = Eye
