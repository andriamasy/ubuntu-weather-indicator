import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SoupJsonClient} from './client.js';
import {EXTENSION_UUID} from './lib/constants.js';
import {openMeteoProvider} from './lib/provider.js';
import {clampRefreshMinutes, rememberCity, savedCitiesFromState} from './lib/settings.js';

export default class UbuntuWeatherPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._settings = settings;
        this._client = new SoupJsonClient({
            warn: message => console.warn(`[ubuntu-weather-indicator] ${message}`),
        });
        this._resultRows = [];
        this._savedRows = [];
        this._searchToken = 0;
        this._searchDelay = 0;
        window.connect('close-request', () => {
            if (this._searchDelay) {
                GLib.source_remove(this._searchDelay);
                this._searchDelay = 0;
            }
            this._client?.destroy();
            this._client = null;
        });

        window.add(this._locationPage(settings));
        window.add(this._appearancePage(settings));
        window.add(this._behaviorPage(settings));
    }

    _locationPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Location'),
            icon_name: 'find-location-symbolic',
        });

        const current = new Adw.PreferencesGroup({
            title: _('Saved city'),
            description: _('Choose a city. No weather is shown until a location is set.'),
        });
        this._currentRow = new Adw.ActionRow({
            title: this._savedTitle(settings),
            subtitle: settings.get_boolean('manual-ready') ? _('Manual city') : _('No city selected'),
        });
        current.add(this._currentRow);
        page.add(current);

        this._savedGroup = new Adw.PreferencesGroup({title: _('Saved cities')});
        page.add(this._savedGroup);
        this._fillSaved(settings);

        const search = new Adw.PreferencesGroup({
            title: _('City'),
            description: _('Search uses the Open-Meteo geocoding service.'),
        });
        this._entry = new Adw.EntryRow({title: _('City name')});
        this._entry.connect('notify::text', () => this._scheduleSearch());
        this._entry.connect('entry-activated', () => this._searchNow());
        search.add(this._entry);
        const button = new Adw.ButtonRow({title: _('Search')});
        button.connect('activated', () => this._searchNow());
        search.add(button);
        this._searchStatus = new Adw.ActionRow({title: _('Type at least 2 characters.')});
        search.add(this._searchStatus);
        page.add(search);

        this._resultsGroup = new Adw.PreferencesGroup({title: _('Results')});
        page.add(this._resultsGroup);

        const automatic = new Adw.PreferencesGroup({
            title: _('Automatic location'),
            description: _('A system dialog asks for permission. City-level coordinates are sent only to Open-Meteo.'),
        });
        const autoRow = new Adw.SwitchRow({
            title: _('Automatic location'),
            active: settings.get_boolean('use-auto-location'),
        });
        autoRow.connect('notify::active', () => {
            settings.set_boolean('use-auto-location', autoRow.active);
        });
        automatic.add(autoRow);
        page.add(automatic);
        return page;
    }

    _appearancePage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'weather-clear-symbolic',
        });
        const units = new Adw.PreferencesGroup({title: _('Units')});
        units.add(this._combo(settings, 'temperature-unit', _('Temperature unit'), [
            [_('Celsius'), 'celsius'],
            [_('Fahrenheit'), 'fahrenheit'],
        ]));
        units.add(this._combo(settings, 'wind-speed-unit', _('Wind speed'), [
            [_('Kilometres per hour'), 'kmh'],
            [_('Metres per second'), 'ms'],
            [_('Miles per hour'), 'mph'],
            [_('Knots'), 'kn'],
        ]));
        units.add(this._combo(settings, 'pressure-unit', _('Pressure unit'), [
            [_('Hectopascals'), 'hpa'],
            [_('Inches of mercury'), 'inhg'],
        ]));
        page.add(units);

        const bar = new Adw.PreferencesGroup({title: _('Top bar')});
        const iconRow = new Adw.SwitchRow({
            title: _('Show the icon'),
            active: settings.get_boolean('show-icon'),
        });
        iconRow.connect('notify::active', () => settings.set_boolean('show-icon', iconRow.active));
        bar.add(iconRow);
        const tempRow = new Adw.SwitchRow({
            title: _('Show the temperature'),
            active: settings.get_boolean('show-temperature'),
        });
        tempRow.connect('notify::active', () => {
            settings.set_boolean('show-temperature', tempRow.active);
        });
        bar.add(tempRow);
        bar.add(this._combo(settings, 'bar-format', _('Top bar format'), [
            [_('Icon and temperature'), 'icon-temp'],
            [_('Temperature only'), 'temp'],
            [_('Icon only'), 'icon'],
            [_('Icon, temperature and city'), 'icon-temp-city'],
        ]));
        bar.add(this._combo(settings, 'clock-side', _('Position beside the clock'), [
            [_('Before the clock'), 'before'],
            [_('After the clock'), 'after'],
        ]));
        page.add(bar);

        const refresh = new Adw.PreferencesGroup({title: _('Updates')});
        const spin = new Adw.SpinRow({
            title: _('Refresh interval'),
            subtitle: _('Minutes between updates. Minimum 10.'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 180,
                step_increment: 5,
                page_increment: 15,
                value: settings.get_int('refresh-minutes'),
            }),
        });
        spin.connect('notify::value', () => {
            settings.set_int('refresh-minutes', clampRefreshMinutes(spin.value));
        });
        refresh.add(spin);
        page.add(refresh);
        return page;
    }

    _behaviorPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Behaviour'),
            icon_name: 'emblem-system-symbolic',
        });
        const session = new Adw.PreferencesGroup({
            title: _('Session'),
            description: _('The extension starts with the session while it is enabled. Turning this off disables it.'),
        });
        const autostart = new Adw.SwitchRow({
            title: _('Start with the session'),
            active: this._extensionEnabled(),
        });
        autostart.connect('notify::active', () => this._setAutostart(autostart.active));
        session.add(autostart);
        page.add(session);

        const about = new Adw.PreferencesGroup({
            title: _('About'),
            description: _('Free non-commercial Open-Meteo API. Personal use, fewer than 10 000 requests per day.'),
        });
        about.add(new Adw.ActionRow({
            title: 'Open-Meteo',
            subtitle: 'CC BY 4.0',
        }));
        about.add(new Adw.ActionRow({
            title: 'MET Norway',
            subtitle: _('Fallback forecast, no API key'),
        }));
        page.add(about);
        settings.set_boolean('autostart', this._extensionEnabled());
        return page;
    }

    _combo(settings, key, title, pairs) {
        const model = new Gtk.StringList();
        for (const [label] of pairs)
            model.append(label);
        const current = settings.get_string(key);
        const selected = Math.max(0, pairs.findIndex(([, value]) => value === current));
        const row = new Adw.ComboRow({
            title,
            model,
            selected,
        });
        row.connect('notify::selected', () => {
            const pair = pairs[row.selected];
            if (pair)
                settings.set_string(key, pair[1]);
        });
        return row;
    }

    _savedTitle(settings) {
        if (!settings.get_boolean('manual-ready'))
            return _('No city selected');
        const city = settings.get_string('city-name');
        const country = settings.get_string('country-name');
        return country ? `${city}, ${country}` : city;
    }

    _scheduleSearch() {
        if (this._searchDelay) {
            GLib.source_remove(this._searchDelay);
            this._searchDelay = 0;
        }
        this._searchDelay = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._searchDelay = 0;
            this._search().catch(error => this._searchFailed(error));
            return GLib.SOURCE_REMOVE;
        });
    }

    _searchNow() {
        if (this._searchDelay) {
            GLib.source_remove(this._searchDelay);
            this._searchDelay = 0;
        }
        this._search().catch(error => this._searchFailed(error));
    }

    async _search() {
        const query = this._entry.get_text().trim();
        this._clearResults();
        if (query.length < 2) {
            this._searchStatus.title = _('Type at least 2 characters.');
            return;
        }
        const token = ++this._searchToken;
        this._searchStatus.title = _('Searching…');
        let payload;
        try {
            const locale = GLib.get_language_names()?.[0] || 'en';
            payload = await this._client.getJson(openMeteoProvider.geocodingUrl(query, locale));
        } catch (error) {
            if (token === this._searchToken)
                this._searchFailed(error);
            return;
        }
        if (token !== this._searchToken)
            return;
        const cities = openMeteoProvider.parseGeocoding(payload);
        if (cities.length === 0) {
            this._searchStatus.title = _('No matching city.');
            return;
        }
        this._searchStatus.title = _('Results');
        for (const city of cities) {
            const subtitle = [city.admin, city.country].filter(Boolean).join(', ');
            const row = new Adw.ActionRow({
                title: city.name,
                subtitle,
                activatable: true,
            });
            row.connect('activated', () => this._selectCity(city));
            this._resultRows.push(row);
            this._resultsGroup.add(row);
        }
    }

    _searchFailed(error) {
        const code = error?.code || 'network';
        this._searchStatus.title = code === 'rate-limit'
            ? _('The weather service asked to slow down.')
            : _('Search failed.');
    }

    _fillSaved(settings) {
        for (const row of this._savedRows)
            this._savedGroup.remove(row);
        this._savedRows = [];
        const state = {
            savedCities: settings.get_string('saved-cities'),
            manualReady: settings.get_boolean('manual-ready'),
            cityName: settings.get_string('city-name'),
            countryName: settings.get_string('country-name'),
            adminName: settings.get_string('admin-name'),
            latitude: settings.get_double('latitude'),
            longitude: settings.get_double('longitude'),
            timezone: settings.get_string('timezone'),
        };
        const cities = savedCitiesFromState(state);
        this._savedGroup.visible = cities.length > 0;
        for (const city of cities) {
            const subtitle = [city.admin, city.country].filter(Boolean).join(', ');
            const row = new Adw.ActionRow({
                title: city.name,
                subtitle,
                activatable: true,
            });
            row.connect('activated', () => this._selectCity(city));
            this._savedRows.push(row);
            this._savedGroup.add(row);
        }
    }

    _selectCity(city) {
        const settings = this._settings;
        const state = {
            savedCities: settings.get_string('saved-cities'),
            manualReady: settings.get_boolean('manual-ready'),
            cityName: settings.get_string('city-name'),
            countryName: settings.get_string('country-name'),
            adminName: settings.get_string('admin-name'),
            latitude: settings.get_double('latitude'),
            longitude: settings.get_double('longitude'),
            timezone: settings.get_string('timezone'),
        };
        const list = rememberCity(savedCitiesFromState(state), city);
        settings.set_string('saved-cities', JSON.stringify(list));
        settings.set_string('city-name', city.name);
        settings.set_string('country-name', city.country);
        settings.set_string('admin-name', city.admin || '');
        settings.set_string('timezone', city.timezone || '');
        settings.set_double('latitude', city.latitude);
        settings.set_double('longitude', city.longitude);
        settings.set_boolean('manual-ready', true);
        settings.set_boolean('use-auto-location', false);
        settings.set_string('location-error', '');
        this._currentRow.title = city.country ? `${city.name}, ${city.country}` : city.name;
        this._currentRow.subtitle = _('Manual city');
        this._searchStatus.title = _('Saved city');
        this._fillSaved(settings);
    }

    _clearResults() {
        for (const row of this._resultRows)
            this._resultsGroup.remove(row);
        this._resultRows = [];
    }

    _extensionEnabled() {
        const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
        return shell.get_strv('enabled-extensions').includes(EXTENSION_UUID);
    }

    _setAutostart(enabled) {
        const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
        const current = shell.get_strv('enabled-extensions');
        const has = current.includes(EXTENSION_UUID);
        if (enabled && !has)
            shell.set_strv('enabled-extensions', [...current, EXTENSION_UUID]);
        else if (!enabled && has)
            shell.set_strv('enabled-extensions', current.filter(item => item !== EXTENSION_UUID));
        this._settings?.set_boolean('autostart', enabled);
    }
}
