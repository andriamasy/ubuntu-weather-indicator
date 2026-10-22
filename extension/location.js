import Geoclue from 'gi://Geoclue';
import Gio from 'gi://Gio';

import {roundCoordinate} from './lib/settings.js';

Gio._promisify(Geoclue.Simple, 'new');

export class AutoLocation {
    constructor({settings, logger, onUpdate}) {
        this._settings = settings;
        this._logger = logger;
        this._onUpdate = onUpdate;
        this._simple = null;
        this._signal = 0;
        this._starting = false;
        this._token = 0;
    }

    sync() {
        if (!this._settings)
            return;
        if (this._settings.get_boolean('use-auto-location'))
            this._start().catch(error => this._fail(error));
        else
            this._stop(false);
    }

    async _start() {
        if (this._simple || this._starting)
            return;
        this._starting = true;
        const token = ++this._token;
        try {
            const simple = await Geoclue.Simple.new(
                'ubuntu-weather-indicator',
                Geoclue.AccuracyLevel.CITY,
                null);
            if (token !== this._token || !this._settings) {
                this._starting = false;
                return;
            }
            this._simple = simple;
            const client = simple.get_client();
            if (client)
                client.distance_threshold = 20000;
            this._signal = simple.connect('notify::location', () => this._emit());
            this._emit();
            this._logger?.log?.('Automatic location started');
        } catch (error) {
            if (token === this._token)
                this._fail(error);
        } finally {
            if (token === this._token)
                this._starting = false;
        }
    }

    _emit() {
        const location = this._simple?.location;
        if (!location || !this._settings)
            return;
        const latitude = roundCoordinate(location.latitude, 'auto');
        const longitude = roundCoordinate(location.longitude, 'auto');
        if (latitude == null || longitude == null)
            return;
        this._settings.set_double('auto-latitude', latitude);
        this._settings.set_double('auto-longitude', longitude);
        this._settings.set_boolean('auto-ready', true);
        this._settings.set_string('location-error', '');
        this._logger?.log?.('Automatic location updated');
        this._onUpdate?.();
    }

    _fail(error) {
        this._logger?.warn?.(`Automatic location unavailable: ${error?.message || 'denied'}`);
        if (!this._settings)
            return;
        this._settings.set_boolean('auto-ready', false);
        this._settings.set_string('location-error', 'denied');
        this._onUpdate?.();
    }

    _stop(clearError) {
        this._token++;
        if (this._simple && this._signal)
            this._simple.disconnect(this._signal);
        this._signal = 0;
        this._simple = null;
        this._starting = false;
        if (clearError && this._settings)
            this._settings.set_string('location-error', '');
    }

    destroy() {
        this._stop(false);
        this._settings = null;
        this._onUpdate = null;
        this._logger = null;
    }
}
