cg = require 'cg'

class Eye extends cg.Actor

  init: ->
    @ball = @addChild new cg.Actor
      texture: 'eye'
      anchor:
        x: 0.5
        y: 0.5
      rotation: cg.rand -Math.PI, Math.PI

    @rotationVelocity = 0
    @targetRotation = 0
    @origScale = @scale.y

  lookAt: (actor) ->
    actorWorldPos = new cg.math.Vector2 actor.worldX, actor.worldY
    worldPos = new cg.math.Vector2 @worldX, @worldY
    @targetRotation = actorWorldPos.sub(worldPos).angle()

  wince: ->
    @tween 'scale.y', @origScale*0.1, 25
    .then ->
      @tween 'scale.y', @origScale, 250
    return @

  update: ->
    targetRotationVelocity = cg.math.angleDiff @targetRotation, @ball.rotation

    if Math.abs targetRotationVelocity > Math.PI
      if @targetRotation > 0
        @targetRotation = Math.PI*2 - @targetRotation
      else
        @targetRotation = Math.PI*2 + @targetRotation
      targetRotationVelocity = @targetRotation - @ball.rotation

    @rotationVelocity += (targetRotationVelocity - @rotationVelocity) * 0.1
    @ball.rotation += @rotationVelocity

module.exports = Eye
