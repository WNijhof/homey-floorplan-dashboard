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

The left bar holds the tools: Select, Room, Walls, Doors, Windows, Furniture, Devices, Measure, Picture, Calendar and House.

- Rooms: drag a rectangle. Drag the corners to change the shape. For an L-shape, pull a blue plus on the edge, or choose **Make L-shaped**. Alt-click a corner to remove it.
- Doors and windows go on a wall.
- Furniture comes from a catalogue. Near a wall it turns its back to the wall by itself; use the turn buttons to adjust it.
- Drag devices to their place. For lamps you choose the kind: ceiling, pendant, wall, floor or table lamp.
- Starting from a picture or PDF: set the scale by measuring one known length. The editor recognises walls, rooms, doors and windows. This happens in your browser; nothing is sent anywhere.

Handy: Ctrl+C and Ctrl+V copy and paste, Delete removes, and Space with dragging moves the view.

## Setting up your house

Under **House** you set how your home looks from outside.

- Type: detached, semi-detached or terraced.
- Roof, ridge direction, pitch and the direction of the front. That direction is used for the sun and the solar forecast.
- Facade: dark plaster, white plaster or brick.
- Around the house: garden, path and driveway, or nothing for a calm view.
- Carport, dormer and extension.
- Solar panels: the number, and on the sunny side of the roof or on both roof halves, such as east-west. The solar forecast then uses both directions.
- Prefer your own house? Use a photo and draw what can be tapped.

Levels with a name such as Other, Basement, Shed or Garage, or Garden or Terrace, do not count as a storey of the house. They keep their own tab.

Parts such as panels, battery, car, heat pump and air conditioning appear by themselves when Homey has such a device. For each part you can choose Automatic, Always or Never.

## The dashboard

- **House**: your home with the values in rows above and below it. Tap a value or part for its page with chart, forecast and costs. Tap a storey to go inside.
- The lines show the power: yellow is solar, grey-blue the grid, green the battery and light blue what is used.
- **Storeys**: the button beside the tabs switches between 2D, 3D and 2.5D. Tap a lamp to switch or dim it.
- The strip at the top only shows what needs attention, such as an open window, the bins or the cheapest hours.
- **I'm leaving** shows what is open, what is not locked and which lamps are on, with a button to turn all lamps off. You tap twice, so it cannot happen by accident.
- **Variables**: Logic variables you choose in the editor are on the dashboard to read. You change them in Homey or with a Flow.

Dimmable devices count as lamps, even when their app reports them as a socket. For I'm leaving, devices with lamp, light or a similar word in their name count as well. Other plugs, such as a fridge, stay on.

## Settings of this screen

Under the gear you choose per screen: light or dark, what it starts with, the view, the side column, the night clock and the guest view. Give a screen a name and a new tablet takes over all choices with one link.

## Energy

If you already have Energy Dashboard, the Energy button opens that app, with its own settings and history. Without it, the Energy page is built in, at `http://<your-homey>:8687/energy/`. Under the gear there you choose devices, contract and prices.

## Flows

HomeDeck has Flow cards to show something on a screen and to add something to a list, and triggers for spare power and cheap power.

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
