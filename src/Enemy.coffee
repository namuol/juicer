cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'
Eye = require 'Eye'

class Enemy extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'enemy'
    @texture = 'enemy_basic'

    @anchor.x = @anchor.y = 0.5

    @body.width = 16
    @body.height = 16
    @body.offset.x = -@body.width/2
    @body.offset.y = -@body.height/2
    @body.bounce = 1

    @life = 3
    @speed = 100

    @scale.x = @scale.y = 0
    @tween
      duration: 750
      values:
        'scale.x': 1
        'scale.y': 1
      easeFunc: 'elastic.out'

    cg.sounds.spawn.play(cg.rand(0.3,0.5))

    @leftEye = @addChild new Eye
      x: 4
      y: -2

    @rightEye = @addChild new Eye
      x: @width-4
      y: -2

    rand = -> cg.rand 100, 250
    @animate ['speed', 0, rand, 'back.out'], ['speed', @speed, rand, 'quad.out']

  update: ->
    targetVelocity = @vecTo(cg('#player')).mag(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).mul(0.2))

    for other in cg('enemy')
      cg.physics.collide @body, other.body  unless other is @

    if bullet = @touches cg('bullet')
      @hit(bullet)

    playerPos = new cg.math.Vector2 cg('#player').worldX, cg('#player').worldY
    @leftEye.lookAt playerPos
    @rightEye.lookAt playerPos

  hit: (bullet) ->
    @body.v.$add(bullet.body.v.mul(0.5))
    cg.sounds.wallHit.play(cg.rand(0.3,0.5))
    bullet.destroy()
    @life -= bullet.strength
    @leftEye.wince().ball.rotation = cg.rand -Math.PI, Math.PI
    @rightEye.wince().ball.rotation = cg.rand -Math.PI, Math.PI
    @scale.x = @scale.y = 2
    @tween 'scale.x', 1, 150
    @tween 'scale.y', 1, 150
    if @life <= 0
      cg.sounds.hit.play()
      @destroy()

module.exports = Enemy
