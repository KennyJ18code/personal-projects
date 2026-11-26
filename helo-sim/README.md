# Rotor Wing Flight Simulator

A browser helicopter simulator for phone, tablet or desktop: UH-60M Black Hawk, AH-64E Apache and CH-47F Chinook over real-world terrain.

**For entertainment.** The flight model and aircraft numbers are simplified approximations from public figures. It is not a training device.

## What is in it

- **Flight model** (`js/physics.js`): blade-element thrust with dynamic inflow, momentum-theory power, translational lift, ground effect, vortex ring state, blade stall, autorotation, tail-rotor torque balance, tandem rotors, wheel contact with static friction, sling-load pendulum, SAS / FPS / hold modes.
- **Systems** (`js/systems.js`): battery, APU, generators, fuel selectors and pumps, engine start with hot starts, power levers, rotor brake, hydraulics, icing, fire, caution panel, failures. Every cockpit switch feeds this.
- **Terrain** (`js/terrain.js`): elevation streamed from Mapzen terrarium tiles on AWS Open Data, draped with aerial imagery (USGS National Map in the United States, Sentinel-2 cloudless by EOX elsewhere). 3D trees stand where the photo shows woodland. With no connection it falls back to generated terrain. Airports and runways from OurAirports (public domain).
- **World** (`js/world.js`): time of day, cloud, wind and gusts, Apache gun / rockets / missiles and range targets, route navigation, missions.
- **Physical controls** (`js/cockpit.js`): toggles, levers, lit push-buttons, T-handles and guarded switches on the overhead panel, centre console, side consoles and instrument panel. Tap them in the 3D cockpit to operate them.
- **Cockpit** (`js/panel.js`, `js/ui.js`): glass flight and engine displays, switch pages, start checklist, map and route planner, refuel / cargo / rearm service, weather and failure controls.
- **Controls** (`js/input.js`): two touch sticks, tilt, gamepad, keyboard; synthesised sound.

## Running it

Open `index.html` from any web server (GitHub Pages serves it as is). On iPhone or iPad, open it in Safari and use Share > Add to Home Screen for a full-screen app.

## Credits

Elevation: Mapzen terrain tiles, hosted by AWS Open Data. Imagery: USGS National Map (public domain); Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 and 2017), CC BY 4.0. Airports: OurAirports. 3D: three.js r128 (MIT).
