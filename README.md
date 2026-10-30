# HomeDeck voor Homey Pro (voorheen Plattegrond Dashboard)

Je hele huis op één scherm. Het dashboard opent op je huis in 3D (of je eigen foto), met zonnepanelen, accu, auto en warmtepomp op hun plek en rustige lijnen die laten zien waar de stroom heen gaat. Tik op een verdieping voor de live plattegrond in 2D en 3D, of op een onderdeel voor zijn pagina met de grafiek van vandaag. De Energiepagina heeft alle blokken van Energie Dashboard: prijzen, kosten, geschiedenis, Sankey, gas, water en de instellingen. Met klok, weer en agenda ernaast is het een compleet dashboard voor een tablet aan de muur.

Dit is nog een **testversie**: alle feedback is meer dan welkom, in het [forumtopic](https://community.homey.app/t/161490) ([English](https://community.homey.app/t/161491)). De [handleiding](docs/handleiding.md) ([manual in English](docs/manual.md)) legt alles uit.

**Probeer de demo:** https://wnijhof.github.io/homey-floorplan-dashboard/ (een voorbeeldhuis, zonder Homey; de editor staat onder het potloodje).

![Dashboard in 3D](docs/shots/nl-1-dashboard-3d.png)

Heb je **Energie Dashboard** al, dan opent de knop ⚡ Energie die app, met zijn eigen instellingen en geschiedenis. Zonder die app is de Energiepagina ingebouwd.

## Gebruiken

1. Installeer de app en open in de Homey-app *Apps → HomeDeck → Instellingen*.
2. Kies **Editor openen**: de editor is een webpagina in je thuisnetwerk (`http://<homey>:8687/editor`). Teken je huis daar op een computer of tablet; dat werkt veel prettiger dan in de Homey-app.
3. Stel in de editor onder **Huis** je huis in: soort woning, dak, gevel, omgeving, carport, zonnepanelen (ook oost-west), of je eigen foto met getekende klikgebieden.
4. Open het **dashboard** (`http://<homey>:8687/`) op een tablet, of zet de widget **Plattegrond** op een Homey-dashboard.
5. De **Energiepagina** staat op `http://<homey>:8687/energy/`, met de knop ⚡ Energie bovenaan het dashboard; onder het tandwiel daar kies je apparaten, contract en prijzen.

Optioneel in de instellingen: een **toegangscode** (elke browser vraagt er één keer om; `?code=…` achter de link werkt ook) en een **bewerk-pincode** (gevraagd voordat de plattegrond of agenda's veranderen). Zonder toegangscode kan iedereen in je thuisnetwerk het dashboard openen en apparaten schakelen.

## Onderdelen

| Onderdeel | Waar | Wat |
|---|---|---|
| Webserver | `lib/WebServer.js`, `lib/guard.js` | Dashboard en editor op poort 8687, toegangscode (cookie), bewerk-pincode, live-updates via Server-Sent Events |
| Dashboard | `web/index.html`, `web/dashboard.js` | Schermvullend; hergebruikt de widget; wisselknop, schermkeuzes (alleen voor dat scherm), volledig scherm, scherm wakker houden |
| Editor | `web/editor.html`, `web/editor.js` | Kamers, muren, deuren, ramen, meubels, apparaten, afbeelding overtrekken, agenda's |
| Homey-stub | `web/homey-web.js` | Laat widget- en editorcode zonder wijzigingen op de webpagina draaien (fetch, EventSource, pincode-dialoog) |
| Widget | `widgets/floorplan/` | Voor Homey-dashboards; ⤢ opent het volledige dashboard |
| Instellingen | `settings/index.html` | Links, poort, toegangscode, bewerk-pincode, status, gevonden zuster-apps |
| Renderer | `lib/shared/floorplan-core.js` | Geometrie, meubelcatalogus, 2D/2.5D SVG-renderer |
| Huis | `web/house3d.js`, `web/house-look.js`, `lib/shared/house-core.js` | Het huis van buiten in 3D, of als tekening (oude tablets) of eigen foto met klikgebieden; volgt de zon |
| Energie per onderdeel | `lib/EnergyHub.js`, `lib/EnergyDetails.js` | Kaarten op het huis, pagina's met de grafiek van vandaag en de zonneverwachting |
| Schermextra's | `web/dashboard-extras.js`, `web/dashboard-panels.js`, `web/theme.js` | Aandachtsstrip, "Ik ga weg", knoppen, klok 's nachts, deurbel, sirene, Flow-opdrachten, gastweergave, gesplitst scherm; panelen voor advies, alarm, klimaat, lijstjes, variabelen, camera's, aanwezigheid, media en stofzuiger; licht/donker (gedeeld met de Energiepagina) |
| Huisfuncties op de server | `lib/HouseExtras.js`, `lib/EnergyAdvice.js`, `lib/Backup.js` | Lijstjes, schermprofielen, aanwezigheid, Logic-variabelen, energieadvies, Flow-kaarten, back-up en kopie vóór een update |
| Foutmeldingen | `lib/ErrorReporter.js`, `relay/` | Standaard uit: anonieme fouten via een eigen functie naar een privé-repo (zie `relay/README.md`) |
| Energiepagina | `lib/EnergyEngine.js`, `lib/EnergyServer.js`, `web/energy/` | De app-logica en webpagina van Energie Dashboard onder `/energy/`, met eigen instellingen (`energy.*`) |
| App | `app.js`, `lib/DeviceHub.js`, `lib/PlanStore.js`, `lib/Calendar.js` | Homey Web API, live capability-updates, opslag, weer, iCal-agenda |

## Samenwerken met Energie Dashboard

De Energiepagina is de echte code van Energie Dashboard: `node scripts/sync-energy.js` kopieert `lib/energy/`, `web/energy/` (behalve `site.js`) en de demodata uit die repo, met een korte lijst aanpassingen die de sync bewaakt. Wijzig de originelen en sync opnieuw. Is de app Energie Dashboard geïnstalleerd, dan start de ingebouwde engine niet en leidt `/energy/` daarheen: zo draait niets dubbel en blijven instellingen en geschiedenis waar ze zijn. Er is geen migratie; een backup uit die app is wel in te lezen in de ingebouwde pagina.

Elke app heeft een app-API `GET /dashboard-link` (poort, draait hij, naam, icoon) en vraagt de ander op via `homey.api.getApiApp(…)` (permissie `homey:app:<andere app>`). De webpagina krijgt de lijst via `GET /api/siblings` en linkt naar hetzelfde adres met de poort van de ander. Elke poort is een eigen website: een toegangscode vul je per app één keer in.

## Ontwikkelen

```bash
npm install
npm test            # unit-tests: renderer, geometrie, iCal
npm run test:deep   # de echte app.js op een nagebootste Homey (test/fake-homey.js) in een echte browser: alle functies, losse tablets, storingen, schermformaten en een duurtest
npm run test:ui     # editor, dashboard en Energiepagina tegen de echte webserver, widget met een nep-Homey (headless Edge/Chrome)
npm run dev         # webserver met voorbeeldwoning: http://localhost:8687/, /editor en /energy/ (--code=…, --pin=…, --sibling-port=8686, --demo=nl, --hour=13)
npm run validate    # homey app validate --level publish
npm run run         # draaien op je Homey (homey app run)
```

De browsercode blijft ES2019 (Safari 12 op oudere wandtablets): controleer met `npx acorn --ecma2019 --silent <bestand>`.

Vóór publicatie: het e-mailadres van de auteur invullen in `.homeycompose/app.json`.

## Nog niet gebouwd

- Meerdere selectie, eigen 3D-modellen uploaden.
- Acties per object (flows/moods), heatmap over de afgelopen 24 uur.
- Echte videostreams (camera's tonen momentopnames die verversen).
