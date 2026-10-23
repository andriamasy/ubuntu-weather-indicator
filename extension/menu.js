import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {placeKey} from './lib/settings.js';

function clearChildren(actor) {
    for (const child of actor.get_children())
        child.destroy();
}

function label(text, styleClass, extra = {}) {
    return new St.Label({
        text: text || '',
        style_class: styleClass,
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.CENTER,
        ...extra,
    });
}

function iconTone(name) {
    const icon = name || '';
    if (icon.includes('night'))
        return 'weather-tone-night';
    if (icon.includes('storm'))
        return 'weather-tone-storm';
    if (icon.includes('snow'))
        return 'weather-tone-snow';
    if (icon.includes('shower') || icon.includes('rain'))
        return 'weather-tone-rain';
    if (icon.includes('fog') || icon.includes('overcast') || icon.includes('cloud'))
        return 'weather-tone-cloud';
    if (icon.includes('clear') || icon.includes('few-clouds'))
        return 'weather-tone-sun';
    return '';
}

function symbolic(name, size, styleClass) {
    const style_class = [styleClass, iconTone(name)].filter(Boolean).join(' ');
    return new St.Icon({
        icon_name: name,
        icon_size: size,
        style_class,
    });
}

function clockLabel(iso) {
    const match = /T(\d{2}:\d{2})/.exec(iso || '');
    return match ? match[1] : '';
}

function placeLine(location, t) {
    if (location?.name)
        return [location.name, location.admin, location.country].filter(Boolean).join(', ');
    if (location?.source === 'auto')
        return t('Current location');
    return t('Weather');
}

function sameCity(location, city) {
    if (!location || location.source !== 'manual' || !city)
        return false;
    return placeKey(location) === placeKey({...city, source: 'manual'});
}

export class WeatherMenu {
    constructor({menu, translate, onRefresh, onPreferences, onSelectCity, onSearchCities}) {
        this._menu = menu;
        this._translate = translate;
        this._onRefresh = onRefresh;
        this._onPreferences = onPreferences;
        this._onSelectCity = onSelectCity;
        this._onSearchCities = onSearchCities;
        this._searchEntry = null;
        this._searchStatus = null;
        this._searchResults = null;
        this._searchDelay = 0;
        this._searchToken = 0;
        this._view = 'today';
        menu.box?.add_style_class_name?.('weather-popup');

        this._item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'weather-menu-item',
        });
        this._root = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-menu-root',
            x_expand: true,
        });
        this._item.add_child(this._root);
        this._menu.addMenuItem(this._item);
    }

    update(presentation) {
        this._clearSearchDelay();
        const query = this._searchEntry?.get_text?.() || '';
        clearChildren(this._root);
        this._searchEntry = null;
        this._searchStatus = null;
        this._searchResults = null;
        this._build(presentation);
        if (query && this._searchEntry)
            this._searchEntry.set_text(query);
    }

    _build(presentation) {
        const t = this._translate;
        const model = presentation.model;
        this._root.add_child(this._header(presentation, t));
        if (model)
            this._root.add_child(this._hero(model, presentation, t));
        else if (presentation.message)
            this._root.add_child(label(t(presentation.message), 'weather-headline'));
        if (presentation.status === 'unconfigured')
            this._root.add_child(this._citySearch(t));
        const cities = this._cityRow(presentation, t);
        if (cities)
            this._root.add_child(cities);

        this._forecastModel = model;
        this._forecastTranslate = t;
        const hasForecast = (model?.hourly?.length || 0) > 0 || (model?.daily?.length || 0) > 0;
        this._forecastHost = null;
        if (hasForecast) {
            this._forecastHost = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });
            this._root.add_child(this._forecastHost);
            this._renderForecast();
        }
        this._root.add_child(this._footer(presentation, t));
    }

    _header(presentation, t) {
        const row = new St.BoxLayout({style_class: 'weather-header', x_expand: true});
        const pin = symbolic('mark-location-symbolic', 18, 'weather-pin');
        pin.y_align = Clutter.ActorAlign.START;
        const titles = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-titles',
            x_expand: true,
        });
        titles.add_child(label(placeLine(presentation.location, t), 'weather-place'));
        if (presentation.placeCredit)
            titles.add_child(label(t('Place name by OpenStreetMap'), 'weather-place-credit'));
        row.add_child(pin);
        row.add_child(titles);
        if (presentation.location)
            row.add_child(this._localChip(t));
        return row;
    }

    _localChip(t) {
        const text = t('Local weather');
        const inner = new St.BoxLayout({style_class: 'weather-local-row'});
        inner.add_child(symbolic('find-location-symbolic', 14, 'weather-local-icon'));
        inner.add_child(label(text, 'weather-local-label'));
        const button = new St.Button({
            style_class: 'weather-local',
            child: inner,
            can_focus: true,
            track_hover: true,
            accessible_name: text,
            y_align: Clutter.ActorAlign.START,
        });
        button.connect('clicked', () => this._onPreferences?.());
        return button;
    }

    _hero(model, presentation, t) {
        const row = new St.BoxLayout({style_class: 'weather-hero', x_expand: true});
        const summary = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-summary',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const condition = new St.BoxLayout({style_class: 'weather-condition'});
        const icon = symbolic(model.iconName || 'weather-cloudy-symbolic', 64, 'weather-main-icon');
        icon.y_align = Clutter.ActorAlign.CENTER;
        condition.add_child(icon);
        const lines = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-condition-lines',
            y_align: Clutter.ActorAlign.CENTER,
        });
        lines.add_child(label(
            `${t(model.conditionName)}, ${model.temperature}`,
            'weather-headline'));
        if (model.upcomingRain?.label) {
            const rain = new St.BoxLayout({style_class: 'weather-rain-row'});
            rain.add_child(symbolic('weather-showers-symbolic', 16, 'weather-rain-icon'));
            rain.add_child(label(
                t('Rain likely at %s').replace('%s', `${model.upcomingRain.label}, ${model.upcomingRain.probability}`),
                'weather-rain'));
            lines.add_child(rain);
        }
        lines.add_child(this._sunRow(model, presentation));
        condition.add_child(lines);
        summary.add_child(condition);
        row.add_child(summary);
        const stats = this._stats(model, t);
        if (stats)
            row.add_child(stats);
        return row;
    }

    _renderForecast() {
        const host = this._forecastHost;
        if (!host)
            return;
        clearChildren(host);
        const model = this._forecastModel;
        const t = this._forecastTranslate;
        const hours = model?.hourly ?? [];
        const days = model?.daily ?? [];
        if (hours.length === 0 && days.length === 0)
            return;
        const canSwitch = hours.length > 0 && days.length > 0;
        const showDays = this._view === 'days' ? days.length > 0 : hours.length === 0;
        const panel = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-panel',
            x_expand: true,
        });
        panel.add_child(this._forecastBar(t, showDays, canSwitch));
        const body = showDays ? this._days(model) : this._hours(model);
        if (body)
            panel.add_child(body);
        host.add_child(panel);
    }

    _forecastBar(t, showDays, canSwitch) {
        const row = new St.BoxLayout({style_class: 'weather-forecast-bar', x_expand: true});
        const heading = new St.BoxLayout({style_class: 'weather-forecast-heading'});
        const badge = new St.BoxLayout({style_class: 'weather-forecast-badge'});
        badge.add_child(symbolic(
            showDays ? 'x-office-calendar-symbolic' : 'appointment-soon-symbolic',
            14,
            'weather-forecast-badge-icon'));
        heading.add_child(badge);
        heading.add_child(label(
            showDays ? t('Next days') : t('Today'),
            'weather-forecast-title'));
        row.add_child(heading);
        row.add_child(new St.Widget({x_expand: true}));
        if (!canSwitch)
            return row;
        const linkText = showDays ? t('Today') : t('Next days');
        const inner = new St.BoxLayout({
            style_class: 'weather-forecast-link-row',
            x_align: Clutter.ActorAlign.END,
        });
        inner.add_child(label(linkText, 'weather-forecast-link-label'));
        if (!showDays)
            inner.add_child(symbolic('go-next-symbolic', 12, 'weather-forecast-link-icon'));
        const link = new St.Button({
            style_class: 'weather-forecast-link',
            child: inner,
            can_focus: true,
            track_hover: true,
            accessible_name: linkText,
        });
        link.connect('clicked', () => {
            this._view = showDays ? 'today' : 'days';
            this._renderForecast();
        });
        row.add_child(link);
        return row;
    }

    _sunRow(model, presentation) {
        const row = new St.BoxLayout({style_class: 'weather-times'});
        const today = model.daily?.[0];
        const parts = [
            ['daytime-sunrise-symbolic', clockLabel(today?.sunrise)],
            ['daytime-sunset-symbolic', clockLabel(today?.sunset)],
            ['appointment-soon-symbolic', clockLabel(model.observedAt || presentation.updatedAt)],
        ].filter(([, text]) => text);
        parts.forEach(([iconName, text], index) => {
            if (index > 0)
                row.add_child(new St.Widget({style_class: 'weather-time-sep', y_align: Clutter.ActorAlign.CENTER}));
            const item = new St.BoxLayout({style_class: 'weather-clock'});
            item.add_child(symbolic(iconName, 14, 'weather-clock-icon'));
            item.add_child(label(text, 'weather-clock-label'));
            row.add_child(item);
        });
        return row;
    }

    _stats(model, t) {
        const rows = [
            ['weather-showers-scattered-symbolic', t('Humidity'), model.humidity],
            ['weather-overcast-symbolic', t('Cloudiness'), model.cloudCover],
            ['speedometer-symbolic', t('Pressure'), model.pressure],
            ['weather-windy-symbolic', t('Wind'), model.wind],
        ].filter(([, , value]) => value);
        if (rows.length === 0)
            return null;
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-stats',
            y_align: Clutter.ActorAlign.START,
        });
        for (const [iconName, name, value] of rows)
            box.add_child(this._statRow(iconName, name, value));
        return box;
    }

    _statRow(iconName, name, value) {
        const row = new St.BoxLayout({style_class: 'weather-stat-row', x_expand: true});
        row.add_child(symbolic(iconName, 16, 'weather-meta-icon'));
        row.add_child(label(name, 'weather-stat-name', {x_expand: true}));
        row.add_child(label(value, 'weather-stat-value', {
            x_align: Clutter.ActorAlign.END,
        }));
        return row;
    }

    _hours(model) {
        const hours = model?.hourly?.slice(0, 8) ?? [];
        if (hours.length === 0)
            return null;
        const row = new St.BoxLayout({style_class: 'weather-hourly', x_expand: true});
        hours.forEach((hour, index) => row.add_child(this._hourCard(hour, index === 0)));
        return row;
    }

    _hourCard(hour, current) {
        const column = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: current ? 'weather-slot weather-slot-now' : 'weather-slot',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            accessible_name: [hour.label, hour.temperature].filter(Boolean).join(', '),
        });
        column.add_child(label(hour.label, 'weather-hour-label', {
            x_align: Clutter.ActorAlign.CENTER,
        }));
        column.add_child(symbolic(hour.iconName, 22, 'weather-hour-icon'));
        if (hour.temperature) {
            column.add_child(label(hour.temperature, 'weather-hour-temp', {
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
        return column;
    }

    _days(model) {
        const days = model?.daily?.slice(0, 7) ?? [];
        if (days.length === 0)
            return null;
        const row = new St.BoxLayout({style_class: 'weather-forecast', x_expand: true});
        days.forEach((day, index) => row.add_child(this._dayColumn(day, index === 0)));
        return row;
    }

    _dayColumn(day, current) {
        const weekday = this._weekday(day);
        const column = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: current ? 'weather-slot weather-slot-now' : 'weather-slot',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            accessible_name: [weekday, day.maximum, day.minimum].filter(Boolean).join(', '),
        });
        column.add_child(label(weekday, 'weather-day-title', {
            x_align: Clutter.ActorAlign.CENTER,
        }));
        column.add_child(symbolic(day.iconName, 22, 'weather-day-icon'));
        if (day.maximum) {
            column.add_child(label(day.maximum, 'weather-day-temp', {
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
        if (day.minimum) {
            column.add_child(label(day.minimum, 'weather-day-min', {
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
        return column;
    }

    _citySearch(t) {
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-search-box',
            x_expand: true,
        });
        this._searchEntry = new St.Entry({
            hint_text: t('City name'),
            style_class: 'weather-search',
            can_focus: true,
            x_expand: true,
            accessible_name: t('City name'),
        });
        const text = this._searchEntry.clutter_text;
        text.connect('text-changed', () => this._scheduleCitySearch());
        text.connect('activate', () => {
            this._runCitySearch().catch(() => this._searchFailed(t));
        });
        box.add_child(this._searchEntry);
        this._searchStatus = label(t('Type at least 2 characters.'), 'weather-search-status');
        box.add_child(this._searchStatus);
        this._searchResults = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-search-results',
        });
        box.add_child(this._searchResults);
        return box;
    }

    _scheduleCitySearch() {
        this._clearSearchDelay();
        this._searchDelay = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            this._searchDelay = 0;
            this._runCitySearch().catch(() => this._searchFailed(this._translate));
            return GLib.SOURCE_REMOVE;
        });
    }

    async _runCitySearch() {
        const t = this._translate;
        const query = this._searchEntry?.get_text?.().trim() || '';
        this._clearSearchResults();
        if (!this._searchStatus)
            return;
        if (query.length < 2) {
            this._searchStatus.text = t('Type at least 2 characters.');
            return;
        }
        if (!this._onSearchCities) {
            this._searchFailed(t);
            return;
        }
        const token = ++this._searchToken;
        this._searchStatus.text = t('Searching…');
        let cities;
        try {
            cities = await this._onSearchCities(query);
        } catch {
            if (token === this._searchToken)
                this._searchFailed(t);
            return;
        }
        if (token !== this._searchToken || !this._searchResults)
            return;
        if (!cities || cities.length === 0) {
            this._searchStatus.text = t('No matching city.');
            return;
        }
        this._searchStatus.text = t('Results');
        for (const city of cities) {
            const subtitle = [city.admin, city.country].filter(Boolean).join(', ');
            const button = new St.Button({
                style_class: 'weather-search-hit',
                label: subtitle ? `${city.name}, ${subtitle}` : city.name,
                can_focus: true,
                x_align: Clutter.ActorAlign.START,
                x_expand: true,
            });
            button.connect('clicked', () => this._onSelectCity?.(city));
            this._searchResults.add_child(button);
        }
    }

    _searchFailed(t) {
        if (this._searchStatus)
            this._searchStatus.text = t('Search failed.');
    }

    _clearSearchResults() {
        if (!this._searchResults)
            return;
        for (const child of this._searchResults.get_children())
            child.destroy();
    }

    _clearSearchDelay() {
        if (this._searchDelay) {
            GLib.source_remove(this._searchDelay);
            this._searchDelay = 0;
        }
    }

    _footer(presentation, t) {
        const row = new St.BoxLayout({
            style_class: 'weather-footer',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const left = new St.BoxLayout({style_class: 'weather-footer-side'});
        left.add_child(this._tool('find-location-symbolic', t('Location'), () => this._onPreferences()));
        left.add_child(this._tool('view-refresh-symbolic', t('Refresh'), () => this._onRefresh()));
        const settings = this._tool('emblem-system-symbolic', t('Open preferences'), () => this._onPreferences());
        settings.x_align = Clutter.ActorAlign.END;
        const right = new St.BoxLayout({style_class: 'weather-footer-side'});
        right.add_child(settings);
        row.add_child(left);
        row.add_child(this._credit(presentation, t));
        row.add_child(right);
        return row;
    }

    _credit(presentation, t) {
        const met = presentation.providerId === 'met-no';
        const box = new St.BoxLayout({
            style_class: 'weather-credit',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(label(t('Weather data provided by:'), 'weather-attribution'));
        const name = met ? 'MET Norway' : 'Open-Meteo';
        const uri = met ? 'https://www.met.no/' : 'https://open-meteo.com/';
        const link = new St.Button({
            style_class: 'weather-credit-link',
            label: name,
            can_focus: true,
            track_hover: true,
            accessible_name: name,
        });
        link.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(uri, null);
            } catch (error) {
                console.warn(`[ubuntu-weather-indicator] ${error?.message || error}`);
            }
        });
        box.add_child(link);
        return box;
    }

    _tool(iconName, name, action) {
        const button = new St.Button({
            style_class: 'weather-tool',
            child: symbolic(iconName, 16, 'weather-tool-icon'),
            can_focus: true,
            track_hover: true,
            accessible_name: name,
        });
        button.connect('clicked', () => action());
        return button;
    }

    _cityRow(presentation, t) {
        const cities = presentation.savedCities || [];
        if (cities.length < 2 || !this._onSelectCity)
            return null;
        const row = new St.BoxLayout({style_class: 'weather-cities', x_expand: true});
        for (const city of cities) {
            const active = sameCity(presentation.location, city);
            const button = new St.Button({
                style_class: active ? 'weather-city weather-city-active' : 'weather-city',
                label: city.name,
                can_focus: true,
                track_hover: true,
            });
            button.connect('clicked', () => this._onSelectCity(city));
            row.add_child(button);
        }
        row.add_child(label(t('Saved cities'), 'weather-city-caption', {
            y_align: Clutter.ActorAlign.CENTER,
        }));
        return row;
    }

    _dateParts(day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date || ''))
            return null;
        const [year, month, date] = day.date.split('-').map(Number);
        return GLib.DateTime.new_utc(year, month, date, 12, 0, 0);
    }

    _weekday(day) {
        return this._dateParts(day)?.format('%a') || '';
    }

    destroy() {
        this._clearSearchDelay();
        this._searchToken++;
        this._item = null;
        this._root = null;
        this._menu = null;
        this._searchEntry = null;
        this._searchStatus = null;
        this._searchResults = null;
        this._onRefresh = null;
        this._onPreferences = null;
        this._onSelectCity = null;
        this._onSearchCities = null;
    }
}
