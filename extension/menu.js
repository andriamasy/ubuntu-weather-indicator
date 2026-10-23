import Clutter from 'gi://Clutter';
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

function symbolic(name, size, styleClass) {
    return new St.Icon({
        icon_name: name,
        icon_size: size,
        style_class: styleClass,
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
    constructor({menu, translate, onRefresh, onPreferences, onSelectCity}) {
        this._menu = menu;
        this._translate = translate;
        this._onRefresh = onRefresh;
        this._onPreferences = onPreferences;
        this._onSelectCity = onSelectCity;
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
        clearChildren(this._root);
        this._build(presentation);
    }

    _build(presentation) {
        const t = this._translate;
        const model = presentation.model;
        const top = new St.BoxLayout({style_class: 'weather-top', x_expand: true});
        top.add_child(symbolic(
            presentation.iconName || model?.iconName || 'weather-cloudy-symbolic',
            72,
            'weather-main-icon'));

        const summary = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-summary',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        summary.add_child(label(placeLine(presentation.location, t), 'weather-place'));
        if (presentation.placeCredit)
            summary.add_child(label(t('Place name by OpenStreetMap'), 'weather-place-credit'));
        if (model) {
            summary.add_child(label(
                `${t(model.conditionName)}, ${model.temperature}`,
                'weather-headline'));
            if (model.upcomingRain?.label) {
                summary.add_child(label(
                    t('Rain likely at %s').replace('%s', `${model.upcomingRain.label}, ${model.upcomingRain.probability}`),
                    'weather-rain'));
            }
            summary.add_child(this._sunRow(model, presentation));
        } else if (presentation.message) {
            summary.add_child(label(t(presentation.message), 'weather-headline'));
        }
        top.add_child(summary);

        if (model)
            top.add_child(this._stats(model, t));
        this._root.add_child(top);
        const cities = this._cityRow(presentation, t);
        if (cities)
            this._root.add_child(cities);

        const days = model?.daily?.slice(0, 2) ?? [];
        if (days.length > 0) {
            this._root.add_child(new St.Widget({
                style_class: 'weather-separator',
                x_expand: true,
            }));
            const forecast = new St.BoxLayout({style_class: 'weather-forecast', x_expand: true});
            days.forEach((day, index) => {
                forecast.add_child(this._dayColumn(day, index === 0 ? t('Today') : t('Tomorrow'), t));
            });
            this._root.add_child(forecast);
        }

        this._root.add_child(this._footer(t));
    }

    _sunRow(model, presentation) {
        const row = new St.BoxLayout({style_class: 'weather-sun'});
        const today = model.daily?.[0];
        this._addClock(row, 'daytime-sunrise-symbolic', clockLabel(today?.sunrise));
        this._addClock(row, 'daytime-sunset-symbolic', clockLabel(today?.sunset));
        this._addClock(row, 'view-refresh-symbolic', clockLabel(model.observedAt || presentation.updatedAt));
        return row;
    }

    _addClock(row, iconName, text) {
        if (!text)
            return;
        const item = new St.BoxLayout({style_class: 'weather-clock'});
        item.add_child(symbolic(iconName, 14, 'weather-clock-icon'));
        item.add_child(label(text, 'weather-clock-label'));
        row.add_child(item);
    }

    _stats(model, t) {
        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-stats',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._addStat(box, t('Cloudiness'), model.cloudCover);
        this._addStat(box, t('Humidity'), model.humidity);
        this._addStat(box, t('Pressure'), model.pressure);
        const wind = [model.windArrow, model.wind].filter(Boolean).join(' ');
        this._addStat(box, t('Wind'), wind || null);
        return box;
    }

    _addStat(box, name, value) {
        if (!value)
            return;
        box.add_child(label(`${name}: ${value}`, 'weather-stat', {
            x_align: Clutter.ActorAlign.END,
        }));
    }

    _dayColumn(day, title, t) {
        const column = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'weather-day',
            x_expand: true,
        });
        column.add_child(label(`${title} (${this._weekday(day)})`, 'weather-day-title'));
        column.add_child(label(this._date(day), 'weather-day-date'));
        const body = new St.BoxLayout({style_class: 'weather-day-body'});
        body.add_child(symbolic(day.iconName, 42, 'weather-day-icon'));
        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        text.add_child(label(t(day.conditionName), 'weather-day-condition'));
        const temps = new St.BoxLayout({style_class: 'weather-day-temps'});
        if (day.minimum)
            temps.add_child(label(`↓ ${day.minimum}`, 'weather-day-temp'));
        if (day.maximum)
            temps.add_child(label(`↑ ${day.maximum}`, 'weather-day-temp'));
        text.add_child(temps);
        body.add_child(text);
        column.add_child(body);
        return column;
    }

    _footer(t) {
        const row = new St.BoxLayout({style_class: 'weather-footer', x_expand: true});
        row.add_child(this._tool('find-location-symbolic', () => this._onPreferences()));
        row.add_child(this._tool('view-refresh-symbolic', () => this._onRefresh()));
        const credit = presentation.providerId === 'met-no'
            ? t('Weather data provided by: MET Norway')
            : t('Weather data provided by: Open-Meteo');
        row.add_child(label(credit, 'weather-attribution', {
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        }));
        row.add_child(this._tool('emblem-system-symbolic', () => this._onPreferences()));
        return row;
    }

    _tool(iconName, action) {
        const button = new St.Button({
            style_class: 'weather-tool',
            child: symbolic(iconName, 16, 'weather-tool-icon'),
            can_focus: true,
            track_hover: true,
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
        return this._dateParts(day)?.format('%A') || '';
    }

    _date(day) {
        return this._dateParts(day)?.format('%d/%m/%Y') || '';
    }

    destroy() {
        this._item = null;
        this._root = null;
        this._menu = null;
        this._onRefresh = null;
        this._onPreferences = null;
        this._onSelectCity = null;
    }
}
