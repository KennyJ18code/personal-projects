# Airframe Mission Planner

Fuel, payload and range calculator for military airframes. Build a route by tapping the 3D globe, typing an airfield code, or entering lat/long or MGRS, then see fuel aboard along the route, where fuel is required, and how much each leg can carry.

**Planning estimates only.** Airframe numbers are approximate public figures and the performance model is simplified. Not a substitute for operator's manual performance charts, weight and balance, or approved mission planning systems.

## Folders

- `src/` - the app as separate files. Open `index.html` through any local web server (needs internet for three.js and fonts).
  - `engine.js` - performance model: great-circle legs, wind, density altitude, weight-dependent burn, ground fuel by phase, reserves, payload limits
  - `data.js` - airframes and military airfields (edit numbers here or in the app's Airframes screen)
  - `fields.js` - about 3,900 US public airports from OurAirports (public domain)
  - `land.js` - coastlines from Natural Earth 110m
  - `mgrs.js` - MGRS conversion library (MIT)
  - `app.js` - screens, 3D globe and charts
- `standalone/` - everything in one HTML file, three.js r128 and fonts embedded. Works offline; double-click to open on a computer.
- `iphone-app/` - installable home-screen version with an offline cache. Upload the folder to any HTTPS static host, open it in Safari, then Share > Add to Home Screen. See its `README.txt`.

## Rebuilding

`standalone/` and `iphone-app/index.html` are `src/` with the scripts inlined. After editing `src/`, regenerate them and bump `VERSION` in `iphone-app/sw.js`.
