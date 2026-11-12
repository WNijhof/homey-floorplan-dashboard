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

- Kamers: sleep een rechthoek. Sleep de hoeken om de vorm aan te passen. Voor een L-vorm trek je aan een blauwe plus op de rand, of je kiest **Maak L-vorm**. Met Alt-klik op een hoek haal je die weg. Een kamer zonder naam krijgt geen label; wil je de naam van een kamer niet op de plattegrond, zoals bij een inbouwkast, haal dan het vinkje **Naam tonen op de plattegrond** weg.
- Deuren en ramen plaats je op een muur. Bij een raam stel je de onderkant en bovenkant in (voor een hoog raam of een openslaande deur), bij een deur de hoogte. Koppel een contactsensor, of een schakelaar (ook een virtuele), dan staat de deur of het raam open zolang die aan staat. Koppel je een rolluik of zonwering aan een raam, dan komt die in het 3D-huis net zo ver voor het raam te hangen als hij dicht is (0% is helemaal dicht, 100% helemaal open); dat werkt met **Vorm van het huis** op de plattegrond, waar je eigen ramen staan.
- Halfhoge muur, hek of balkon: teken een losse muur met **Muren**, vul een hoogte in en kies bij **Gemaakt van** muur, hek of glas.
- Open keuken of doorgang: kies **Open muur** en klik op de muur tussen twee kamers. Kies de breedte of **Hele muur open**. Beide kamers houden hun eigen naam en temperatuur. Een open muur in een buitenmuur (een doorrit, een carport) is in het 3D-huis een open gat van de grond tot de verdieping erboven.
- Open ruimte in delen: bestaat je woonkamer, eetkamer en keuken uit één ruimte, of teken je de muren liever zelf, zet dan bij die kamer **Muren om deze kamer** uit. De kamer houdt zijn naam, temperatuur en vloer, maar krijgt geen eigen muren. Een muur die hij deelt met een kamer die wel muren heeft, blijft staan.
- Gebogen muur: selecteer een losse muur en kies een van de buigknoppen. Een kamerrand buig je door met de blauwe plussen hoeken toe te voegen.
- Volgorde van verdiepingen: klik naast de plattegrond op een leeg stuk en kies **Verdieping lager** of **Verdieping hoger**.
- Meerdere spots op één schakelaar: selecteer het apparaat en kies **Dit apparaat nog een keer plaatsen**, of kopieer en plak het.
- Vorm van het 3D-huis: kies onder **Huis** bij **Vorm van het huis** tussen **Eenvoudig blok** en **Volgens de plattegrond**. Bij de werkelijke vorm volgen de muren je kamers, met uitbouw en al. Verdiepingen komen vanzelf op elkaar te staan, ook als je een verdieping in de editor hebt verschoven. Kies daarbij welke kant de voorkant is. Het dak ligt op het grootste rechthoekige deel en de andere delen krijgen een plat dak. De deuren en ramen in de buitenmuren van je plattegrond staan op dezelfde plek in de gevel; zonder getekende ramen worden ze gelijkmatig verdeeld. De voordeur komt op de deur die je in de voorgevel tekende (de middelste als er meer zijn). Heb je meer deuren in de buitenmuren getekend, dan kies je bij **Voordeur** welke het is, ook een deur in een zijgevel; de lamp boven de voordeur gaat mee. Zonder getekende deur kies je bij **Plek van de voordeur**: links, links van het midden, midden, rechts van het midden of rechts.
- Verdiepingen op elkaar: heeft de begane grond een uitbouw en staat de verdieping erboven daardoor verkeerd, klik dan op die verdieping naast de plattegrond op een leeg stuk en kies onder **In het 3D-huis** bij **Voor naar achter** voor **Voorgevels gelijk** (of achtergevels, of in het midden), en zo nodig ook bij **Links naar rechts**.
- Meubels komen uit een catalogus. Een kleur die je kiest krijgt het hoofddeel van het meubel, zoals de stof van een bank of het blad van een tafel, of de kast en fronten van een keukenkast. Een tv aan de muur (zonder voet) staat bij Media als **Tv aan de muur**. Bij een muur draaien ze vanzelf met hun achterkant ernaartoe; met de draaiknoppen zet je ze goed.
- Trap: selecteer een kwartslagtrap of wenteltrap en kies **Trap spiegelen** om de bocht de andere kant op te laten lopen.
- Speakers: selecteer een speaker en kies onder **Weergave** een box. Die staat dan als model op de plattegrond en in 3D.
- Apparaten sleep je naar hun plek. Bij lampen kies je de soort: plafond-, hang-, wand-, staande of tafellamp.
- Een tv uit Homey hangt als platte tv aan de muur; het scherm licht op als hij aan staat, en met een tik zet je hem aan of uit.
- Een thermostaat of airco kan er als wandthermostaat, radiatorknop, fancoil of airco-binnenunit uitzien: selecteer hem en kies onder **Weergave**. Een airco staat vanzelf als binnenunit hoog aan de muur, en je kiest hem ook als thermostaat van een kamer. Stapt de doeltemperatuur niet met de goede stap (bijvoorbeeld hele graden bij een airco, of 0,1° bij een Tado), kies dan in de kamer bij **Stap van de doeltemperatuur** 0,1°, 0,5° of 1°.
- Staat een deur of raam niet meer in een muur, bijvoorbeeld nadat je een kamer groter maakte, sleep hem dan naar de muur of kies **Alle muren uitlijnen**. Losse ramen en deuren zonder muur in de buurt worden in 3D niet getekend.
- Een schakelaar met meer knoppen (in Homey bijvoorbeeld onoff.2) staat per extra knop als eigen apparaat in de lijst, met het nummer of de naam van die knop erachter. Zo koppel je een lamp aan de knop die hem schakelt.
- Begin je met een afbeelding of pdf, zet dan de schaal door één bekende lengte te meten. De editor herkent muren, kamers, deuren en ramen, ook bij muren die schuin lopen en bij kamers die donker zijn ingekleurd, zoals een garage of een betegelde badkamer. Dat gebeurt in je browser; er wordt niets verstuurd. Controleer het resultaat: gebogen muren worden niet herkend, een deur vlak bij een hoek wordt soms gemist (dan lopen twee kamers in elkaar over) en een onduidelijke tekening kan fouten geven.
- Schuin dak: klik naast de plattegrond op een leeg stuk en vink bij **Schuin dak** de kanten van de tekening aan waar het dak naar beneden komt, of kies **Zoals het dak van het huis**. Stel de hoogte van het knieschot en de helling in. In 3D lopen de muren dan schuin mee, ramen in een laag knieschot worden lager, en in het huisaanzicht ligt de bovenste verdieping onder het dak. Heeft het huis een plat dak, dan blijft die verdieping gewoon een laag van het huis, en in het huisaanzicht lopen de muren en het dak aan die kanten schuin. Ligt er een zolder boven een verdieping met schuine kanten aan beide dakvlakken van een zadeldak (een huis met de eerste verdieping half in het dak), dan begint het dak van het huis op het knieschot van die verdieping, met de helling die je daar instelde: één doorlopend dakvlak van de goot tot de nok, met ruimte voor alle zonnepanelen.
- Dakterras of balkon: teken het als kamer met de naam Dakterras, Terras of Balkon op die verdieping (zet op wens **Muren om deze kamer** uit). Met **Vorm van het huis** op de plattegrond ligt hij in 3D open op het platte dak eronder. Lage muurtjes die je eromheen tekent staan er met hun hoogte bij; zonder muurtjes komt er een hekje langs de vrije kanten.
- Nis, entree of afdak: een kamer met **Muren om deze kamer** uit en een zijde waar niets tegenaan staat (geen andere kamer, geen muur die je erop tekende) hoort bij het 3D-huis niet bij het huisblok. Het huis krijgt dan een nis (de entree) of staat open (een afdak), de muren van de kamers eromheen zijn buitenmuren, en de deuren en ramen daarin staan dus ook in het 3D-huis. Wil je er toch een gesloten ruimte van maken, laat dan de muren aan.
- Wat een verdieping is: klik naast de plattegrond op een leeg stuk en kies onder **In het 3D-huis** of het een verdieping van het huis is, de tuin, een losse garage of schuur, of iets wat niet in het 3D-huis hoort (een kelder, een berging). Zonder keuze gaat het op de naam: Tuin, Voortuin, Achtertuin, Terras en Oprit zijn tuin; Kelder en Souterrain staan niet in het 3D-huis. Alleen verdiepingen stapelen als lagen van het huis.
- Garage en schuur: maak een verdieping met de naam Garage, Schuur, Tuinhuis of Berging. Die staat dan als eigen gebouwtje in de tuin van het 3D-huis, met de maat van de kamers die je erin tekent. Tik erop om hem te openen. Onder **Huis** kies je bij **Garage en schuur** of hij naast het huis, achter in de tuin of niet staat, en of hij een zadeldak of een plat dak heeft. Voor de tuin zelf maak je een verdieping met de naam Tuin.
- Kleuren: overal waar je een kleur kiest heb je de kleurkiezer, een veld om een code (#rrggbb) te typen, een rij kant-en-klare kleuren en een knop terug naar het thema.
- Afbeeldingen van je eigen vloer en muren: selecteer een kamer. Onder **Uiterlijk vloer** kies je een afbeelding voor de vloer, onder **Muren (binnenkant)** een kleur en/of afbeelding voor de muren. Geef de echte breedte en hoogte van wat de afbeelding laat zien (één tegel, een paar planken, één herhaling van het behang): ze herhaalt zich op die maat, in de plattegrond en in 3D, en met verschuiving en draaien bepaal je waar ze begint. Een afbeelding wordt bij het kiezen kleiner gemaakt (hooguit 768 px). Het plan kan samen zo’n 4 MB bevatten; de editor laat zien hoeveel de afbeeldingen innemen.
- Delen van een muur verven: kies onder **Muren (binnenkant)** alle muren van de kamer, of één muur (die licht op in het plan) met een eigen uiterlijk. Voeg **banden** toe: een strook van de muur tussen twee hoogtes in cm met een eigen kleur, bijvoorbeeld een geschilderde lambrisering van 0 tot 90 cm. Een hoek erbij of weg laat de verf bij zijn muur. Muren tonen hun verf in de 3D-kamerweergave; de plattegrond en het 2,5D-aanzicht tonen de vloeren.
- Decals: voeg onder **Meubels**, bij **Decals**, een afbeelding of gekleurd vlak toe op de vloer (een kleed, een muurschildering, een terraspatroon) of aan een muur (een schilderij, een paneel). Geef de echte breedte en hoogte; met de verhouding vast volgt de andere kant de afbeelding. Een decal op de vloer kun je draaien, rond maken en doorzichtig maken; een decal aan de muur hangt tegen de dichtstbijzijnde muur op de hoogte die je kiest en klikt vast tegen een muur als je hem sleept.
- Kleuren van meubels: elk materiaal van een model heeft een eigen kleurveld (een bank en zijn pootjes, een tafel en zijn blad) en een afwerking: mat, zijdeglans, glanzend of metaal. **Kleuren herstellen** geeft het model zijn eigen kleuren terug.
- Kasten op maat: onder Kasten en planken worden **Vitrinekast, stalen frame met glas** en **Kast met deuren, eigen maat** in 3D getekend naar wat je instelt: breedte, diepte en hoogte, één tot vier openslaande deuren, hoeveel van elke deur glas is (van boven), planken achter het glas, grepen, de kleuren van frame, deuren en glas, en de afwerking.
- De tuin teken je op dezelfde plek als het huis in de plattegrond: op een tuinverdieping zie je de begane grond gestippeld, dus teken de achtertuin achter die stippellijn (aan de kant van de achtergevel). Wat over de stippellijn heen valt, staat in 3D in het huis. Een kamer met de naam Schuur, Tuinhuis, Berging of Garage op de tuinverdieping wordt een gebouwtje met muren en een plat dak, waar je hem tekende, met de deuren en ramen die je in zijn muren zet.

Handig: Ctrl+C en Ctrl+V kopiëren en plakken, Delete verwijdert, en Spatie met slepen verschuift het beeld.

## Je huis instellen

Onder **Huis** stel je in hoe je huis er van buiten uitziet.

- Soort woning: vrijstaand, twee-onder-een-kap, hoekwoning, tussenwoning of appartement. Bij een appartement kies je op welke verdieping het ligt en hoeveel verdiepingen het blok erboven heeft; het staat dan in een blok met buren aan beide kanten en een plat dak.
- Dak, nokrichting, hellingshoek en de richting van de voorgevel. Die richting is nodig voor de zon en de zonneverwachting.
- Gevel: donker stucwerk, wit stucwerk of baksteen.
- Rond het huis: tuin, pad en oprit, of niets voor een rustig beeld.
- Carport, dakkapel en aanbouw. De dakkapel zit aan de voor- of achterkant van het dak, en is normaal, breed, zo breed als het dak, of een nokverhoging: dan gaat dat dakvlak omhoog naar een hogere nok, met dakramen erin. Bij een normale of brede dakkapel geef je ook de breedte en de plek vanaf het midden op. De schoorsteen kan uit. Zonnepanelen komen naast de dakkapel, aan de bredere kant, en op het andere dakvlak als de dakkapel het hele vlak inneemt.
- 's Avonds: kies hoe licht het huis na zonsondergang is: donker, normaal of licht.
- Buren (twee-onder-een-kap, hoekhuis, tussenwoning, flat): hun dak, breedte, diepte en plek ten opzichte van de voorgevel stel je in, zodat ze op de echte lijken. Ze kunnen ook op jouw huis lijken, gespiegeld, met voordeur, ramen, schoorsteen en dakkapel.
- Lagere delen: met het huis in de vorm van de plattegrond kan een uitbouw of een voormalige garage een schuin dak krijgen dat afloopt van het gebouw waar het tegenaan staat, op wens met een plat strookje aan de lage kant.
- Tuin: de ruimtes, planten, spullen en muren van een verdieping met de naam tuin, terras of oprit komen in het 3D-huis (gazon, vijver, border, grind en bestrating op naam; hekken en lage muren uit de muren die je tekende). Zet het uit met "Toon de tuin die ik getekend heb". Dit werkt met het huis in de vorm van de plattegrond.
- Netaansluiting en airco: de meterkast met de netaansluiting komt links of rechts aan de voorkant, op een zijgevel, of op de buitenmuur bij de kamer die Meterkast heet. De buitenunit van de airco hangt bij de buitenmuur waar je de airco in de plattegrond zette, op de verdieping waar hij staat; of je kiest de voorgevel (links of rechts) of een zijgevel van de bovenverdieping. Een zijgevel tegen een buurhuis kan niet. Meldt een airco zelf geen vermogen, dan telt de meting van een energiemeter met Airco in de naam. Een deur in een buitenmuur die breder is dan 2 m staat in 3D als sectionale garagedeur.
- Buitenlampen: met het huis in de vorm van de plattegrond staat een buitenlamp die je op de tuin-verdieping zet, of op de begane grond bij een buitenmuur, in 3D op die plek. Een stekker die je als lamp instelt, of een dimbare stekker, telt ook als lamp. Andere buitenlampen staan op vaste plekken bij de voordeur, het pad, de oprit en in de tuin, op naam. Een lamp aan de muur hangt op de hoogte die je in de plattegrond gaf, en een ledstrip is een smalle balk langs de muur, zo lang als je hem tekende. Een auto die je op de tuin-verdieping zet is in het 3D-huis een echte auto in de kleuren die je koos.
- Zonnepanelen: het aantal, en op de zonnigste dakhelft of op beide dakhelften, zoals oost-west. De zonneverwachting rekent dan met beide richtingen.
- Liever je eigen huis? Gebruik een foto en teken waar je op kunt tikken.

Verdiepingen die bijvoorbeeld Overig, Kelder, Schuur of Garage heten, of Tuin, Voortuin, Achtertuin of Terras, tellen niet mee als verdieping van het huis. Ze blijven wel een eigen tabblad. Klopt de naam niet, kies het dan zelf onder **In het 3D-huis**.

Onderdelen zoals panelen, accu, auto, warmtepomp en airco verschijnen vanzelf als Homey zo'n apparaat heeft. Per onderdeel kun je kiezen voor Automatisch, Altijd of Nooit. Heeft het huis een plat dak, dan kan de warmtepomp ook plat op het dak liggen. Zonder carport kies je bij **Kant van oprit, auto en laadpaal** links of rechts; een garagedeur in de voorgevel krijgt ook een oprit ervoor. De thuisaccu en de warmtepomp hebben elk een **Kant** (links of rechts). Tik in het 3D-huis op de tuin, het terras of een schuurtje dat je tekende om die verdieping te openen. Bij een rijtjeshuis of twee-onder-een-kap steekt het dak niet uit naast de buren en reikt een dakkapel over de volle breedte tot aan hun dakkapel. Een airco die zelf geen vermogen meldt (of altijd 0 W) neemt de meting over van een energiemeter met "airco" in de naam. Fancoils zonder buitenunit? Zet de airco dan op Nooit. Wil je de kabels tussen de onderdelen niet zien, zet dan **Kabels tussen de onderdelen** uit. Per kamer kies je bij **Dak boven deze kamer in het 3D-huis** een plat of schuin dak, of een eigen zadeldak (puntdak) met de nok in de lengte van de kamer, voor een aanbouw, een garage met een verdieping erop of een schuur waar niets bovenop staat. De dakkapel kan ook bij een nok van voor naar achter: je kiest dan het linker of rechter dakvlak, en de plek telt vanaf het midden naar achteren. De ramen in de dakkapel branden mee met de lampen van de kamer erachter. Staat de schoorsteen op het dakvlak met de zonnepanelen, dan komen de panelen ernaast als ze daar allemaal passen. Losse muren op de tuinverdieping zonder eigen hoogte zijn een meter hoog, of zo hoog als de muurhoogte van die verdieping als die lager is; zet je die op 0, dan staan er geen muren in de tuin. Staat er een buur naast het huis, dan komt het aansluitpunt van het net voor de meterkast in plaats van naast het huis. Zit er een garagedeur in de voorgevel en heb je geen carport, dan staat de auto voor die deur en hangt de laadpaal naast de deur.

## Het dashboard

- **Huis**: je huis met de waarden in rijen erboven en eronder. Tik op een waarde of onderdeel voor de pagina met grafiek, verwachting en kosten. Tik op een verdieping om naar binnen te gaan.
- De lijnen tonen de stroom: geel is zon, grijsblauw het net, groen de accu en lichtblauw het verbruik.
- **Verdiepingen**: met de knop rechts naast de tabbladen wissel je tussen 2D, 3D en 2.5D. Tik op een lamp om te schakelen of te dimmen. Tik op een kamer om in te zoomen, met de kaart van de kamer ernaast; sluit je de kaart, dan zoomt het beeld terug. In 3D houden muren het licht van een lamp tegen. Bij een open muur delen de kamers hun licht.
- **Muziek**: je speakers staan rechts in de zijkolom, of boven de plattegrond als die kolom uit staat. Kies een speaker met de knoppen eronder. Welke speakers er staan, kies je onder het tandwiel.
- De strook bovenaan toont alleen wat aandacht vraagt, zoals een open raam, de container of de goedkoopste uren. Heb je de app Afval Herinnering 2.0 (bijvoorbeeld voor Rova), dan komt de container daaruit. Anders zoekt HomeDeck in je agenda naar afspraken met woorden als container, afval, gft of pmd.
- De knoppen in die strook tonen waar het over gaat: de batterijknop de apparaten met een bijna lege batterij, de knop bij open deuren en ramen wat er open staat.
- **Ik ga weg** laat zien wat open staat, wat niet op slot is en welke lampen aan zijn, met een knop om alle lampen uit te doen. Je tikt twee keer, zodat het niet per ongeluk gebeurt. Moet een lamp aan blijven, vink die dan uit; dit scherm onthoudt dat.
- **Variabelen**: Logic-variabelen die je in de editor kiest, staan op het dashboard om te lezen. Veranderen doe je in Homey of met een Flow.
- **Warmwaterboiler**: een boiler die Homey kent staat als kaart op de gevel, met de temperatuur. Tik erop voor het doel en de warm water die nog over is. Aan of uit zet je onder **Huis** in de editor.

Dimbare apparaten tellen als lamp, ook als hun app ze als stopcontact meldt. Bij Ik ga weg tellen ook apparaten met lamp, licht of verlichting in de naam mee. Andere stekkers, zoals een koelkast, blijven aan.

## Dit scherm instellen

Onder het tandwiel kies je per scherm: licht of donker, waarmee het start, de weergave, inzoomen op een kamer, de knop voor de stofzuiger, de zijkolom, welke camera in de zijkolom staat (of geen), de speakers, de nachtklok en de gastweergave. Geef je een scherm een naam, dan neemt een nieuwe tablet alle keuzes over met één link.

## Energie

Heb je Energie Dashboard al, dan opent de knop Energie die app, met zijn eigen instellingen en geschiedenis. Zonder die app is de Energiepagina ingebouwd, op `http://<jouw-homey>:8687/energy/`. Onder het tandwiel daar kies je apparaten, contract en prijzen.

## Flows

HomeDeck heeft Flow-kaarten om iets op een scherm te tonen en iets aan een lijstje toe te voegen, en triggers voor stroom over en goedkope stroom.

Flowknoppen op het dashboard: Homey laat een app niet altijd een Flow starten. Begin de Flow dan met de kaart **Een HomeDeck-knop wordt ingedrukt** en kies de knop; dan start de knop hem wel.

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
