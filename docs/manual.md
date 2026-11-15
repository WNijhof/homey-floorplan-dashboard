# HomeDeck manual

HomeDeck puts your whole home on one screen: your house in 3D, your energy, and every storey as a live floor plan. The app runs on your Homey Pro and shows everything as a web page in your own home network, so any screen with a browser works.

This is still a test version. Things can go wrong, and all feedback is more than welcome. See [Feedback](#feedback).

You can look around without installing anything: [the demo](https://wnijhof.github.io/homey-floorplan-dashboard/).

## Getting started

1. Install the [test version](https://homey.app/a/com.drpeppers.floorplandashboard/test/).
2. In the Homey app, open *Apps → HomeDeck → Settings* and choose **Open editor**. The editor is at `http://<your-homey>:8687/editor`. It works best on a computer or tablet.
3. Choose **Quick start from Homey zones**. Your zones become levels and rooms, and every device starts in its room. You can also start blank, or from an estate agent's floor plan (see [Starting from a picture](#starting-from-a-picture)).
4. Set up your house under **House** in the left bar.
5. Open the dashboard at `http://<your-homey>:8687/` on a tablet, laptop or phone, or add the **Floor plan** widget to a Homey dashboard.

`<your-homey>` is the IP address of your Homey, for example `192.168.1.20`. You find it in the Homey app under *Settings → General*, or use the links in the HomeDeck app settings.

## The editor

The left bar holds the tools: Select, Room, Walls, Doors, Windows, Open wall, Furniture, Devices, Measure, Picture, Calendar and House. When nothing is selected in the drawing (or you click an empty spot beside the plan), the panel on the right shows the settings of the level itself.

### Controls

- Ctrl+Z undoes, Ctrl+Y redoes. Ctrl+C and Ctrl+V copy and paste, also onto another level. Delete removes.
- Space with dragging moves the view. The buttons at the bottom of the left bar zoom in and out, or show the whole level.
- The arrow keys move what you selected by 1 cm; with Shift by 10 cm. R turns a piece of furniture or a device by 15 degrees, Shift+R the other way.
- Shortcuts for the tools: V select, Q room, W walls, D doors, N windows, O open wall, F furniture, E devices, M measure.

### Snapping and fixing in place

- **Snapping** (the magnet button at the top) makes corners, walls and points click onto other corners, onto walls, in line with other rooms and onto a 10 cm grid. Turn it off to place everything freely and exactly. Holding Shift while dragging does the opposite for a moment.
- Furniture you let go of near a wall stands with its back against that wall. A wall lamp or thermostat hangs on the wall. If you don't want that, hold Shift while dragging. (The magnet button does not switch this off yet.)
- Doors and windows always belong in a wall and stay attached to it.
- **Fix rooms and walls in place** (the lock at the top) fixes the layout, so you can move furniture and devices without dragging a room or wall along by accident.
- **Line up all walls** (in the panel of the level) makes rooms that almost meet join onto each other's walls, and puts loose doors and windows back into the nearest wall.

### Rooms and walls

- Rooms: drag a rectangle. Drag the corners to change the shape. For an L-shape, pull a blue plus on the edge, or choose **Make L-shaped**. Alt-click a corner to remove it.
- A room without a name gets no label. To keep a room's name off the plan, such as for a built-in cupboard, untick **Show the name on the plan**.
- Half-high wall, fence or balcony: draw a free wall with **Walls**, fill in a height and choose wall, fence or glass at **Made of**.
- Curved wall: select a free wall and choose one of the curve buttons. To curve a room edge, add corners with the blue plusses.
- Open kitchen or passage: choose **Open wall** and click the wall between two rooms. Choose the width or **Open the whole wall**. Both rooms keep their own name and temperature. An open wall in an outer wall (a drive-through, a carport) is an open gap in the 3D house, from the ground up to the storey above.
- One open space in parts: when your living room, dining room and kitchen are one space, or when you draw the walls yourself, turn off **Walls around this room** for that room. The room keeps its name, temperature and floor but gets no walls of its own. A wall it shares with a room that does have walls stays.

- Niche, entrance or canopy: a room with **Walls around this room** off and a side that nothing stands against (no other room, no wall you drew on it) is no part of the block of the house in 3D. The house then gets a niche (the entrance) or stands open (a canopy), the walls of the rooms around it are outer walls, and the doors and windows in them also show in the 3D house. To make it a closed space after all, keep its walls on.
- Lower walls for one room: select the room and fill in **Wall height of this room** (cm), for a shed, an extension or a room under a sloping roof. A wall between two rooms is as high as the higher one. In the 3D house the walls of a whole storey still have the height of the level, but a room called Shed, Garden house or Garage on a garden level takes it. A room with its own gable roof also has **Slope of this roof**.

### Doors and windows

- Doors and windows go on a wall. For a window you set its bottom and top (for a tall window or a French door), for a door its height.
- Link a contact sensor, or a switch (a virtual one too), and the door or window shows open while it is on. Link a roller shutter or sun blind to a window and the 3D house shows it hanging over the window as far as it is closed (0% is fully closed, 100% fully open); this works with **Shape of the house** following the floor plan, where your own windows stand.
- When a door or window no longer stands in a wall, for example after you made a room bigger, drag it to the wall or choose **Line up all walls**. Loose doors and windows with no wall near are not drawn in 3D.

### Furniture

- Furniture comes from a catalogue. A colour you choose goes on the main part of the piece, such as the fabric of a sofa, the top of a table, or the body and fronts of a kitchen unit.
- Near a wall it turns its back to the wall by itself; use the turn buttons or R to adjust it.
- A TV on the wall (without a stand) is under Media as **Wall TV**.
- Stairs: select quarter-turn or spiral stairs and choose **Mirror the stairs** to make the turn go the other way.

### Colours, pictures and decals

- Colours: wherever you choose a colour you get the colour picker, a field to type a code (#rrggbb), a row of ready-made colours and a button back to the theme.
- Pictures of your own floor and walls: select a room. Under **Floor look** you choose a picture for the floor, under **Walls (inside)** a colour and/or a picture for the walls. Give the real width and height of what the picture shows (one tile, a few planks, one repeat of the wallpaper): it repeats at that size, in the plan and in 3D, and the shift and turn set where it starts. A picture is made smaller when you choose it (at most 768 px). The plan holds about 4 MB in all; the editor shows how much the pictures take.
- Painting parts of a wall: under **Walls (inside)** choose all walls of the room, or one wall (it lights up in the plan) that gets a look of its own. Add **bands**: a strip of the wall between two heights in cm with its own colour, for example a painted wainscot from 0 to 90 cm. Adding or removing a corner keeps the paint with its wall. Walls show their paint in the 3D room view; the plan and the 2.5D view show the floors.
- Decals: under **Furniture**, at **Decals**, add a picture or a coloured area on the floor (a rug, a mural, a terrace pattern) or against a wall (a painting, a panel). Give the real width and height; with the ratio kept the other side follows the picture. A decal on the floor can be turned, made round and made see-through; one on a wall hangs against the nearest wall at the height you choose and snaps to a wall when you drag it.
- Colours of furniture: each material of a model has its own colour field (a sofa and its legs, a table and its top), and a finish: matte, satin, glossy or metal. **Reset the colours** gives the model its own colours back.
- Cabinets to size: under Cabinets and shelves, **Display cabinet, steel frame with glass** and **Cabinet with doors, own size** are drawn in 3D from what you set: width, depth and height, one to four hinged doors, how much of each door is glass (from the top), shelves behind the glass, handles, the colours of the frame, the doors and the glass, and the finish.

### Devices

- Drag devices from the list to their place. For lamps you choose the kind: ceiling, pendant, wall, floor or table lamp.
- Several spots on one switch: select the device and choose **Place this device again**, or copy and paste it. Every copy switches the same device.
- A switch with more buttons (in Homey for example onoff.2) shows each extra button as a device of its own in the list, with the number or name of that button after it. That way you link a lamp to the button that switches it.
- A thermostat or air conditioner can look like a wall thermostat, a radiator valve, a fan coil unit or an air conditioner indoor unit: select it and choose under **Shown as**. An air conditioner hangs as an indoor unit high on the wall by itself, and you can choose it as the thermostat of a room. If the target temperature does not step the right way (whole degrees for an air conditioner, or 0.1° for a Tado), choose **Step of the target temperature** in the room: 0.1°, 0.5° or 1°.
- A TV from Homey hangs on the wall as a flat TV; its screen lights up when it is on, and a tap turns it on or off.
- Speakers: select a speaker and choose a box under **Shown as**. It then stands as a model on the plan and in 3D.

### Levels

- Add a level with the + beside the tabs at the top. A new level goes on top.
- Order: open the level with its tab, select nothing in the drawing and scroll down in the panel on the right to the heading **Plan**. There you find **Move level down** and **Move level up**. The tabs and the 3D house follow that order.
- What a level is: choose under **In the 3D house** whether it is a storey of the house, the garden, a garage or shed of its own, or something that is not in the 3D house (a cellar, a storage room). Without a choice the name decides: Garden, Front garden, Back garden, Backyard, Terrace and Driveway are garden; Basement and Cellar are not in the 3D house. Only storeys stack up as floors of the house.
- Storeys on each other: when a storey stands shifted on the one below in the 3D house (because of an extension downstairs, or because you drew it in another place), choose under **In the 3D house** at **Front to back** for **Front walls in line**, **Back walls in line** or **In the middle**, and if needed at **Left to right** too. With **As drawn** the 3D house takes the place where you drew it. Put the order right first: the lining up is always relative to the storey below.
- Sloping roof: under **Sloping roof**, tick the sides of the drawing where the roof comes down, or choose **Like the roof of the house**. Set the height of the knee wall and the pitch. In 3D the walls then follow the slope, windows in a low knee wall get lower, and in the house view the top level lies under the roof. With a flat roof on the house, that level simply stays a storey of the house, and in the house view its walls and roof slope on those sides. With an attic above a storey that slopes on both slopes of a gable roof (a house with its first floor half in the roof), the roof of the house starts on the knee wall of that storey, at the pitch you set there: one slope from the gutter to the ridge, with room for all the solar panels.
- Roof terrace or balcony: draw it as a room called Roof terrace, Terrace or Balcony on that level (untick **Walls around this room** if you like). With **Shape of the house** following the floor plan, it lies open on the flat roof below in 3D. Low walls you draw round it stand there at their height; without them a railing runs along the free edges.

### Garage, shed and garden

- Garage and shed: make a level called Garage, Shed, Schuur or Tuinhuis. It stands as a building of its own in the garden of the 3D house, with the size of the rooms you draw in it. Tap it to open it. Under **House**, at **Garage and shed**, choose whether it stands beside the house, at the back of the garden, or not at all, and whether it has a gable roof or a flat roof.
- The garden: make a level called Garden (or choose **The garden** under **In the 3D house**). Draw the garden in the same place as the house: on a garden level the ground floor shows dashed, so draw the back garden behind that dashed line (on the side of the back wall). What falls over the dashed line stands inside the house in 3D.
- A room called Shed, Garden house or Garage on the garden level becomes a small building with walls and a flat roof where you drew it, with the doors and windows you put in its walls.
- Areas on the garden level look the part by their name: lawn, pond, border, gravel and paving. Walls you draw become fences or low walls. When you draw fences or walls of your own, HomeDeck leaves out its own hedges, trees and shrubs.

### Starting from a picture

Choose **Picture** and add a floor plan (an image or PDF, for example from the estate agent). Set the scale by measuring one known length. The editor recognises walls, rooms, doors and windows, also where walls run at an angle and where rooms are filled with a dark colour, such as a garage or a tiled bathroom. This happens in your browser; nothing is sent anywhere.

Check the result: curved walls are not recognised, a door right by a corner is sometimes missed (then two rooms run into each other) and an unclear drawing can give mistakes.

### Calendar

Choose **Calendar**, then **Add calendar**, and paste an iCal link. For Google Calendar you find it under *Settings → your calendar → Secret address in iCal format*; Outlook and iCloud have a similar sharing link. Give the calendar a name and a colour and choose **Save**. The events show in the side panel of the dashboard and the widget. The links stay on your Homey.

## Setting up your house

Under **House** you set how your home looks from outside.

- Type: detached, semi-detached, corner house, terraced or flat (apartment). For a flat you choose the storey it is on and how many storeys the block has above it; it then stands in a block with neighbours on both sides and a flat roof.
- Shape of the house: **Simple block** or **Follows the floor plan**. With the real shape the walls follow your rooms, extensions included. Choose which side is the front as well. The roof lies on the biggest rectangular part, the other parts get a flat roof. The doors and windows in the outer walls of your floor plan sit at the same place in the facade; without drawn windows they are spread evenly.
- Front door: it goes on the door you drew in the front wall (the middle one if there are more). With more doors drawn in the outer walls, choose at **Front door** which one it is, also a door in a side wall; the lamp above the front door goes with it. Without a drawn door, choose at **Place of the front door**: left, left of the middle, middle, right of the middle or right.
- Roof, ridge direction, pitch and the direction of the front. That direction is used for the sun and the solar forecast.
- Lower parts: with the house in the shape of the floor plan, an extension or a former garage can get a sloping roof that falls away from the building it leans against, with a flat strip at the low end if you want one. For each room, **Roof over this room in the 3D house** gives it a flat or sloping roof of its own, for example a shed that should stay flat.
- Facade: dark plaster, white plaster or brick.
- Around the house: garden, path and driveway, or nothing for a calm view.
- Carport, dormer and extension. The dormer goes on the front or the back of the roof, and is normal, wide, as wide as the roof, or a ridge raise: that roof slope then goes up to a higher ridge, with roof windows in it. For a normal or wide dormer you also give its width and its place from the middle. The chimney can be switched off. Solar panels go beside the dormer, on the wider side, and on the other slope when the dormer takes the whole one.
- At night: choose how light the house is after sunset: dark, normal or light.
- Neighbours (semi-detached, corner house, terraced, flat): their roof, width, depth and position in line with the front can be set, to match the real ones. They can also look like your house, mirrored, with a front door, windows, chimney and dormer.
- Garden: what you drew on the garden level appears in the 3D house (see [Garage, shed and garden](#garage-shed-and-garden)). Switch it off with **Show the garden I drew**. This works with the house in the shape of the floor plan.
- Grid connection and air conditioner: the meter cupboard with the grid connection goes on the left or right of the front, on a side wall, or on the outer wall by the room called Meter cupboard (Meterkast). The outdoor unit of the air conditioner hangs on the outer wall nearest to where you placed the air conditioner in the plan, on its storey; or you choose the front (left or right) or a side wall of the upper storey. A side wall against a neighbour cannot be used. In a terraced or semi-detached house the roof does not overhang beside the neighbours, and a full-width dormer reaches theirs. An air conditioner that reports no power of its own takes the reading of an energy meter whose name contains Airco. A door in an outer wall wider than 2 m stands as a sectional garage door in 3D. With a garage door in the front wall and no carport, the car stands in front of that door and the charger hangs beside it. Beside a neighbour the grid cabinet stands in front of the meter cupboard instead of beside the house. The dormer also works with the ridge running front to back: choose the left or right slope, and its place counts from the middle towards the back. The windows in the dormer light up with the lamps of the top storey. An air conditioner meter without an on/off switch (for instance a meter that was given the class air conditioner) counts as running while it draws power.
- Outdoor lamps: with the house in the shape of the floor plan, an outdoor lamp you place on the garden level, or on the ground floor by an outer wall, stands at that spot in 3D. A plug set as a lamp, or a dimmable plug, counts as a lamp too. A lamp on the wall hangs at the height you gave it in the plan, and an LED strip is a thin bar along the wall, as long as you drew it. A car you put on the garden level is drawn as a real car in the 3D house, in the colours you chose. Other outdoor lamps stand at fixed places by the front door, the path, the driveway and in the garden, by their name.
- Solar panels: the number, and on the sunny side of the roof or on both roof halves, such as east-west. The solar forecast then uses both directions. If your panels lie with the long side across the slope, choose Landscape under **Panels lie**. Under **Panels in a row** give the number for a layout like 3 × 3 + 1 (10 panels at 3 per row). Under **Panels on** you can also choose the roof of a room with a gable roof of its own, such as a garage or extension, on the sunny slope or one you pick; the panels only appear when that slope is long enough.
- Prefer your own house? Use a photo and draw what can be tapped.

Parts such as panels, battery, car, heat pump and air conditioning appear by themselves when Homey has such a device. For each part you can choose Automatic, Always or Never. With a flat roof, the heat pump can also lie flat on the roof. Without a carport, **Side of the driveway, car and charger** puts them on the left or the right; a garage door in the front wall also gets a driveway in front of it. The home battery and the heat pump each have a **Side** (left or right). In the 3D house, tap the garden, the terrace or a shed you drew to open that level. An air conditioner that reports no power of its own (or always 0 W) takes the reading of an energy meter with "airco" in its name. A device also counts as an air conditioner when you placed it in the plan with the model **Air conditioner indoor unit**, or when a climate device has "airco" in its name; its outdoor unit then hangs, also on Automatic, on the outer wall of that storey nearest to the indoor unit. Fan coil units without an outdoor unit? Set the air conditioner to Never. To hide the cables between the parts, untick **Cables between the parts**. For each room, **Roof over this room in the 3D house** gives a flat or sloping roof, or a gable roof of its own with the ridge along the long side of the room, to an extension, a garage with a storey on it or a shed with nothing on top. On such a gable roof you can also choose a **Dormer on this roof**: the front or back slope when the ridge runs along the front, the left or right slope when it runs front to back. The dormer stands in the middle of the ridge and its window lights up with the lamps of that room; solar panels on that roof go beside the dormer. The windows in a dormer light up with the lamps of the room behind them. When the chimney stands on the slope with the solar panels, the panels go beside it if they all fit there. Free walls on the garden level without a height of their own are a metre high, or as high as the wall height of that level when that is lower; set it to 0 for no walls in the garden. A sloping roof of a room falls away from the building it leans against by default; in the room panel choose **The roof falls towards** the back (garden), front, left or right (seen from the front of the house), for example for a garden shed with a lean-to roof. With a flat roof the panels stand tilted towards the south: choose **The panels look at** another side when they lie differently in reality. With **Panels per row** the rows on a flat roof stand closer together when your layout would not fit otherwise; if the roof really is too small, HomeDeck makes the rows shorter. A room on a garden level called **perceel**, **kavel**, **erf**, **plot** or **parcel** is the outline of your plot: it gets no floor, the hedge runs along its edge (not along the street) and the trees and shrubs HomeDeck puts there itself stay inside that outline. The cables of the panels run in straight pieces along the roof and the facade. The hourly weather forecast shows a moon at night instead of a sun.

At the bottom of the House panel you also choose:

- **Buttons on the dashboard**: which moods and Flows show as a button in the strip at the top of the dashboard. A Flow button needs the card from [Flows](#flows).
- **Variables on the dashboard**: which Logic variables you see on the dashboard.

## The dashboard

- **House**: your home with the values in rows above and below it. Tap a value or part for its page with chart, forecast and costs. Tap a storey to go inside.
- The lines show the power: yellow is solar, grey-blue the grid, green the battery and light blue what is used.
- **Storeys**: the button beside the tabs switches between 2D, 3D and 2.5D. Tap a lamp to switch or dim it. Tap a room to zoom in, with the room card beside it; closing the card zooms back out. In 3D, walls stop the light of a lamp. Rooms joined by an open wall share their light.
- **Side panel**: clock, weather, calendar, the camera, today's meal and your variables. Under the gear you choose which camera shows, or none.
- **Music**: your speakers are on the right in the side column, or above the plan when that column is off. Choose a speaker with the buttons below it. Under the gear you choose which speakers show.

### The strip at the top

- On the left only what needs attention: an alarm, open windows and doors (with a warning when rain is coming), low batteries, the bins and energy advice, such as the cheapest hours. Tap it to see which devices it is about.
- The bins come from the app Trashcan Reminder 2.0. Without it, HomeDeck looks in your calendar for events with words such as bin, trash or garbage.
- On the right are the buttons: your moods and Flows, and **Lists**, **Climate**, **Alarm** (when you have one), **Vacuum** (when you have one) and **Variables**.
  - **Lists**: shopping, tasks and the meals of the week, shared between all screens.
  - **Climate**: all rooms with a temperature, with the target and mode of the thermostat.
  - **Alarm**: on, partly or off. When the alarm goes off, or a device reports smoke, CO or water, it takes over every screen.
  - **Vacuum**: start, stop and back to the dock. For a room you can choose a Flow in the editor that vacuums only that room. The button can go under the gear.
- **I'm leaving** shows what is open, what is not locked and which lamps are on, with a button to turn all lamps off. You tap twice, so it cannot happen by accident. Untick a lamp that should stay on; this screen remembers it.

Dimmable devices count as lamps, even when their app reports them as a socket. For I'm leaving, devices with lamp, light or a similar word in their name count as well. Other plugs, such as a fridge, stay on.

### Doorbell and camera

A doorbell (a device of the doorbell class, or with doorbell in its name) shows a message over the whole screen when it rings, with the camera image when the doorbell has a camera. Cameras show a snapshot that refreshes regularly, not a video stream.

### Hot water boiler

A boiler known to Homey is a card on the facade, with its temperature. Tap it for the target and the hot water left. Turn it on or off under **House** in the editor.

## Settings of this screen

Under the gear you choose per screen:

- Light or dark: light, dark, as this device, or with the sun.
- Start screen: the house or a storey, and after how many minutes without a touch the screen goes back there.
- View, turn, light glow, tint rooms by temperature or humidity, furniture, names and values beside devices.
- Tapping a device: show its controls or switch it at once. Zoom in on a room you tap.
- Side panel on the right, below, or **Energy beside it** for a big screen. Which camera and speakers show in it.
- The vacuum button, and who is home.
- **Clock after 5 minutes**: off, at night or always. A calm clock with the temperature that slowly moves over the screen.
- **Simple view** for slower tablets.
- **Guest view**: for visitors and children, without editing or unlocking. The gear then asks for the edit PIN first.
- **Name of this screen**: with a name the choices are kept on your Homey. Another tablet takes them over with `?screen=name` after the address, and a Flow can address this screen on its own.

## The widget

Add the **Floor plan** widget to a Homey dashboard. In the widget settings you choose the plan, the level, whether it starts on the floor plan or on the house with its energy, the view (2D or 2.5D), the turn, the light glow, tinting rooms by temperature or humidity, furniture, names and values, what a tap on a device does, and a side panel on the right or below with weather and calendar. **Height** sets its proportions. The widget follows Homey's dark or light mode. ⤢ opens the full dashboard.

## Energy

If you already have Energy Dashboard, the Energy button opens that app, with its own settings and history. Without it, the Energy page is built in, at `http://<your-homey>:8687/energy/`. Under the gear there you choose devices, contract and prices.

## Flows

Triggers:

- **A HomeDeck button is pressed**: pick one of your buttons. Homey does not let an app start a Flow itself, so a Flow button on the dashboard only works when the Flow starts with this card. In an advanced Flow, add it as an extra start card.
- **There is power to spare** and **The cheapest hours start**: for the washing, the dishwasher or charging the car.

Actions:

- **Show on the screens**: the camera, a message, the house, a storey or the Energy page, on all screens or on one named screen, for a number of seconds (0: until someone taps).
- **Put on a list**: something on the shopping list or the task list.
- **Shower started**, **Shower finished** and **Hot tap water comes from**: for the blocks of the Energy page, see the hint on the card.

## Security

In the app settings you can set an access code for the web page and a PIN for changes. Without an access code, anyone on your home network can open the dashboard and control devices. A browser asks for the access code once; `?code=…` after the link works too.

## Backup

In the editor, under Backup (in the panel of a level), you can export everything to one file and import it again: your plans, calendars, lists and screens. Before each update the app also makes a copy of its own, which you can restore there. If you remove the app, everything is gone except the file you exported yourself.

Lost your plan? On the start screen (when no plan is left) you find the same Backup, with the copies the app made before every update: choose one to restore it.

## Problems and feedback

### Feedback

HomeDeck is still a test version, so all feedback is more than welcome: what works, what is odd and what you miss. Reply in the [forum topic](https://community.homey.app/t/161491).

If something is wrong with a device, use **Report a problem**: the ! at the top right of the dashboard, or in the app settings. It makes an anonymous report without names or address. Send that report to the maker by mail or private message, not in the topic.

### Frequently asked

- The dashboard does not open: use the IP address of your Homey with port 8687 (`http://192.168.1.20:8687/`), on a device in the same home network. The links in the app settings have the right address. If the page asks for a code, an access code is set in the app settings.
- My house looks too tall: choose a level that is no storey of the house as garden, garage, shed or nothing under **In the 3D house**.
- The levels are in the wrong order or stand shifted on each other: see [Levels](#levels).
- Everything jumps to the wall: hold Shift while dragging, or turn **Snapping** off. See [Snapping and fixing in place](#snapping-and-fixing-in-place).
- A Flow button only gives a red flash or a message: start the Flow with the card **A HomeDeck button is pressed**.
- A piece of furniture is back to front: select it and turn it with the turn buttons or R.
- The solar forecast is off: check the direction of the front, the ridge direction and the place of the panels under House, and turn the solar forecast on.
- A device is missing or acts oddly: send a report with **Report a problem**.
