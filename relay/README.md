# Foutmeldingen naar GitHub

De kleine online functie tussen HomeDeck en GitHub. De app stuurt alleen iets als de gebruiker dat aanzet, en dan alleen een opgeschoonde foutmelding. Deze functie controleert alles opnieuw en maakt per soort fout één issue in een **privé-repo**. De GitHub-sleutel staat hier, nooit in de app.

Er worden geen IP-adressen of andere gegevens van afzenders bewaard; in de opslag staan alleen tellers per dag, die na twee dagen verlopen.

## Eenmalig opzetten

1. Maak op GitHub een **privé**-repo, bijvoorbeeld `homedeck-errors`.
2. Maak een fine-grained token dat alleen bij die repo mag, met alleen de rechten **Issues: read and write**.
3. Maak een gratis account op cloudflare.com en log hier in met `npx wrangler login`.
4. Maak de opslag voor de tellers en zet het id in `wrangler.toml`:
   ```bash
   cd relay
   npx wrangler kv namespace create LIMITS
   ```
5. Zet de naam van je repo in `wrangler.toml` bij `GITHUB_REPO`.
6. Zet het token online, en publiceer:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler deploy
   ```
7. Zet het adres dat `wrangler deploy` toont bij `ENDPOINT` in `lib/ErrorReporter.js`. Zolang dat leeg is, verlaat er niets de Homey.

## Grenzen

Maximaal 300 meldingen en 30 nieuwe issues per dag, en 20 meldingen per soort fout. Daarboven antwoordt de functie 429 en gebeurt er niets. In de app: maximaal 5 meldingen per uur en 20 per dag.
