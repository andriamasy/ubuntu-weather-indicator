# Indicateur météo Ubuntu

Extension GNOME Shell native pour Ubuntu. Elle affiche la température à côté de l’horloge et un menu de prévisions. Le paquet Debian installe cette extension : il n’embarque pas Electron, ni navigateur, ni service permanent.

Les données viennent de l’API gratuite [Open-Meteo](https://open-meteo.com/), sans clé, pour un usage personnel non commercial (moins de 10 000 requêtes par jour, licence CC BY 4.0).

## Environnement

| | Version |
| --- | --- |
| Testé | Ubuntu 26.04.1 LTS (Resolute), GNOME Shell 50.1, Wayland, gjs 1.88 |
| Accepté par le paquet | Ubuntu 26.04 et GNOME Shell 50.x |
| Supposé compatible | rien d’autre |
| Refusé | toute autre version majeure de GNOME Shell, et toute autre distribution |

GNOME Shell 50 a retiré X11. Le paquet interrompt son installation si la détection échoue, au lieu d’activer une extension incompatible.

## Installation

```bash
./scripts/test.sh
./scripts/package-deb.sh
./scripts/validate-deb.sh
sudo apt install ./dist/ubuntu-weather-indicator_1.1.0_all.deb
```

Fermez ensuite la session et rouvrez-la. GNOME Shell 50 ne détecte une extension ajoutée qu’au démarrage : l’indicateur n’apparaît pas dans une barre déjà ouverte. Puis, sans sudo :

```bash
ubuntu-weather-indicator enable
```

Le paquet est `Architecture: all` : le logiciel est en JavaScript, sans binaire compilé.

## Mise à jour

```bash
sudo apt install ./dist/ubuntu-weather-indicator_NOUVELLE_all.deb
```

Les réglages restent dans dconf (`/org/gnome/shell/extensions/ubuntu-weather-indicator/`). Le paquet ne contient pas ces données et ne les réinitialise pas.

## Désinstallation

```bash
./scripts/uninstall.sh
```

Ou, depuis votre session puis avec sudo :

```bash
gnome-extensions disable ubuntu-weather-indicator@lunix
sudo apt remove ubuntu-weather-indicator
```

`apt remove` et `apt purge` retirent les fichiers du système. Ils ne suppriment ni les réglages dconf, ni `~/.cache/ubuntu-weather-indicator/`. Pour les effacer vous-même :

```bash
dconf reset -f /org/gnome/shell/extensions/ubuntu-weather-indicator/
rm -rf "${XDG_CACHE_HOME:-$HOME/.cache}/ubuntu-weather-indicator"
```

## Utilisation

L’indicateur est dans la même zone que l’horloge, juste avant elle par défaut. Le clic ouvre la ville, les températures, le vent, l’humidité, les précipitations, les 24 prochaines heures et les 7 jours. Les préférences permettent de changer la ville, les unités, l’intervalle (10 à 180 minutes), l’icône, la température, le côté de l’horloge et le démarrage avec la session.

La localisation automatique est désactivée par défaut. L’activer demande une autorisation du système, puis envoie uniquement des coordonnées arrondies au kilomètre à Open-Meteo.

## Vérification réalisée

Sur cette machine (Ubuntu 26.04.1, GNOME Shell 50.1, Wayland) :

- 18 tests Node et le chargement des modules par gjs réussissent.
- Le paquet `dist/ubuntu-weather-indicator_1.0.0_all.deb` est construit. `lintian` ne signale pas d’erreur. `sudo apt install` n’a pas été exécuté : le mot de passe administrateur est demandé.
- La session déjà ouverte ne recharge pas une extension copiée après son démarrage. Le test d’horloge a donc utilisé un GNOME Shell 50.1 headless, avec un moniteur virtuel 1280×800, et l’extension empaquetée.
- L’accessibilité du panneau a mesuré, sur la même ligne : `Météo, 16°` à x=526, largeur 85, et l’horloge `22 oct. 18:30` à x=623. L’écart entre les deux est de 12 px. Le journal indique `Indicator placed on the center of the panel at index 0, beside the clock`.
- La température 16° vient d’Open-Meteo (15,7 °C, code 3, couvert, 24 heures, 7 jours). Le menu français contenait le ressenti, l’humidité, le vent et les prévisions. Sans ville, aucune température n’est fabriquée.
- Ce test n’est pas la barre de la session actuellement ouverte. Elle affichera l’indicateur après installation du paquet et réouverture de session.

## Dépannage

Voir [docs/depannage.md](docs/depannage.md).

```bash
ubuntu-weather-indicator diagnose
```

## Développement

```text
extension/          extension GNOME Shell 50
extension/lib/      analyse météo, unités, cache, testable sans interface
bin/                détection d’environnement et commandes utilisateur
packaging/          scripts Debian
scripts/            compilation, paquet, validation, test de session
po/                 français et anglais
tests/              tests Node et essai de chargement GJS
```

```bash
./scripts/test.sh
./scripts/package-deb.sh
./scripts/session-test.sh
```

`session-test.sh` active réellement l’extension dans la session GNOME, vérifie qu’un seul indicateur est à côté de l’horloge, puis retire cette installation de test.

Pour ajouter un fournisseur : [docs/fournisseurs.md](docs/fournisseurs.md).

## Licence

Code : GPL-3.0-or-later. Données météo : Open-Meteo, CC BY 4.0. L’icône d’application est en CC0.
