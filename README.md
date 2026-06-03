# Taxi Beheer App

Een eenvoudige maar complete Nederlandstalige taxi administratie app voor een zelfstandige taxichauffeur of klein taxibedrijf. De app is mobile-first, responsive, PWA-ready en voorbereid om met Capacitor naar een Android APK te bouwen.

## Wat zit erin?

- Loginpagina met demo-inlog
- Dashboard met volgende rit, omzet, open betalingen en dagplanning
- Rittenbeheer: toevoegen, bekijken, bewerken, dupliceren, status wijzigen en soft delete
- Ritdetails met route, klantinfo, financiële info, notities, tijdlijn en snelle acties
- Klantenbeheer met klantdetails, favoriete adressen, financiële samenvatting en ritgeschiedenis
- Agenda met dag-, week-, maand- en lijstweergave
- Betalingen: openstaand, betaald, te factureren en markeren als betaald
- Rapporten: omzet vandaag/week/maand, open bedragen, ritten per dag, beste klanten en populaire bestemmingen
- Instellingen voor bedrijf, chauffeur, voertuig, tarieven, app, meldingen, donkere modus en back-up
- Prullenbak / archief met herstel en definitief verwijderen
- Lokale opslag via `localStorage`, zodat de MVP direct werkt zonder backend
- PWA manifest, service worker en app iconen
- Capacitor-configuratie voor Android
- GitHub Actions workflow om een ZIP uit te pakken
- GitHub Actions workflow om een debug APK te bouwen

## Techniek

- React 18
- Vite
- Capacitor 6
- PWA manifest + service worker
- CSS zonder externe UI-library
- Mock data + lokale opslag

## Installatie lokaal

```bash
npm install
npm run dev
```

Open daarna de lokale Vite URL die in de terminal verschijnt.

## Productiebouw

```bash
npm run build
npm run preview
```

De productie-build komt in de map `dist`.

## Android APK bouwen met Capacitor

Lokaal heb je Node.js, Java 17 en Android Studio / Android SDK nodig.

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

De debug APK staat daarna normaal in:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## GitHub Actions

### 1. Unzip project ZIP

Workflowbestand:

```text
.github/workflows/unzip.yml
```

Gebruik deze workflow als je een ZIP in de root van de repository plaatst en die automatisch wilt uitpakken. Start de workflow handmatig via **Actions → Unzip project ZIP** en vul de ZIP-naam in.

### 2. Build Android APK

Workflowbestand:

```text
.github/workflows/build-apk.yml
```

Deze workflow draait bij push naar `main` of `master`, en kan ook handmatig gestart worden via GitHub Actions. De APK wordt als artifact geüpload.

## PWA installeren

Na deploy via HTTPS kan de app op Android, iOS en desktop geïnstalleerd worden. De app bevat:

- `public/manifest.webmanifest`
- `public/sw.js`
- iconen in `public/icons/`
- offline cache voor de basis-app

## Data en privacy

Deze MVP gebruikt lokale browseropslag. Dat is handig om snel te testen, maar voor productie is een echte backend aanbevolen. De datamodellen in de app zijn voorbereid voor latere API-routes zoals:

- `GET /api/rides`
- `POST /api/rides`
- `PATCH /api/rides/{id}/status`
- `GET /api/customers/{id}/rides`
- `GET /api/payments/open`
- `GET /api/dashboard/summary`

Voor productie moet je minimaal toevoegen:

- echte authenticatie
- wachtwoord hashing
- server-side database
- HTTPS
- rollen en rechten
- back-upbeleid
- GDPR/privacy export en verwijdering

## Demo-gebruik

De login accepteert demo-gegevens die al ingevuld staan. De app start met voorbeeldklanten en voorbeeldritten, waaronder:

- Jan Peeters naar Brussels Airport
- Marie Janssens naar UZ Gent
- Ahmed El Amrani naar UZ Gent
- Sophie Maes naar Antwerpen

Gebruik de gele `+` knop voor snelle acties zoals nieuwe rit, nieuwe klant, betaling en notitie.
