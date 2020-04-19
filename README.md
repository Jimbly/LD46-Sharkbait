Ludum Dare 46 - Keep it alive
=============================

LD46 Entry by Jimbly - "Sharkbait"

* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/glovjs)

Start with: `npm start` (after running `npm i` once)

TODO

Key systems:
  Something non-deadly to search for and find, perhaps with a cue as to where it is?  One per segment, not on traced route?

Balance:
  first shark should be earlier, so people see it

Art:
  background:
    parallax
    swimming fish
    rising bubbles
    fish become bones upon death!
  caves
  music

shark needs a bigger mouth when chomping

Stretch:
  respec (if upgrades are interesting enough)

EVO demake idea:
  Fish? Robofish? More alien? Blobs? Cells? Space Whales?
  View is dark except around you (maybe slight view of terrain?)
  Virtual pixel resolution increases as your view range increases (or, we just scale with non-strict-pixely?)
  Aim for 0 text, just numbers and icons
  Procedural, need to go deeper, as your rank up, lower tier creatures will give no health/XP
  Have HP that is slowly draining, eating something increases your HP and XP by the same amount
  XP bar full -> choose one upgrade, and all creatures give slightly less HP/XP
  Always 100 XP for a level up and appropriate-leveled things give 1XP?
  Level up is always a choice of two interesting things, instead of just choosing which upgrades to buy?
    If people only play through once, the choice is perhaps not so interesting?
  Upgrades:
    Danger sense vs increased visibility
    Radar for terrain, but not creatures, in outside areas?
    Tentacles - long/large attack range, but lose mobility, just drift around
    Basic: Armor, Health, Movement speed, Agility, Size (bad?)
  Respec pickup lets you rechoose last 3 upgrades or so
  Intensity affect music and enemy spawning rate/strength, reset on level up, build as XP (not time?) progresses

Grand strategy idea:
  Have a Mana Tree or (or living Keep?) that you spend mana from
  Each turn, get one card, choose how to play it:
    always land + structure - either activate all of a given land type, or add one structure to any land
  Also get to choose two units to move/attack (1-5 steps in friendly + 1 step into enemy)
  Structures do different things on different lands
    Factories:
      Produce Mana Tanks (and other units), cost mana
    Mana Foci
      On Forests: heal 1 mana
      On Mountains: -1 mana, 2 direct damage to any hex (max 4?)
      others: just damage units?
    Something more passive? Defenses
      On Forests: self-heal
      On Mountains: giant HP
