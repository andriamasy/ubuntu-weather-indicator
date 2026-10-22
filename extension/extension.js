import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WeatherService} from './client.js';
import {Indicator} from './indicator.js';
import {AutoLocation} from './location.js';
import {present} from './lib/present.js';
import {clampRefreshMinutes, displayOptions, locationFromState} from './lib/settings.js';
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
        this._debounce = 0;
        this._settingsId = 0;
        this._themeId = 0;
        this._networkId = 0;
        this._lastPresentation = null;
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
        this._logger = null;
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
        const settings = displayOptions(state);
        if (!location) {
            const denied = state.useAutoLocation && state.locationError === 'denied';
            this._show(present({
                status: denied ? 'unavailable' : 'unconfigured',
                errorCode: denied ? 'denied' : null,
                location: null,
                report: null,
                settings,
            }), null);
            return;
        }
        const peeked = this._service.peek(location, state);
        if (!peeked) {
            this._show(present({
                status: 'loading',
                location,
                report: null,
                settings,
            }), null);
            return;
        }
        this._show(present({
            status: peeked.fresh ? 'live' : 'stale',
            errorCode: peeked.fresh ? null : 'network',
            location,
            report: peeked.report,
            settings,
        }), new Date(peeked.updatedAtMs).toISOString());
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
        const settings = displayOptions(state);
        const location = locationFromState(state);

        if (!location) {
            const denied = state.useAutoLocation && state.locationError === 'denied';
            this._show(present({
                status: denied ? 'unavailable' : 'unconfigured',
                errorCode: denied ? 'denied' : null,
                location: null,
                report: null,
                settings,
            }), null);
            return;
        }

        const peeked = this._service.peek(location, state);
        if (peeked?.fresh && !force) {
            this._show(present({
                status: 'live',
                location,
                report: peeked.report,
                settings,
            }), new Date(peeked.updatedAtMs).toISOString());
            return;
        }
        if (peeked) {
            this._show(present({
                status: peeked.fresh ? 'live' : 'stale',
                errorCode: peeked.fresh ? null : 'network',
                location,
                report: peeked.report,
                settings,
            }), new Date(peeked.updatedAtMs).toISOString());
        } else {
            this._show(present({
                status: 'loading',
                location,
                report: null,
                settings,
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
        const latest = displayOptions(readGSettings(this._settings));
        this._show(present({
            status: result.status,
            errorCode: result.errorCode,
            location: result.location,
            report: result.report,
            settings: latest,
        }), result.updatedAt);
    }

    _show(view, updatedAt) {
        view.updatedAt = updatedAt;
        this._lastPresentation = view;
        this._indicator?.update(view);
    }
}
