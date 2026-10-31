# Handleiding HomeDeck

HomeDeck zet je hele huis op één scherm: je huis in 3D, je energie en elke verdieping als live plattegrond. De app draait op je Homey Pro en toont alles als webpagina in je eigen thuisnetwerk, dus elk scherm met een browser werkt.

Dit is nog een testversie. Er kan iets niet goed gaan, en alle feedback is meer dan welkom. Zie [Feedback](#feedback).

Eerst kijken kan zonder installeren: [de demo](https://wnijhof.github.io/homey-floorplan-dashboard/).

## Beginnen

1. Installeer de [testversie](https://homey.app/a/com.drpeppers.floorplandashboard/test/).
2. Open in de Homey-app *Apps → HomeDeck → Instellingen* en kies **Editor openen**. De editor staat op `http://<jouw-homey>:8687/editor`. Dat werkt het prettigst op een computer of tablet.
3. Kies **Snelle start vanuit Homey-zones**. Je zones worden verdiepingen en kamers, en elk apparaat staat meteen in zijn kamer. Je kunt ook leeg beginnen of een plattegrond van de makelaar gebruiken (zie hieronder).
4. Stel onder **Huis** in de linkerbalk je huis in.
5. Open het dashboard op `http://<jouw-homey>:8687/` op een tablet, laptop of telefoon, of zet de widget **Plattegrond** op een Homey-dashboard.

## De editor

In de linkerbalk staan de gereedschappen: Selecteren, Kamer, Muren, Deuren, Ramen, Open muur, Meubels, Apparaten, Meten, Afbeelding, Agenda en Huis.

- Kamers: sleep een rechthoek. Sleep de hoeken om de vorm aan te passen. Voor een L-vorm trek je aan een blauwe plus op de rand, of je kiest **Maak L-vorm**. Met Alt-klik op een hoek haal je die weg.
- Deuren en ramen plaats je op een muur.
- Open keuken of doorgang: kies **Open muur** en klik op de muur tussen twee kamers. Kies de breedte of **Hele muur open**. Beide kamers houden hun eigen naam en temperatuur.
- Gebogen muur: selecteer een losse muur en kies een van de buigknoppen. Een kamerrand buig je door met de blauwe plussen hoeken toe te voegen.
- Volgorde van verdiepingen: klik naast de plattegrond op een leeg stuk en kies **Verdieping lager** of **Verdieping hoger**.
- Meerdere spots op één schakelaar: selecteer het apparaat en kies **Dit apparaat nog een keer plaatsen**, of kopieer en plak het.
- Meubels komen uit een catalogus. Bij een muur draaien ze vanzelf met hun achterkant ernaartoe; met de draaiknoppen zet je ze goed.
- Apparaten sleep je naar hun plek. Bij lampen kies je de soort: plafond-, hang-, wand-, staande of tafellamp.
- Begin je met een afbeelding of pdf, zet dan de schaal door één bekende lengte te meten. De editor herkent muren, kamers, deuren en ramen. Dat gebeurt in je browser; er wordt niets verstuurd.

Handig: Ctrl+C en Ctrl+V kopiëren en plakken, Delete verwijdert, en Spatie met slepen verschuift het beeld.

## Je huis instellen

Onder **Huis** stel je in hoe je huis er van buiten uitziet.

- Soort woning: vrijstaand, twee-onder-een-kap of tussenwoning.
- Dak, nokrichting, hellingshoek en de richting van de voorgevel. Die richting is nodig voor de zon en de zonneverwachting.
- Gevel: donker stucwerk, wit stucwerk of baksteen.
- Rond het huis: tuin, pad en oprit, of niets voor een rustig beeld.
- Carport, dakkapel en aanbouw.
- Zonnepanelen: het aantal, en op de zonnigste dakhelft of op beide dakhelften, zoals oost-west. De zonneverwachting rekent dan met beide richtingen.
- Liever je eigen huis? Gebruik een foto en teken waar je op kunt tikken.

Verdiepingen die bijvoorbeeld Overig, Kelder, Schuur of Garage heten, of Tuin of Terras, tellen niet mee als verdieping van het huis. Ze blijven wel een eigen tabblad.

Onderdelen zoals panelen, accu, auto, warmtepomp en airco verschijnen vanzelf als Homey zo'n apparaat heeft. Per onderdeel kun je kiezen voor Automatisch, Altijd of Nooit.

## Het dashboard

- **Huis**: je huis met de waarden in rijen erboven en eronder. Tik op een waarde of onderdeel voor de pagina met grafiek, verwachting en kosten. Tik op een verdieping om naar binnen te gaan.
- De lijnen tonen de stroom: geel is zon, grijsblauw het net, groen de accu en lichtblauw het verbruik.
- **Verdiepingen**: met de knop rechts naast de tabbladen wissel je tussen 2D, 3D en 2.5D. Tik op een lamp om te schakelen of te dimmen.
- De strook bovenaan toont alleen wat aandacht vraagt, zoals een open raam, de container of de goedkoopste uren. Heb je de app Afval Herinnering 2.0 (bijvoorbeeld voor Rova), dan komt de container daaruit. Anders zoekt HomeDeck in je agenda naar afspraken met woorden als container, afval, gft of pmd.
- **Ik ga weg** laat zien wat open staat, wat niet op slot is en welke lampen aan zijn, met een knop om alle lampen uit te doen. Je tikt twee keer, zodat het niet per ongeluk gebeurt.
- **Variabelen**: Logic-variabelen die je in de editor kiest, staan op het dashboard om te lezen. Veranderen doe je in Homey of met een Flow.

Dimbare apparaten tellen als lamp, ook als hun app ze als stopcontact meldt. Bij Ik ga weg tellen ook apparaten met lamp, licht of verlichting in de naam mee. Andere stekkers, zoals een koelkast, blijven aan.

## Dit scherm instellen

Onder het tandwiel kies je per scherm: licht of donker, waarmee het start, de weergave, de zijkolom, de nachtklok en de gastweergave. Geef je een scherm een naam, dan neemt een nieuwe tablet alle keuzes over met één link.

## Energie

Heb je Energie Dashboard al, dan opent de knop Energie die app, met zijn eigen instellingen en geschiedenis. Zonder die app is de Energiepagina ingebouwd, op `http://<jouw-homey>:8687/energy/`. Onder het tandwiel daar kies je apparaten, contract en prijzen.

## Flows

HomeDeck heeft Flow-kaarten om iets op een scherm te tonen en iets aan een lijstje toe te voegen, en triggers voor stroom over en goedkope stroom.

## Beveiliging

In de app-instellingen kun je een toegangscode voor de webpagina en een pincode voor wijzigingen instellen. Zonder toegangscode kan iedereen in je thuisnetwerk het dashboard openen en apparaten bedienen.

## Back-up

In de editor kun je onder Back-up alles exporteren naar één bestand en weer importeren. Vóór elke update maakt de app ook zelf een kopie, die je daar kunt terugzetten. Verwijder je de app, dan is alles weg behalve je eigen geëxporteerde bestand.

## Problemen en feedback

### Feedback

HomeDeck is nog een testversie, dus alle feedback is meer dan welkom: wat werkt, wat raar is en wat je mist. Reageer in het [forumtopic](https://community.homey.app/t/161490).

Klopt er iets niet met een apparaat, gebruik dan **Probleem melden**: de ! rechtsboven in het dashboard, of in de app-instellingen. Dat maakt een anoniem rapport zonder namen of adres. Stuur dat rapport naar de maker per mail of privébericht, en niet in het topic.

### Veelgestelde vragen

- Mijn huis ziet er te hoog uit: geef verdiepingen die geen verdieping van het huis zijn een naam als Overig of Kelder.
- Een meubel staat achterstevoren: selecteer het en draai het. Door een correctie in deze versie kunnen meubels die je eerder met de hand hebt gedraaid, nu verkeerd staan.
- De zonneverwachting klopt niet: controleer de richting van de voorgevel, de nokrichting en de plaats van de panelen onder Huis, en zet de zonneverwachting aan.
