import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

import {CONDITION_NAMES} from '../extension/lib/wmo.js';
import {STATUS_MESSAGES} from '../extension/lib/present.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = join(root, 'extension');

function sourceStrings() {
    const files = readdirSync(extensionDir).filter(name => name.endsWith('.js'));
    const found = new Set();
    const patterns = [
        /_\('([^'\\]+)'\)/g,
        /this\._translate\('([^'\\]+)'\)/g,
        /\bt\('([^'\\]+)'\)/g,
    ];
    for (const name of files) {
        const text = readFileSync(join(extensionDir, name), 'utf8');
        for (const pattern of patterns) {
            for (const match of text.matchAll(pattern))
                found.add(match[1]);
        }
    }
    for (const name of CONDITION_NAMES)
        found.add(name);
    for (const message of STATUS_MESSAGES)
        found.add(message);
    return [...found].sort();
}

function catalogStrings(path) {
    const text = readFileSync(path, 'utf8');
    const found = new Set();
    const pattern = /^msgid "((?:\\.|[^"\\])*)"/gm;
    for (const match of text.matchAll(pattern)) {
        if (match[1])
            found.add(match[1].replaceAll('\\"', '"'));
    }
    return found;
}

test('french and english catalogs contain every user-visible string', () => {
    const expected = sourceStrings();
    assert.ok(expected.length > 20);
    for (const language of ['fr', 'en']) {
        const catalog = catalogStrings(join(root, 'po', `${language}.po`));
        const missing = expected.filter(item => !catalog.has(item));
        assert.deepEqual(missing, [], `${language}.po is missing strings`);
    }
});
