import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {SoupJsonClient} from './client.js';
import {EXTENSION_UUID} from './lib/constants.js';
import {openMeteoProvider} from './lib/provider.js';
import {clampAlertHours, clampRefreshMinutes, forgetCity, placeKey, rememberCity, savedCitiesFromState} from './lib/settings.js';

export default class UbuntuWeatherPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const settings = this.getSettings();
        this._settings = settings;
        this._client = new SoupJsonClient({
            warn: message => console.warn(`[ubuntu-weather-indicator] ${message}`),
        });
        this._resultRows = [];
        this._savedRows = [];
        this._settingsSignals = [];
        this._searchToken = 0;
        this._searchDelay = 0;
        this._closed = false;
        window.connect('close-request', () => {
            this._closed = true;
            if (this._searchDelay) {
                GLib.source_remove(this._searchDelay);
                this._searchDelay = 0;
            }
            for (const id of this._settingsSignals)
                this._settings?.disconnect(id);
            this._settingsSignals = [];
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

        this._savedGroup = new Adw.PreferencesGroup();
        page.add(this._savedGroup);
        this._fillSaved(settings);

        this._searchGroup = new Adw.PreferencesGroup({
            title: _('Add a city'),
            description: _('Search uses the Open-Meteo geocoding service.'),
        });
        this._entry = new Adw.EntryRow({title: _('City name')});
        this._entry.add_prefix(new Gtk.Image({
            icon_name: 'system-search-symbolic',
        }));
        this._spinner = new Gtk.Spinner({
            visible: false,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
        });
        this._entry.add_suffix(this._spinner);
        this._entry.connect('notify::text', () => this._scheduleSearch());
        this._entry.connect('entry-activated', () => this._searchNow());
        this._searchGroup.add(this._entry);
        page.add(this._searchGroup);

        this._resultsGroup = new Adw.PreferencesGroup({
            title: _('Results'),
            visible: false,
        });
        page.add(this._resultsGroup);

        const automatic = new Adw.PreferencesGroup({
            title: _('Automatic location'),
        });
        this._autoRow = new Adw.SwitchRow({
            title: _('Use automatic location'),
            subtitle: _('A system dialog asks for permission. City-level coordinates are sent only to Open-Meteo.'),
            active: settings.get_boolean('use-auto-location'),
        });
        this._autoRow.add_prefix(new Gtk.Image({
            icon_name: 'find-location-symbolic',
        }));
        this._autoRow.connect('notify::active', () => {
            if (settings.get_boolean('use-auto-location') === this._autoRow.active)
                return;
            settings.set_boolean('use-auto-location', this._autoRow.active);
            this._syncSavedDescription();
            this._refreshAutoPlace();
        });
        automatic.add(this._autoRow);
        this._autoPlaceRow = new Adw.ActionRow({visible: false});
        this._autoPlaceRow.add_prefix(new Gtk.Image({
            icon_name: 'mark-location-symbolic',
        }));
        automatic.add(this._autoPlaceRow);
        page.add(automatic);

        const refreshAuto = () => this._refreshAutoPlace();
        for (const key of ['auto-city-name', 'auto-country-name', 'auto-ready', 'location-error'])
            this._settingsSignals.push(settings.connect(`changed::${key}`, refreshAuto));
        this._refreshAutoPlace();
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

        const notices = new Adw.PreferencesGroup({title: _('Notifications')});
        const notice = new Adw.SpinRow({
            title: _('Notice before rain or cyclone'),
            subtitle: _('Hours in advance, from 1 to 12.'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 12,
                step_increment: 1,
                page_increment: 1,
                value: settings.get_int('alert-hours'),
            }),
        });
        notice.connect('notify::value', () => {
            settings.set_int('alert-hours', clampAlertHours(notice.value));
        });
        notices.add(notice);
        page.add(notices);
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

    _scheduleSearch() {
        if (this._closed)
            return;
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
        if (this._closed)
            return;
        const query = this._entry.get_text().trim();
        this._clearResults();
        if (query.length < 2) {
            this._setSearching(false);
            this._setSearchMessage(query.length === 0 ? null : _('Type at least 2 characters.'));
            return;
        }
        const token = ++this._searchToken;
        this._setSearching(true);
        this._setSearchMessage(_('Searching…'));
        let payload;
        try {
            const locale = GLib.get_language_names()?.[0] || 'en';
            payload = await this._client.getJson(openMeteoProvider.geocodingUrl(query, locale));
        } catch (error) {
            if (!this._closed && token === this._searchToken)
                this._searchFailed(error);
            return;
        }
        if (this._closed || token !== this._searchToken)
            return;
        this._setSearching(false);
        const cities = openMeteoProvider.parseGeocoding(payload);
        if (cities.length === 0) {
            this._setSearchMessage(_('No matching city.'));
            return;
        }
        this._setSearchMessage(null);
        this._resultsGroup.visible = true;
        for (const city of cities)
            this._addResult(city);
    }

    _searchFailed(error) {
        this._setSearching(false);
        const code = error?.code || 'network';
        this._setSearchMessage(code === 'rate-limit'
            ? _('The weather service asked to slow down.')
            : _('Search failed.'));
    }

    _setSearchMessage(message) {
        if (this._closed || !this._searchGroup)
            return;
        this._searchGroup.description = message
            || _('Search uses the Open-Meteo geocoding service.');
    }

    _setSearching(active) {
        if (this._closed || !this._spinner)
            return;
        this._spinner.spinning = active;
        this._spinner.visible = active;
    }

    _resetSearch() {
        if (this._searchDelay) {
            GLib.source_remove(this._searchDelay);
            this._searchDelay = 0;
        }
        this._searchToken++;
        this._setSearching(false);
        this._clearResults();
        this._setSearchMessage(null);
        if (this._entry?.get_text())
            this._entry.set_text('');
    }

    _addResult(city) {
        const row = new Adw.ActionRow({
            title: city.name,
            subtitle: [city.admin, city.country].filter(Boolean).join(', '),
            activatable: true,
        });
        row.add_prefix(new Gtk.Image({icon_name: 'mark-location-symbolic'}));
        const choose = new Gtk.Button({
            label: _('Choose'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        choose.connect('clicked', () => this._selectCity(city));
        row.add_suffix(choose);
        row.connect('activated', () => this._selectCity(city));
        this._resultRows.push(row);
        this._resultsGroup.add(row);
    }

    _locationState(settings) {
        return {
            savedCities: settings.get_string('saved-cities'),
            manualReady: settings.get_boolean('manual-ready'),
            cityName: settings.get_string('city-name'),
            countryName: settings.get_string('country-name'),
            adminName: settings.get_string('admin-name'),
            latitude: settings.get_double('latitude'),
            longitude: settings.get_double('longitude'),
            timezone: settings.get_string('timezone'),
        };
    }

    _manualKey(settings) {
        if (!settings.get_boolean('manual-ready'))
            return null;
        return placeKey({
            latitude: settings.get_double('latitude'),
            longitude: settings.get_double('longitude'),
            source: 'manual',
        });
    }

    _syncSavedDescription() {
        if (!this._savedGroup)
            return;
        if (!this._hasSavedCities) {
            this._savedGroup.description = _('Choose a city. No weather is shown until a location is set.');
            return;
        }
        this._savedGroup.description = this._settings.get_boolean('use-auto-location')
            ? _('Automatic location replaces the checked city.')
            : _('The checked city is shown beside the clock.');
    }

    _fillSaved(settings) {
        for (const row of this._savedRows)
            this._savedGroup.remove(row);
        this._savedRows = [];
        const cities = savedCitiesFromState(this._locationState(settings));
        const activeKey = this._manualKey(settings);
        this._hasSavedCities = cities.length > 0;
        this._savedGroup.title = cities.length > 1 ? _('Saved cities') : _('Saved city');
        if (!this._hasSavedCities) {
            const empty = new Adw.ActionRow({title: _('No city selected')});
            empty.add_prefix(new Gtk.Image({icon_name: 'find-location-symbolic'}));
            this._savedRows.push(empty);
            this._savedGroup.add(empty);
        }
        for (const city of cities) {
            const active = placeKey({...city, source: 'manual'}) === activeKey;
            const row = this._savedCityRow(city, active);
            this._savedRows.push(row);
            this._savedGroup.add(row);
        }
        this._syncSavedDescription();
    }

    _savedCityRow(city, active) {
        const place = [city.admin, city.country].filter(Boolean).join(', ');
        const manual = _('Manual city');
        const row = new Adw.ActionRow({
            title: city.name,
            subtitle: active ? (place ? `${place} · ${manual}` : manual) : place,
            activatable: !active,
        });
        const icon = new Gtk.Image({icon_name: 'mark-location-symbolic'});
        if (active)
            icon.add_css_class('accent');
        row.add_prefix(icon);
        if (active) {
            const check = new Gtk.Image({icon_name: 'emblem-ok-symbolic'});
            check.add_css_class('success');
            row.add_suffix(check);
        }
        const remove = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove'),
            css_classes: ['flat'],
        });
        remove.update_property([Gtk.AccessibleProperty.LABEL], [_('Remove')]);
        remove.connect('clicked', () => this._removeCity(city));
        row.add_suffix(remove);
        if (!active)
            row.connect('activated', () => this._selectCity(city));
        return row;
    }

    _writeManual(city) {
        const settings = this._settings;
        settings.set_string('city-name', city.name || '');
        settings.set_string('country-name', city.country || '');
        settings.set_string('admin-name', city.admin || '');
        settings.set_string('timezone', city.timezone || '');
        settings.set_double('latitude', city.latitude);
        settings.set_double('longitude', city.longitude);
        settings.set_boolean('manual-ready', true);
    }

    _clearManual(settings) {
        settings.set_boolean('manual-ready', false);
        settings.set_string('city-name', '');
        settings.set_string('country-name', '');
        settings.set_string('admin-name', '');
        settings.set_string('timezone', '');
        settings.set_double('latitude', 0);
        settings.set_double('longitude', 0);
    }

    _selectCity(city) {
        const settings = this._settings;
        const list = rememberCity(savedCitiesFromState(this._locationState(settings)), city);
        settings.set_string('saved-cities', JSON.stringify(list));
        this._writeManual(city);
        settings.set_boolean('use-auto-location', false);
        settings.set_string('location-error', '');
        if (this._autoRow?.active)
            this._autoRow.active = false;
        this._refreshAutoPlace();
        this._resetSearch();
        this._fillSaved(settings);
    }

    _removeCity(city) {
        const settings = this._settings;
        const cities = savedCitiesFromState(this._locationState(settings));
        const active = this._manualKey(settings) === placeKey({...city, source: 'manual'});
        const list = forgetCity(cities, city);
        settings.set_string('saved-cities', JSON.stringify(list));
        if (active) {
            if (list.length > 0)
                this._writeManual(list[0]);
            else
                this._clearManual(settings);
        }
        this._fillSaved(settings);
    }

    _refreshAutoPlace() {
        if (this._closed || !this._autoPlaceRow)
            return;
        const settings = this._settings;
        const enabled = settings.get_boolean('use-auto-location');
        const ready = settings.get_boolean('auto-ready');
        const name = settings.get_string('auto-city-name').trim();
        const country = settings.get_string('auto-country-name').trim();
        const denied = settings.get_string('location-error') === 'denied' && !ready;
        if (enabled && denied) {
            this._autoPlaceRow.visible = true;
            this._autoPlaceRow.title = _('Automatic location is unavailable.');
            this._autoPlaceRow.subtitle = '';
            return;
        }
        if (enabled && name) {
            this._autoPlaceRow.visible = true;
            this._autoPlaceRow.title = country ? `${name}, ${country}` : name;
            this._autoPlaceRow.subtitle = _('Current location');
            return;
        }
        this._autoPlaceRow.visible = false;
    }

    _clearResults() {
        for (const row of this._resultRows)
            this._resultsGroup.remove(row);
        this._resultRows = [];
        if (this._resultsGroup)
            this._resultsGroup.visible = false;
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
