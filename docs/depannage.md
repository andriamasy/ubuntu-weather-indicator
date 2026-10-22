# Dépannage

## L’indicateur n’apparaît pas

1. Vérifiez l’environnement :

```bash
ubuntu-weather-indicator diagnose
```

2. Fermez la session puis rouvrez-la après l’installation. GNOME Shell ne voit pas une extension ajoutée pendant qu’il tourne déjà.
3. Activez l’extension depuis votre session, pas avec sudo :

```bash
ubuntu-weather-indicator enable
```

4. Consultez l’erreur exacte :

```bash
gnome-extensions info ubuntu-weather-indicator@lunix
journalctl --user -b -t gnome-shell | grep ubuntu-weather
```

## GNOME Shell a refusé l’extension

Si `État` vaut `ERREUR`, lisez le message. Les causes fréquentes sont un schéma non compilé ou une version de Shell différente.

```bash
glib-compile-schemas /usr/share/gnome-shell/extensions/ubuntu-weather-indicator@lunix/schemas
glib-compile-schemas /usr/share/glib-2.0/schemas
```

Puis désactivez et réactivez l’extension. Ne relancez pas le shell avec les privilèges root.

## Pas de température

Sans ville, l’indicateur montre une icône de lieu et le texte « lieu non défini ». Ce n’est pas une panne : aucune température fictive n’est affichée.

Choisissez une ville dans les préférences. Si le réseau ou Open-Meteo est indisponible et qu’aucune donnée valide n’a encore été enregistrée, l’icône hors ligne reste affichée sans chiffre.

## Deux icônes

Il ne doit y avoir qu’un rôle `ubuntu-weather-indicator` dans le panneau. Désactivez puis réactivez l’extension. Le journal ne doit pas contenir `Extension point conflict`.

## Après une mise à jour de GNOME Shell

Si Ubuntu passe à GNOME Shell 51 ou plus, le paquet refuse de s’installer et l’extension déjà présente peut être ignorée par le Shell. Consultez `compat/supported.json` avant de modifier `shell-version`.
