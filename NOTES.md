## intro
Hi, my name is Lou, and in another life I was a game developer.

This talk is about "game feel". Don't worry if you don't know what that means, it doesn't matter.

An alternative title for the talk could have been "34 stupid tricks to make your game more
fun".

I have a lot of details to go through so I'll try to go quickly.

## 0: nothing
Here's a basic action game.

You're the white circle.

You can:
1. Move with the arrow keys
2. Aim with the mouse
3. And shoot red squares with yellow squares.

The real game mechanics are already "complete", but the game is very boring.

Let's make it more fun.

## 1: sounds
Sound is almost always the last thing people add to their game, but it's the 
easiest way to make your game more fun.

Don't wait til the end; add sounds as soon as possible.

Try to add sounds for any meaningful event in the game.

In our game, I have 3 sounds:
1. Gunshot
2. Enemy hit
3. Wall hit

## 2: enemies cluster/collide
So here I just made it so our enemies don't overlap with each other.

This makes it easier to see how many enemies there are, and adds
some amount of "physicality" to our enemies.

## 3: more "natural" player motion
Here I gave the player some "momentum", so when you let go of the arrow keys, the player
will slide for a split second in the direction it was heading.

This adds some "physicality" to our player. This is something the player might
not even notice, but it helps.

## 4: kickback
Now when the player shoots, they are propelled backward in the direction of
the shot.

I call this "kickback".

Once again, this makes the world *feel* more physical, and has a nice
cathartic effect when combined with the sound.

## 5: rapidfire
Here I just made the player's gun fire rapidly when the mouse is held.
Machine-gun style.

This creates a game mechanic: you can control the player's movement
just by shooting your gun.

In theory, I could turn off the arrow keys and create a novel little game, but
I'll keep them on.

## 6: sound volume randomization
The gunshot sound was getting very repetetive, so I randomize how loud
the effect is with each shot.

This is easier on the ears and sounds more "natural".

## 7: shot jitter
Here I made the gunfire less precise.

Game designers call this "spread".

This is:
1. More realistic

but more importantly

2. It feels more powerful and cathartic

## 8: enemy HP
With rapidfire, it's too easy to kill the red squares.

I just made it so you need to hit the enemy 3 times before
it disappears.

This is better, but now it feels awkward that the bullet just disappears
when it hits the enemy.

You can't really "see" that you're doing any damage.

## 9: enemy damage bloop
I added a little "bloop" animation so you can tell when you hit an enemy.

## 10: enemy damage kickback
This is better, but enemies still seem like they're mostly unaffected
by the shot.

Here I just push the enemies back whenever they get hit.

## 11: enemy appear anim
It was kind of awkward how enemies would just instantly-teleport
onto the screen, so I made a tiny animation when they appear.

## 12: enemy spawn sound
I also added a little sound to go with the animation for when enemies appear.

## 13: bullet graphics/rotation
Gave the bullets a more bullet-shaped graphic and rotate
them to point in the direction they travel.

## 14: next-gen graphics
Here are some "next-gen" graphics.

This isn't anything fancy, and you should choose your style to fit your game.

## 15: awesome background
I added a background so you can tell that the screen doesn't
scroll, and it adds just a little visual interest.

## 16: theyre watching...
Okay so, I kind of go off the deep end here...

I gave the enemies eyes that follow the player... it's really
easy to do and adds a lot of personality to the game.

## 17: googlier eyes
The eyes were kind of robotic, so now I made them operate
like springs and "wiggle" like a googly-eye toy.

## 18: walkin
Here I just multiply the enemy velocity by a sine wave, and it
makes them look like they're "walking".

Very easy thing to implement and makes the enemies feel much more "alive".

## 19: slightly more random walking
Here I just randomized the speed that they walk slightly.

## 20: wincing
Since the enemies have eyes, I decided to make them "wince" whenever
they got hit.

I think this had a really powerful effect, and all I'm doing
is scaling the eyes vertically and randomizing which direction
each eye looks, so they appear to be disoriented.

## 21: obligatory screenshake
Now whenever you shoot, the screen shakes.

A subtle note: the direction that the screen shakes is actually 
the same as the direction you aim.

## 22: player eyes
I might as well give the player eyes.

I reused the same "wincing" animation on the player whenever
it fires a shot. It's pretty hilarious.

## 23: super fake player rotation
Here I tried to make the player feel more 3-dimensional..

I wont go into detail about how I implemented this, but I love
the effect it had.

## 24: enemy hit rotation (also some pooling...)
Now enemies rotate slightly whenever they're hit, which again
just makes them look more disoriented.

## 25: enemies appear to rise from the ground
Now enemies appear to sort of "rise up" from the floor
out of nowhere -- it's a slight alteration of the original 
animation but it seems to give them a little depth.

## 26: enemies wince when they bump into each other hard enough
This is a tiny change: when enemies bump into each other hard enough,
they blink or wince.

## 27: simple explosions
It's not an action game without explosions.

I added the most basic explosion animation possible, which
is just a black circle, and a white circle, each one is visible
for a single frame.

Combining this with the sound effect feels really nice, and you don't need
a big fancy explosion sprite.

## 28: physical explosions = more fun
Those explosions are nice, but they don't cause any damage.

Now, any enemies in a radius of an exploding enemy are pushed
back and take a little damage.

Suddenly we have a new game mechanic: you can "chain"
explosions to clear all the enemies off the screen at once.

It's extremely satisfying.

## 29: bullet hits
I added tiny explosions where the bullets hit the wall.

## 30: muzzleflash
More tiny explosions for whenever a bullet is shot.

You could call this a "muzzleflash".

Notice how I position the muzzle flash based on which direction
the player is aiming.

## 31: random muzzle/bullet-hit flash size
Here I just randomized the size of the muzzle flash
to make it seem more organic.

## 32: smokin
I added the most basic "smoke", which is just grey circles that move slightly
in one direction, and scale down until they disappear.

Any of the game's explosions spawn these little smoke clouds.

Bigger explosions spawn more, bigger clouds of smoke that take
longer to disappear.

## 33: enemy spawn delay+smoke
Here I added little puffs of smoke for when enemies spawn,
and pause them in-place for a split second before they start
walking toward you.

The pause just gives you a moment to react if an enemy spawns right next
to you, and also gives the impression that the enemies have a more life-like 
"reaction time".

## 34: textured smoke?
Lastly, I just experimented with some basic lighting on the smoke texture...

This doesn't really do much, actually, and I ran out of time.

I could've kept adding little details, but this is a good start.


# QUESTIONS?