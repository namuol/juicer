cg = require 'cg'
Physical = require 'plugins/physics/Physical'
Interactive = require 'plugins/ui/Interactive'

class Enemy extends cg.Actor
  @plugin Physical, Interactive

  init: ->
    @addClass 'enemy'
    @texture = 'enemy_basic'

    @anchor.x = @anchor.y = 0.5

    @body.width = @width
    @body.height = @height
    @body.offset.x = -@width/2
    @body.offset.y = -@height/2

    @life = 3
    @speed = 50

    @scale.x = @scale.y = 0
    @tween
      duration: 750
      values:
        'scale.x': 1
        'scale.y': 1
      easeFunc: 'elastic.out'

  update: ->
    targetVelocity = @vecTo(cg('#player')).mag(@speed)
    @body.v.$add(targetVelocity.sub(@body.v).mul(0.2))

    for other in cg('enemy')
      cg.physics.collide @body, other.body  unless other is @

    if bullet = @touches cg('bullet')
      @hit(bullet)

  hit: (bullet) ->
    @body.v.$add(bullet.body.v.mul(0.5))
    cg.sounds.wallHit.play(cg.rand(0.3,0.5))
    bullet.destroy()
    @life -= bullet.strength
    @scale.x = @scale.y = 1.5
    @tween 'scale.x', 1, 150
    @tween 'scale.y', 1, 150
    if @life <= 0
      cg.sounds.hit.play()
      @destroy()

module.exports = Enemy
