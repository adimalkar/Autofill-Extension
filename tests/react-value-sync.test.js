import test from 'node:test';
import assert from 'node:assert/strict';

import { ShadowDomEngine } from '../extension/lib/shadow_dom_utils.js';
import {
    setReactInputValue,
    setReactTextAreaValue,
    setReactSelectValue,
    setFieldValue
} from '../extension/lib/react-bridge.js';

/**
 * Create a lightweight simulated browser realm + React 16+ controlled element harness.
 * Mimics React's instance property hijacking and _valueTracker delta check:
 * - Direct assignment (`el.value = x`) hits React's instance setter and updates _valueTracker.
 * - Native prototype descriptor (`Object.getOwnPropertyDescriptor(proto, 'value').set`)
 *   updates backing storage WITHOUT updating _valueTracker.
 * - On `input` / `change`, React only invokes `onReactChange` if
 *   `_valueTracker.getValue() !== currentDomValue` at event dispatch time.
 */
function createReactRealm() {
    const nativeValueBacking = new WeakMap();
    const nativeCheckedBacking = new WeakMap();

    class HTMLInputElement {}
    class HTMLTextAreaElement {}
    class HTMLSelectElement {}

    for (const Ctor of [HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement]) {
        Object.defineProperty(Ctor.prototype, 'value', {
            configurable: true,
            get() {
                return nativeValueBacking.get(this) ?? '';
            },
            set(v) {
                nativeValueBacking.set(this, v === null || v === undefined ? '' : String(v));
            }
        });
    }

    Object.defineProperty(HTMLInputElement.prototype, 'checked', {
        configurable: true,
        get() {
            return nativeCheckedBacking.get(this) ?? false;
        },
        set(v) {
            nativeCheckedBacking.set(this, Boolean(v));
        }
    });

    const view = {
        HTMLInputElement,
        HTMLTextAreaElement,
        HTMLSelectElement,
        Event
    };

    const doc = {
        defaultView: view,
        activeElement: null
    };

    function createControlledElement({
        tagName = 'INPUT',
        type = 'text',
        initialValue = '',
        initialChecked = false,
        name = '',
        options = [],
        toggleCheckedOnClick = false
    } = {}) {
        const Ctor =
            tagName === 'TEXTAREA'
                ? HTMLTextAreaElement
                : tagName === 'SELECT'
                  ? HTMLSelectElement
                  : HTMLInputElement;

        const el = Object.create(Ctor.prototype);
        const listeners = new Map();
        const dispatchedEvents = [];
        const onChangeCalls = [];

        const isCheckable = type === 'checkbox' || type === 'radio';
        let trackedValue = isCheckable ? String(Boolean(initialChecked)) : String(initialValue);

        nativeValueBacking.set(el, String(initialValue));
        nativeCheckedBacking.set(el, Boolean(initialChecked));

        el.tagName = tagName;
        el.type = type;
        el.name = name;
        el.options = options.map((opt) => ({
            value: opt.value,
            text: opt.text,
            selected: Boolean(opt.selected)
        }));
        el.ownerDocument = doc;
        el.focus = () => {
            doc.activeElement = el;
        };

        el._valueTracker = {
            getValue: () => trackedValue,
            setValue: (v) => {
                trackedValue = String(v);
            },
            stopTracking: () => {}
        };

        // React installs an instance descriptor that updates _valueTracker on direct assignment
        if (isCheckable) {
            const nativeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
            Object.defineProperty(el, 'checked', {
                configurable: true,
                get() {
                    return nativeDesc.get.call(this);
                },
                set(v) {
                    nativeDesc.set.call(this, v);
                    trackedValue = String(Boolean(v));
                }
            });
        } else {
            const nativeDesc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'value');
            Object.defineProperty(el, 'value', {
                configurable: true,
                get() {
                    return nativeDesc.get.call(this);
                },
                set(v) {
                    nativeDesc.set.call(this, v);
                    trackedValue = nativeDesc.get.call(this);
                }
            });
        }

        el.addEventListener = (typeName, fn) => {
            if (!listeners.has(typeName)) listeners.set(typeName, []);
            listeners.get(typeName).push(fn);
        };

        el.dispatchEvent = (event) => {
            dispatchedEvents.push(event.type);

            if (event.type === 'click' && isCheckable && toggleCheckedOnClick) {
                const nativeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
                nativeDesc.set.call(el, !nativeDesc.get.call(el));
            }

            if (event.type === 'input' || event.type === 'change') {
                const current = isCheckable ? String(Boolean(el.checked)) : String(el.value);
                if (trackedValue !== current) {
                    trackedValue = current;
                    onChangeCalls.push({
                        eventType: event.type,
                        value: isCheckable ? el.checked : el.value
                    });
                }
            }

            for (const fn of listeners.get(event.type) || []) {
                fn(event);
            }
            return true;
        };

        return {
            el,
            dispatchedEvents,
            onChangeCalls,
            getTrackedValue: () => trackedValue
        };
    }

    return { view, doc, createControlledElement };
}

test('ShadowDomEngine.injectValueSecurely triggers React onChange for input, textarea, and select', () => {
    const { createControlledElement } = createReactRealm();

    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
        const { el, dispatchedEvents, onChangeCalls } = createControlledElement({
            tagName,
            type: tagName === 'INPUT' ? 'text' : tagName.toLowerCase(),
            initialValue: ''
        });

        ShadowDomEngine.injectValueSecurely(el, 'Ada Lovelace');

        assert.equal(el.value, 'Ada Lovelace', `${tagName} should update value`);
        assert.deepEqual(dispatchedEvents, ['focus', 'input', 'change', 'blur']);
        assert.equal(onChangeCalls.length, 1, `${tagName} must trigger React onChange`);
        assert.equal(onChangeCalls[0].value, 'Ada Lovelace');
    }
});

test('ShadowDomEngine.injectValueSecurely triggers React onChange when clearing a field to empty string', () => {
    const { createControlledElement } = createReactRealm();
    const { el, onChangeCalls } = createControlledElement({
        tagName: 'INPUT',
        initialValue: 'Existing Text'
    });

    ShadowDomEngine.injectValueSecurely(el, '');

    assert.equal(el.value, '');
    assert.equal(onChangeCalls.length, 1);
    assert.equal(onChangeCalls[0].value, '');
});

test('ShadowDomEngine.injectValueSecurely handles checkbox without flipping state via click', () => {
    const { createControlledElement } = createReactRealm();
    const { el, dispatchedEvents, onChangeCalls } = createControlledElement({
        tagName: 'INPUT',
        type: 'checkbox',
        initialChecked: false,
        toggleCheckedOnClick: true
    });

    ShadowDomEngine.injectValueSecurely(el, true);

    assert.equal(el.checked, true, 'checkbox must remain checked (not toggled back by synthetic click)');
    assert.equal(dispatchedEvents.includes('click'), false);
    assert.deepEqual(dispatchedEvents, ['input', 'change']);
    assert.equal(onChangeCalls.length, 1);
    assert.equal(onChangeCalls[0].value, true);
});

test('ShadowDomEngine.extractAllInputs and querySelectorDeep traverse nested shadow roots', () => {
    const shadowInput = { id: 'nested-email', tagName: 'INPUT' };
    const lightInput = { id: 'light-name', tagName: 'INPUT' };

    const deepShadowRoot = {
        querySelector: (sel) => (sel === '#nested-email' ? shadowInput : null),
        querySelectorAll: (sel) => (sel === 'input, textarea, select' ? [shadowInput] : [])
    };
    const hostElement = { shadowRoot: deepShadowRoot };
    const rootNode = {
        querySelector: (sel) => (sel === '#nested-email' ? null : sel === '#light-name' ? lightInput : null),
        querySelectorAll: (sel) => {
            if (sel === 'input, textarea, select') return [lightInput];
            if (sel === '*') return [lightInput, hostElement];
            return [];
        }
    };

    const allInputs = ShadowDomEngine.extractAllInputs(rootNode);
    assert.deepEqual(allInputs, [lightInput, shadowInput]);
    assert.equal(ShadowDomEngine.querySelectorDeep('#nested-email', rootNode), shadowInput);
    assert.equal(ShadowDomEngine.querySelectorDeep('#missing', rootNode), null);
});

test('react-bridge setReactInputValue and setReactTextAreaValue reset _valueTracker before dispatching events', () => {
    const { createControlledElement } = createReactRealm();

    const inputHarness = createControlledElement({ tagName: 'INPUT', initialValue: '' });
    assert.equal(setReactInputValue(inputHarness.el, 'alice@example.com'), true);
    assert.equal(inputHarness.el.value, 'alice@example.com');
    assert.deepEqual(inputHarness.dispatchedEvents, ['input', 'change', 'blur']);
    assert.equal(inputHarness.onChangeCalls.length, 1);
    assert.equal(inputHarness.onChangeCalls[0].value, 'alice@example.com');

    // Clearing to empty string must also fire React onChange
    assert.equal(setReactInputValue(inputHarness.el, ''), true);
    assert.equal(inputHarness.el.value, '');
    assert.equal(inputHarness.onChangeCalls.length, 2);
    assert.equal(inputHarness.onChangeCalls[1].value, '');

    // Textarea support
    const taHarness = createControlledElement({ tagName: 'TEXTAREA', initialValue: 'old' });
    assert.equal(setReactTextAreaValue(taHarness.el, 'new cover letter'), true);
    assert.equal(taHarness.el.value, 'new cover letter');
    assert.equal(taHarness.onChangeCalls.length, 1);
    assert.equal(taHarness.onChangeCalls[0].value, 'new cover letter');
});

test('react-bridge setReactSelectValue avoids empty placeholder options and triggers React onChange', () => {
    const { createControlledElement } = createReactRealm();
    const { el, onChangeCalls } = createControlledElement({
        tagName: 'SELECT',
        type: 'select-one',
        initialValue: '',
        options: [
            { value: '', text: '' },
            { value: '', text: '-- Select --' },
            { value: '2025', text: '2025' },
            { value: 'US', text: 'United States' }
        ]
    });

    // Numeric value and partial text match should ignore empty placeholder options
    assert.equal(setReactSelectValue(el, 'United States of America'), true);
    assert.equal(el.value, 'US');
    assert.equal(onChangeCalls.length, 1);
    assert.equal(onChangeCalls[0].value, 'US');

    assert.equal(setReactSelectValue(el, 2025), true);
    assert.equal(el.value, '2025');
    assert.equal(onChangeCalls.length, 2);
    assert.equal(onChangeCalls[1].value, '2025');

    // Empty string targets empty value option directly, whereas unmatched non-empty returns false
    assert.equal(setReactSelectValue(el, 'Nonexistent Country'), false);
});

test('react-bridge setFieldValue handles checkbox, shadow-root radio group, file, and null guards', () => {
    const { createControlledElement } = createReactRealm();

    // Checkbox
    const cb = createControlledElement({ tagName: 'INPUT', type: 'checkbox', initialChecked: false });
    assert.equal(setFieldValue(cb.el, 'yes'), true);
    assert.equal(cb.el.checked, true);
    assert.equal(cb.onChangeCalls.length, 1);
    assert.equal(cb.onChangeCalls[0].value, true);

    // Radio group inside a ShadowRoot (using getRootNode)
    const rYes = createControlledElement({ tagName: 'INPUT', type: 'radio', name: 'auth', initialChecked: false });
    const rNo = createControlledElement({ tagName: 'INPUT', type: 'radio', name: 'auth', initialChecked: false });
    rYes.el.value = 'yes';
    rNo.el.value = 'no';
    const shadowRoot = {
        querySelectorAll: () => [rYes.el, rNo.el]
    };
    rYes.el.getRootNode = () => shadowRoot;
    rNo.el.getRootNode = () => shadowRoot;

    assert.equal(setFieldValue(rYes.el, 'NO'), true);
    assert.equal(rNo.el.checked, true);
    assert.equal(rNo.onChangeCalls.length, 1);

    // File input and null guards
    const fileInput = createControlledElement({ tagName: 'INPUT', type: 'file' });
    assert.equal(setFieldValue(fileInput.el, 'resume.pdf'), false);
    assert.equal(setFieldValue(null, 'anything'), false);
    assert.equal(setReactInputValue(cb.el, null), false);
});
