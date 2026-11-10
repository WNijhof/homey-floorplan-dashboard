# HomeDeck manual

HomeDeck puts your whole home on one screen: your house in 3D, your energy, and every storey as a live floor plan. The app runs on your Homey Pro and shows everything as a web page in your own home network, so any screen with a browser works.

This is still a test version. Things can go wrong, and all feedback is more than welcome. See [Feedback](#feedback).

You can look around without installing anything: [the demo](https://wnijhof.github.io/homey-floorplan-dashboard/).

## Getting started

1. Install the [test version](https://homey.app/a/com.drpeppers.floorplandashboard/test/).
2. In the Homey app, open *Apps → HomeDeck → Settings* and choose **Open editor**. The editor is at `http://<your-homey>:8687/editor`. It works best on a computer or tablet.
3. Choose **Quick start from Homey zones**. Your zones become levels and rooms, and every device starts in its room. You can also start blank, or from an estate agent's floor plan (see below).
4. Set up your house under **House** in the left bar.
5. Open the dashboard at `http://<your-homey>:8687/` on a tablet, laptop or phone, or add the **Floor plan** widget to a Homey dashboard.

## The editor

The left bar holds the tools: Select, Room, Walls, Doors, Windows, Open wall, Furniture, Devices, Measure, Picture, Calendar and House.

- Rooms: drag a rectangle. Drag the corners to change the shape. For an L-shape, pull a blue plus on the edge, or choose **Make L-shaped**. Alt-click a corner to remove it. A room without a name gets no label; to keep a room's name off the plan, such as for a built-in cupboard, untick **Show the name on the plan**.
- Doors and windows go on a wall. For a window you set its bottom and top (for a tall window or a French door), for a door its height. Link a contact sensor, or a switch (a virtual one too), and the door or window shows open while it is on.
- Half-high wall, fence or balcony: draw a free wall with **Walls**, fill in a height and choose wall, fence or glass at **Made of**.
- Furniture comes from a catalogue. A colour you choose goes on the main part of the piece, such as the fabric of a sofa, the top of a table, or the body and fronts of a kitchen unit. A TV on the wall (without a stand) is under Media as **Wall TV**. Near a wall it turns its back to the wall by itself; use the turn buttons to adjust it.
- Stairs: select quarter-turn or spiral stairs and choose **Mirror the stairs** to make the turn go the other way.
- Speakers: select a speaker and choose a box under **Shown as**. It then stands as a model on the plan and in 3D.
- Open kitchen or passage: choose **Open wall** and click the wall between two rooms. Choose the width or **Open the whole wall**. Both rooms keep their own name and temperature. An open wall in an outer wall (a drive-through, a carport) is an open gap in the 3D house, from the ground up to the storey above.
- One open space in parts: when your living room, dining room and kitchen are one space, or when you draw the walls yourself, turn off **Walls around this room** for that room. The room keeps its name, temperature and floor but gets no walls of its own. A wall it shares with a room that does have walls stays.
- Curved wall: select a free wall and choose one of the curve buttons. To curve a room edge, add corners with the blue plusses.
- Order of the levels: click an empty spot beside the plan and choose **Move level down** or **Move level up**.
- Several spots on one switch: select the device and choose **Place this device again**, or copy and paste it.
- Shape of the 3D house: under **House**, choose **Simple block** or **Follows the floor plan** at **Shape of the house**. With the real shape the walls follow your rooms, extensions included. Storeys stand on each other by themselves, also when you moved a level in the editor. Choose which side is the front as well. The roof lies on the biggest rectangular part, the other parts get a flat roof. The doors and windows in the outer walls of your floor plan sit at the same place in the facade; without drawn windows they are spread evenly. The front door goes on the door you drew in the front wall (the middle one if there are more). With more doors drawn in the outer walls, choose at **Front door** which one it is, also a door in a side wall; the lamp above the front door goes with it. Without a drawn door, choose at **Place of the front door**: left, left of the middle, middle, right of the middle or right.
- Storeys on each other: when the ground floor has an extension and the storey above stands wrong because of it, click an empty spot beside the plan on that storey and, under **In the 3D house**, choose **Front walls in line** at **Front to back** (or back walls, or in the middle), and if needed at **Left to right** too.
- Drag devices to their place. For lamps you choose the kind: ceiling, pendant, wall, floor or table lamp.
- A TV from Homey hangs on the wall as a flat TV; its screen lights up when it is on, and a tap turns it on or off.
- A thermostat or air conditioner can look like a wall thermostat, a radiator valve, a fan coil unit or an air conditioner indoor unit: select it and choose under **Shown as**. An air conditioner hangs as an indoor unit high on the wall by itself, and you can choose it as the thermostat of a room.
- When a door or window no longer stands in a wall, for example after you made a room bigger, drag it to the wall or choose **Line up all walls**. Loose doors and windows with no wall near are not drawn in 3D.
- A switch with more buttons (in Homey for example onoff.2) shows each extra button as a device of its own in the list, with the number or name of that button after it. That way you link a lamp to the button that switches it.
- Starting from a picture or PDF: set the scale by measuring one known length. The editor recognises walls, rooms, doors and windows, also where walls run at an angle and where rooms are filled with a dark colour, such as a garage or a tiled bathroom. This happens in your browser; nothing is sent anywhere. Check the result: curved walls are not recognised, a door right by a corner is sometimes missed (then two rooms run into each other) and an unclear drawing can give mistakes.
- Sloping roof: click an empty spot beside the plan and, under **Sloping roof**, tick the sides of the drawing where the roof comes down, or choose **Like the roof of the house**. Set the height of the knee wall and the pitch. In 3D the walls then follow the slope, windows in a low knee wall get lower, and in the house view the top level lies under the roof. With a flat roof on the house, that level simply stays a storey of the house, and in the house view its walls and roof slope on those sides.
- Roof terrace or balcony: draw it as a room called Roof terrace, Terrace or Balcony on that level (untick **Walls around this room** if you like). With **Shape of the house** following the floor plan, it lies open on the flat roof below in 3D. Low walls you draw round it stand there at their height; without them a railing runs along the free edges.
- What a level is: click an empty spot beside the plan and choose under **In the 3D house** whether it is a storey of the house, the garden, a garage or shed of its own, or something that is not in the 3D house (a cellar, a storage room). Without a choice the name decides: Garden, Front garden, Back garden, Backyard, Terrace and Driveway are garden; Basement and Cellar are not in the 3D house. Only storeys stack up as floors of the house.
- Garage and shed: make a level called Garage, Shed, Schuur or Tuinhuis. It stands as a building of its own in the garden of the 3D house, with the size of the rooms you draw in it. Tap it to open it. Under **House**, at **Garage and shed**, choose whether it stands beside the house, at the back of the garden, or not at all, and whether it has a gable roof or a flat roof. For the garden itself, make a level called Garden.
- Colours: wherever you choose a colour you get the colour picker, a field to type a code (#rrggbb), a row of ready-made colours and a button back to the theme.
- Pictures of your own floor and walls: select a room. Under **Floor look** you choose a picture for the floor, under **Walls (inside)** a colour and/or a picture for the walls. Give the real width and height of what the picture shows (one tile, a few planks, one repeat of the wallpaper): it repeats at that size, in the plan and in 3D, and the shift and turn set where it starts. A picture is made smaller when you choose it (at most 768 px). The plan holds about 4 MB in all; the editor shows how much the pictures take.
- Painting parts of a wall: under **Walls (inside)** choose all walls of the room, or one wall (it lights up in the plan) that gets a look of its own. Add **bands**: a strip of the wall between two heights in cm with its own colour, for example a painted wainscot from 0 to 90 cm. Adding or removing a corner keeps the paint with its wall. Walls show their paint in the 3D room view; the plan and the 2.5D view show the floors.
- Decals: under **Furniture**, at **Decals**, add a picture or a coloured area on the floor (a rug, a mural, a terrace pattern) or against a wall (a painting, a panel). Give the real width and height; with the ratio kept the other side follows the picture. A decal on the floor can be turned, made round and made see-through; one on a wall hangs against the nearest wall at the height you choose and snaps to a wall when you drag it.
- Colours of furniture: each material of a model has its own colour field (a sofa and its legs, a table and its top), and a finish: matte, satin, glossy or metal. **Reset the colours** gives the model its own colours back.
- Cabinets to size: under Cabinets and shelves, **Display cabinet, steel frame with glass** and **Cabinet with doors, own size** are drawn in 3D from what you set: width, depth and height, one to four hinged doors, how much of each door is glass (from the top), shelves behind the glass, handles, the colours of the frame, the doors and the glass, and the finish.
- Draw the garden in the same place as the house in the plan: on a garden level the ground floor shows dashed, so draw the back garden behind that dashed line (on the side of the back wall). What falls over the dashed line stands inside the house in 3D. A room called Shed, Garden house or Garage on the garden level becomes a small building with walls and a flat roof where you drew it, with the doors and windows you put in its walls.

Handy: Ctrl+C and Ctrl+V copy and paste, Delete removes, and Space with dragging moves the view.

## Setting up your house

Under **House** you set how your home looks from outside.

- Type: detached, semi-detached, corner house, terraced or flat (apartment). For a flat you choose the storey it is on and how many storeys the block has above it; it then stands in a block with neighbours on both sides and a flat roof.
- Roof, ridge direction, pitch and the direction of the front. That direction is used for the sun and the solar forecast.
- Facade: dark plaster, white plaster or brick.
- Around the house: garden, path and driveway, or nothing for a calm view.
- Carport, dormer and extension. The dormer goes on the front or the back of the roof, and is normal, wide, as wide as the roof, or a ridge raise: that roof slope then goes up to a higher ridge, with roof windows in it. For a normal or wide dormer you also give its width and its place from the middle. The chimney can be switched off. Solar panels go beside the dormer, on the wider side, and on the other slope when the dormer takes the whole one.
- At night: choose how light the house is after sunset: dark, normal or light.
- Neighbours (semi-detached, corner house, terraced, flat): their roof, width, depth and position in line with the front can be set, to match the real ones. They can also look like your house, mirrored, with a front door, windows, chimney and dormer.
- Lower parts: with the house in the shape of the floor plan, an extension or a former garage can get a sloping roof that falls away from the building it leans against, with a flat strip at the low end if you want one.
- Garden: the rooms, plants, things and walls of a level called garden, terrace or driveway appear in the 3D house (lawn, pond, border, gravel and paving by name; fences and low walls from the walls you drew). Switch it off with "Show the garden I drew". This works with the house in the shape of the floor plan.
- Grid connection and air conditioner: the meter cupboard with the grid connection goes on the left or right of the front, on a side wall, or on the outer wall by the room called Meter cupboard (Meterkast). The outdoor unit of the air conditioner hangs on the outer wall nearest to where you placed the air conditioner in the plan, on its storey; or you choose the front (left or right) or a side wall of the upper storey. A side wall against a neighbour cannot be used. An air conditioner that reports no power of its own takes the reading of an energy meter whose name contains Airco. A door in an outer wall wider than 2 m stands as a sectional garage door in 3D.
- Outdoor lamps: with the house in the shape of the floor plan, an outdoor lamp you place on the garden level, or on the ground floor by an outer wall, stands at that spot in 3D. A plug set as a lamp, or a dimmable plug, counts as a lamp too. Other outdoor lamps stand at fixed places by the front door, the path, the driveway and in the garden, by their name.
- Solar panels: the number, and on the sunny side of the roof or on both roof halves, such as east-west. The solar forecast then uses both directions.
- Prefer your own house? Use a photo and draw what can be tapped.

Levels with a name such as Other, Basement, Shed or Garage, or Garden, Back garden or Terrace, do not count as a storey of the house. They keep their own tab. When the name does not fit, choose it yourself under **In the 3D house**.

Parts such as panels, battery, car, heat pump and air conditioning appear by themselves when Homey has such a device. For each part you can choose Automatic, Always or Never. With a flat roof, the heat pump can also lie flat on the roof. Without a carport, **Side of the driveway, car and charger** puts them on the left or the right; a garage door in the front wall also gets a driveway in front of it. The home battery and the heat pump each have a **Side** (left or right). In the 3D house, tap the garden, the terrace or a shed you drew to open that level. An air conditioner that reports no power of its own (or always 0 W) takes the reading of an energy meter with "airco" in its name. Fan coil units without an outdoor unit? Set the air conditioner to Never. To hide the cables between the parts, untick **Cables between the parts**. For each room, **Roof over this room in the 3D house** gives a flat or sloping roof to an extension or shed with nothing on top.

## The dashboard

- **House**: your home with the values in rows above and below it. Tap a value or part for its page with chart, forecast and costs. Tap a storey to go inside.
- The lines show the power: yellow is solar, grey-blue the grid, green the battery and light blue what is used.
- **Storeys**: the button beside the tabs switches between 2D, 3D and 2.5D. Tap a lamp to switch or dim it. Tap a room to zoom in, with the room card beside it; closing the card zooms back out. In 3D, walls stop the light of a lamp. Rooms joined by an open wall share their light.
- **Music**: your speakers are on the right in the side column, or above the plan when that column is off. Choose a speaker with the buttons below it. Under the gear you choose which speakers show.
- The strip at the top only shows what needs attention, such as an open window, the bins or the cheapest hours. With the app Trashcan Reminder 2.0, the bins come from there. Otherwise HomeDeck looks in your calendar for events with words such as bin, trash or garbage.
- The buttons in that strip show what they are about: the battery button the devices with a low battery, the button for open doors and windows what is open.
- **I'm leaving** shows what is open, what is not locked and which lamps are on, with a button to turn all lamps off. You tap twice, so it cannot happen by accident. Untick a lamp that should stay on; this screen remembers it.
- **Variables**: Logic variables you choose in the editor are on the dashboard to read. You change them in Homey or with a Flow.
- **Hot water boiler**: a boiler known to Homey is a card on the facade, with its temperature. Tap it for the target and the hot water left. Turn it on or off under **House** in the editor.

Dimmable devices count as lamps, even when their app reports them as a socket. For I'm leaving, devices with lamp, light or a similar word in their name count as well. Other plugs, such as a fridge, stay on.

## Settings of this screen

Under the gear you choose per screen: light or dark, what it starts with, the view, zooming in on a room, the vacuum button, the side column, which camera shows in the side column (or none), the speakers, the night clock and the guest view. Give a screen a name and a new tablet takes over all choices with one link.

## Energy

If you already have Energy Dashboard, the Energy button opens that app, with its own settings and history. Without it, the Energy page is built in, at `http://<your-homey>:8687/energy/`. Under the gear there you choose devices, contract and prices.

## Flows

HomeDeck has Flow cards to show something on a screen and to add something to a list, and triggers for spare power and cheap power.

Flow buttons on the dashboard: Homey does not always let an app start a Flow. Then start the Flow with the card **A HomeDeck button is pressed** and choose the button; the button then starts it.

## Security

In the app settings you can set an access code for the web page and a PIN for changes. Without an access code, anyone on your home network can open the dashboard and control devices.

## Backup

In the editor, under Backup, you can export everything to one file and import it again. Before each update the app also makes a copy of its own, which you can restore there. If you remove the app, everything is gone except the file you exported yourself.

## Problems and feedback

### Feedback

HomeDeck is still a test version, so all feedback is more than welcome: what works, what is odd and what you miss. Reply in the [forum topic](https://community.homey.app/t/161491).

If something is wrong with a device, use **Report a problem**: the ! at the top right of the dashboard, or in the app settings. It makes an anonymous report without names or address. Send that report to the maker by mail or private message, not in the topic.

### Frequently asked

- My house looks too tall: give levels that are no storey of the house a name such as Other or Basement.
- A piece of furniture is back to front: select it and turn it. A correction in this version can make furniture you turned by hand stand the wrong way.
- The solar forecast is off: check the direction of the front, the ridge direction and the place of the panels under House, and turn the solar forecast on.
