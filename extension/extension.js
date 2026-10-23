import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WeatherService} from './client.js';
import {Indicator} from './indicator.js';
import {AutoLocation} from './location.js';
import {alertsAhead} from './lib/alerts.js';
import {present} from './lib/present.js';
import {
    clampAlertHours,
    clampRefreshMinutes,
    displayOptions,
    locationFromState,
    placeKey,
    rememberCity,
    savedCitiesFromState,
} from './lib/settings.js';
import {readGSettings} from './state.js';

const REFRESH_KEYS = new Set([
    'city-name',
    'country-name',
    'latitude',
    'longitude',
    'timezone',
    'manual-ready',
    'use-auto-location',
    'auto-latitude',
    'auto-longitude',
    'auto-ready',
    'provider',
    'location-error',
]);

export default class UbuntuWeatherIndicatorExtension extends Extension {
    enable() {
        this._disposed = false;
        this._refreshToken = 0;
        this._timer = 0;
        this._hourTimer = 0;
        this._debounce = 0;
        this._settingsId = 0;
        this._themeId = 0;
        this._networkId = 0;
        this._lastPresentation = null;
        this._namedKey = null;
        this._placeToken = 0;
        this._sentAlerts = new Set();
        this._logger = this.getLogger();

        try {
            this._settings = this.getSettings();
            this._service = new WeatherService(this._logger);
            this._indicator = new Indicator({
                translate: text => this.gettext(text),
                onRefresh: () => {
                    this._refresh(true);
                },
                onPreferences: () => this.openPreferences(),
                onSelectCity: city => this._selectSavedCity(city),
                onSearchCities: query => this._searchCities(query),
                logger: this._logger,
            });
            this._place();
        } catch (error) {
            this._logger.error(error);
            this._cleanup();
            return;
        }

        this._settingsId = this._settings.connect('changed', (_settings, key) => {
            this._onSettingsChanged(key);
        });
        this._interfaceSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._themeId = this._interfaceSettings.connect('changed', () => {
            if (this._lastPresentation)
                this._indicator?.update(this._lastPresentation);
        });
        this._network = Gio.NetworkMonitor.get_default();
        this._networkId = this._network.connect('network-changed', available => {
            if (available)
                this._scheduleRefresh(5000, false);
        });
        this._auto = new AutoLocation({
            settings: this._settings,
            logger: this._logger,
            onUpdate: () => this._scheduleRefresh(0, false),
        });
        this._auto.sync();
        this._armTimer();
        this._refresh(false);
        this._logger.log('Enabled');
    }

    disable() {
        this._logger?.log?.('Disabled');
        this._cleanup();
    }

    _cleanup() {
        this._disposed = true;
        this._refreshToken++;
        this._clearTimer();
        this._clearHour();
        this._clearDebounce();
        if (this._network && this._networkId) {
            this._network.disconnect(this._networkId);
            this._networkId = 0;
        }
        this._network = null;
        if (this._interfaceSettings && this._themeId) {
            this._interfaceSettings.disconnect(this._themeId);
            this._themeId = 0;
        }
        this._interfaceSettings = null;
        if (this._settings && this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }
        this._auto?.destroy();
        this._auto = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._service?.destroy();
        this._service = null;
        this._settings = null;
        this._lastPresentation = null;
        this._namedKey = null;
        this._logger = null;
    }

    _present(state, fields) {
        return present({
            providerId: 'open-meteo',
            ...fields,
            settings: displayOptions(state),
            savedCities: savedCitiesFromState(state),
            now: new Date(),
        });
    }

    _searchCities(query) {
        if (!this._service)
            return [];
        const locale = GLib.get_language_names()?.[0] || 'en';
        return this._service.searchCities(query, locale);
    }

    _selectSavedCity(city) {
        if (this._disposed || !this._settings || !city)
            return;
        const state = readGSettings(this._settings);
        const list = rememberCity(savedCitiesFromState(state), city);
        this._settings.set_string('saved-cities', JSON.stringify(list));
        this._settings.set_string('city-name', city.name);
        this._settings.set_string('country-name', city.country || '');
        this._settings.set_string('admin-name', city.admin || '');
        this._settings.set_string('timezone', city.timezone || '');
        this._settings.set_double('latitude', city.latitude);
        this._settings.set_double('longitude', city.longitude);
        this._settings.set_boolean('manual-ready', true);
        this._settings.set_boolean('use-auto-location', false);
        this._settings.set_string('location-error', '');
    }

    _ensurePlaceName(location) {
        if (!location || location.source !== 'auto' || !this._service || !this._settings)
            return;
        const key = placeKey(location);
        if (this._namedKey === key)
            return;
        if (this._namedKey == null && location.name) {
            this._namedKey = key;
            return;
        }
        this._namedKey = key;
        if (location.name) {
            this._settings.set_string('auto-city-name', '');
            this._settings.set_string('auto-country-name', '');
            this._settings.set_string('auto-admin-name', '');
        }
        const token = ++this._placeToken;
        const locale = GLib.get_language_names()?.[0] || 'en';
        this._service.lookupPlace(location.latitude, location.longitude, locale)
            .then(city => {
                if (this._disposed || token !== this._placeToken || !this._settings)
                    return;
                this._settings.set_string('auto-city-name', city?.name || '');
                this._settings.set_string('auto-country-name', city?.country || '');
                this._settings.set_string('auto-admin-name', city?.admin || '');
            })
            .catch(() => {
                if (this._namedKey === key)
                    this._namedKey = '';
            });
    }

    _place() {
        const state = readGSettings(this._settings);
        const anchor = this._indicator.place(displayOptions(state).clockSide);
        if (!anchor.clockFound)
            this._logger.warn('The clock was not found; the indicator was added to the center of the panel');
    }

    _onSettingsChanged(key) {
        if (this._disposed)
            return;
        if (key === 'clock-side')
            this._place();
        if (key === 'refresh-minutes')
            this._armTimer();
        if (key === 'use-auto-location')
            this._auto?.sync();
        if (REFRESH_KEYS.has(key))
            this._scheduleRefresh(200, false);
        else
            this._renderCached();
    }

    _renderCached() {
        const state = readGSettings(this._settings);
        const location = locationFromState(state);
        if (!location) {
            const denied = state.useAutoLocation && state.locationError === 'denied';
            this._show(this._present(state, {
                status: denied ? 'unavailable' : 'unconfigured',
                errorCode: denied ? 'denied' : null,
                location: null,
                report: null,
            }), null);
            return;
        }
        this._ensurePlaceName(location);
        const peeked = this._service.peek(location, state);
        if (!peeked) {
            this._show(this._present(state, {
                status: 'loading',
                location,
                report: null,
            }), null);
            return;
        }
        this._show(this._present(state, {
            status: peeked.fresh ? 'live' : 'stale',
            errorCode: peeked.fresh ? null : 'network',
            location,
            report: peeked.report,
            providerId: peeked.providerId,
        }), new Date(peeked.updatedAtMs).toISOString());
        this._noteWeather(peeked.report, location);
    }

    _scheduleRefresh(milliseconds, force) {
        this._clearDebounce();
        this._debounce = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
            this._debounce = 0;
            this._refresh(force);
            return GLib.SOURCE_REMOVE;
        });
    }

    _armTimer() {
        this._clearTimer();
        if (!this._settings || this._disposed)
            return;
        const minutes = clampRefreshMinutes(this._settings.get_int('refresh-minutes'));
        this._timer = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            minutes * 60,
            () => {
                if (!this._disposed)
                    this._refresh(false);
                return GLib.SOURCE_CONTINUE;
            });
    }

    _clearTimer() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
    }

    _clearHour() {
        if (this._hourTimer) {
            GLib.source_remove(this._hourTimer);
            this._hourTimer = 0;
        }
    }

    _armHour(timeZone) {
        this._clearHour();
        if (this._disposed)
            return;
        let zone = GLib.TimeZone.new_local();
        if (typeof timeZone === 'string' && timeZone.trim()) {
            try {
                zone = GLib.TimeZone.new(timeZone.trim());
            } catch {
                zone = GLib.TimeZone.new_local();
            }
        }
        const now = GLib.DateTime.new_now(zone);
        const start = GLib.DateTime.new(
            zone,
            now.get_year(),
            now.get_month(),
            now.get_day_of_month(),
            now.get_hour(),
            0,
            0);
        const seconds = Math.max(1, Math.ceil(start.add_hours(1).difference(now) / GLib.USEC_PER_SEC));
        this._hourTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._hourTimer = 0;
            if (!this._disposed)
                this._renderCached();
            return GLib.SOURCE_REMOVE;
        });
    }

    _clearDebounce() {
        if (this._debounce) {
            GLib.source_remove(this._debounce);
            this._debounce = 0;
        }
    }

    async _refresh(force) {
        if (this._disposed || !this._settings || !this._service)
            return;
        const token = ++this._refreshToken;
        const state = readGSettings(this._settings);
        const location = locationFromState(state);

        if (!location) {
            const denied = state.useAutoLocation && state.locationError === 'denied';
            this._show(this._present(state, {
                status: denied ? 'unavailable' : 'unconfigured',
                errorCode: denied ? 'denied' : null,
                location: null,
                report: null,
            }), null);
            return;
        }

        this._ensurePlaceName(location);
        const peeked = this._service.peek(location, state);
        if (peeked?.fresh && !force) {
            this._show(this._present(state, {
                status: 'live',
                location,
                report: peeked.report,
                providerId: peeked.providerId,
            }), new Date(peeked.updatedAtMs).toISOString());
            this._noteWeather(peeked.report, location);
            return;
        }
        if (peeked) {
            this._show(this._present(state, {
                status: peeked.fresh ? 'live' : 'stale',
                errorCode: peeked.fresh ? null : 'network',
                location,
                report: peeked.report,
                providerId: peeked.providerId,
            }), new Date(peeked.updatedAtMs).toISOString());
            this._noteWeather(peeked.report, location);
        } else {
            this._show(this._present(state, {
                status: 'loading',
                location,
                report: null,
            }), null);
        }

        let result;
        try {
            result = await this._service.refresh({state, force});
        } catch (error) {
            this._logger?.warn?.(`Refresh failed: ${error?.message || 'failed'}`);
            return;
        }
        if (this._disposed || token !== this._refreshToken || !this._settings)
            return;

        this._logger?.log?.(`Weather status: ${result.status}`);
        const latest = readGSettings(this._settings);
        this._ensurePlaceName(result.location);
        this._show(this._present(latest, {
            status: result.status,
            errorCode: result.errorCode,
            location: result.location,
            report: result.report,
            providerId: result.providerId,
        }), result.updatedAt);
        this._noteWeather(result.report, result.location);
    }

    _noteWeather(report, location) {
        if (!report || !location || !this._sentAlerts)
            return;
        let place;
        try {
            place = placeKey(location);
        } catch {
            return;
        }
        const lead = clampAlertHours(this._settings?.get_int('alert-hours'));
        const alerts = alertsAhead(report, new Date(), lead);
        if (alerts.rain)
            this._notifyOnce(`rain:${place}:${alerts.rain.time}`, _('Rain soon'), this._rainBody(alerts.rain));
        if (alerts.cyclone)
            this._notifyOnce(`cyclone:${place}:${alerts.cyclone.time}`, _('Cyclone soon'), this._cycloneBody(alerts.cyclone));
    }

    _rainBody(alert) {
        const when = typeof alert.probability === 'number'
            ? `${alert.label}, ${Math.round(alert.probability)} %`
            : alert.label;
        return _('Rain likely at %s').replace('%s', when);
    }

    _cycloneBody(alert) {
        const when = typeof alert.windKmh === 'number'
            ? `${alert.label}, ${Math.round(alert.windKmh)} km/h`
            : alert.label;
        return _('Cyclone wind expected at %s').replace('%s', when);
    }

    _notifyOnce(id, title, body) {
        if (this._sentAlerts.has(id))
            return;
        this._sentAlerts.add(id);
        try {
            Main.notify(title, body);
        } catch (error) {
            this._sentAlerts.delete(id);
            this._logger?.warn?.(`Notification failed: ${error?.message || error}`);
        }
    }

    _show(view, updatedAt) {
        view.updatedAt = updatedAt;
        this._lastPresentation = view;
        this._indicator?.update(view);
        this._armHour(view.model ? view.timeZone : null);
    }
}
