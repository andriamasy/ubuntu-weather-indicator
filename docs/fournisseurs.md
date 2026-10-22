# Ajouter un fournisseur météo

Open-Meteo est le seul fournisseur livré. Le code qui parle au réseau est séparé de l’indicateur.

## Contrat

Un fournisseur est un objet dans `extension/lib/provider.js` :

- `id` : identifiant stable enregistré dans le réglage `provider`.
- `label` : nom affiché.
- `forecastUrl(location)` : URL HTTPS. `location` contient `latitude` et `longitude` déjà arrondies.
- `geocodingUrl(name, locale)` : URL HTTPS de recherche de ville, ou une fonction qui lève une erreur claire si le fournisseur n’a pas de géocodage.
- `parseForecast(payload)` : retourne `{ok: true, report}` ou `{ok: false, error: 'invalid'}`.
- `parseGeocoding(payload)` : retourne une liste de villes, ou une liste vide.

Le rapport doit utiliser les unités canoniques du projet :

- températures en degrés Celsius ;
- vent en km/h ;
- codes météo WMO quand le fournisseur les fournit ;
- aucune valeur inventée : un champ absent reste `null` ;
- si la température actuelle ou le code météo manque, `ok` vaut `false`.

`refreshWeather()` n’affiche le rapport que si `parseForecast` réussit. En cas d’erreur réseau, seule une réponse déjà validée pour le même lieu est réutilisée.

## Brancher le fournisseur

1. Ajoutez l’objet au tableau `PROVIDERS`.
2. N’introduisez pas de clé API dans le code, les journaux ou le paquet. Si un fournisseur exige une clé, lisez-la depuis le trousseau de l’utilisateur et ne la journalisez pas.
3. Ajoutez une préférence si l’utilisateur doit pouvoir le choisir. Le réglage `provider` existe déjà.
4. Ajoutez un test avec une réponse enregistrée dans `tests/fixtures/` et un test où la réponse est invalide.
5. Documentez les limites d’usage et la licence des données dans le menu, à côté de la mention Open-Meteo.
6. Gardez le délai d’attente et le cache : `WeatherService` appelle `fetchJson` avec l’URL fournie par le fournisseur.

Open-Meteo est utilisé ici pour un usage personnel non commercial, sans clé, avec moins de 10 000 requêtes par jour. L’intervalle minimal de l’extension est de 10 minutes.
