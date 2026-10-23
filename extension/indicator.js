import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {INDICATOR_ROLE} from './lib/constants.js';
import {classifyClockBox, insertionIndex} from './lib/placement.js';
import {WeatherMenu} from './menu.js';

function clockAnchor() {
    const dateMenu = Main.panel.statusArea.dateMenu;
    const container = dateMenu?.container ?? null;
    const parent = container?.get_parent?.() ?? null;
    let box = 'center';
    if (parent && parent === Main.panel._leftBox)
        box = 'left';
    else if (parent && parent === Main.panel._rightBox)
        box = 'right';
    else if (parent && parent === Main.panel._centerBox)
        box = 'center';
    box = classifyClockBox(box);
    let index = 0;
    let clockFound = false;
    if (parent && container) {
        const found = parent.get_children().indexOf(container);
        if (found >= 0) {
            index = found;
            clockFound = true;
        }
    }
    return {box, index, clockFound};
}

export class Indicator {
    constructor({translate, onRefresh, onPreferences, onSelectCity, logger}) {
        this._translate = translate;
        this._logger = logger;
        this._button = null;
        this._menuView = null;
        this._onRefresh = onRefresh;
        this._onPreferences = onPreferences;
        this._onSelectCity = onSelectCity;
        this._presentation = null;
    }

    place(clockSide) {
        this._remove();
        const anchor = clockAnchor();
        const position = insertionIndex(anchor.index, clockSide);
        const align = anchor.box === 'left' ? 0 : anchor.box === 'right' ? 1 : 0.5;
        const button = new PanelMenu.Button(align, this._translate('Weather'), false);
        button.add_style_class_name('weather-indicator-button');
        button.x_expand = false;
        button.y_expand = true;

        this._box = new St.BoxLayout({style_class: 'weather-indicator-box'});
        this._icon = new St.Icon({
            style_class: 'system-status-icon weather-indicator-icon',
            icon_name: 'find-location-symbolic',
        });
        this._temp = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'weather-indicator-temp',
        });
        this._city = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'weather-indicator-city',
        });
        this._box.add_child(this._icon);
        this._box.add_child(this._temp);
        this._box.add_child(this._city);
        button.add_child(this._box);

        this._menuView = new WeatherMenu({
            menu: button.menu,
            translate: this._translate,
            onRefresh: () => this._onRefresh(),
            onPreferences: () => this._onPreferences(),
            onSelectCity: city => this._onSelectCity?.(city),
        });

        const existing = Main.panel.statusArea[INDICATOR_ROLE];
        if (existing)
            existing.destroy();

        Main.panel.addToStatusArea(INDICATOR_ROLE, button, position, anchor.box);
        this._button = button;
        this._logger?.log?.(
            `Indicator placed on the ${anchor.box} of the panel at index ${position}` +
            `${anchor.clockFound ? ', beside the clock' : ', clock was not found'}`);
        if (this._presentation)
            this._apply(this._presentation);
        return anchor;
    }

    update(presentation) {
        this._presentation = presentation;
        if (this._button)
            this._apply(presentation);
    }

    _apply(presentation) {
        const iconName = presentation.iconName;
        this._icon.visible = Boolean(iconName);
        if (iconName)
            this._icon.icon_name = iconName;

        const temperature = presentation.barTemperature;
        this._temp.visible = Boolean(temperature);
        this._temp.text = temperature || '';
        if (presentation.stale)
            this._temp.add_style_class_name('weather-indicator-stale');
        else
            this._temp.remove_style_class_name('weather-indicator-stale');

        const city = presentation.barCity;
        this._city.visible = Boolean(city);
        this._city.text = city || '';

        this._button.accessible_name = this._accessibleName(presentation);
        this._menuView?.update(presentation);
    }

    _accessibleName(presentation) {
        const t = this._translate;
        if (presentation.barTemperature && presentation.stale)
            return t('Weather, %s, saved data').replace('%s', presentation.barTemperature);
        if (presentation.barTemperature)
            return t('Weather, %s').replace('%s', presentation.barTemperature);
        if (presentation.status === 'loading')
            return t('Weather, loading');
        if (presentation.status === 'unconfigured')
            return t('Weather, location not set');
        return t('Weather, unavailable');
    }

    _remove() {
        const existing = Main.panel.statusArea[INDICATOR_ROLE];
        if (existing)
            existing.destroy();
        else if (this._button)
            this._button.destroy();
        this._menuView?.destroy();
        this._menuView = null;
        this._button = null;
    }

    destroy() {
        this._remove();
        this._presentation = null;
        this._onRefresh = null;
        this._onPreferences = null;
        this._onSelectCity = null;
        this._logger = null;
    }
}
