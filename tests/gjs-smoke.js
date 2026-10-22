import {present} from '../extension/lib/present.js';
import {displayOptions} from '../extension/lib/settings.js';

const view = present({
    status: 'unconfigured',
    report: null,
    settings: displayOptions({}),
});

if (view.barTemperature !== null || view.model !== null)
    throw new Error('unconfigured view exposed weather data');

print('gjs-smoke ok');
