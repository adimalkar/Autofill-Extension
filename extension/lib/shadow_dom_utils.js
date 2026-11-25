/**
 * Core utility library for penetrating and interacting with deeply nested Shadow DOM boundaries.
 * Modern Applicant Tracking Systems (e.g., SmartRecruiters, Workday) heavily rely on encapsulated web components.
 * Standard document.querySelector() fails here. This library provides recursive traversal mechanisms.
 */

export class ShadowDomEngine {
  /**
   * Recursively discovers all interactable form inputs within the entire document tree,
   * bypassing any open Shadow DOM encapsulation boundaries.
   *
   * @param {Element|Document} rootNode - The starting node for traversal (usually document.body)
   * @returns {Array<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>} Flat array of all input fields
   */
  static extractAllInputs(rootNode = document.body) {
    const inputs = new Set();
    
    // Safety check
    if (!rootNode) return [];

    const traverse = (node) => {
      if (!node) return;
      const elements = node.querySelectorAll('input, textarea, select');
      for (const el of elements) {
        inputs.add(el);
      }

      const allNodes = node.querySelectorAll('*');
      for (const el of allNodes) {
        if (el.shadowRoot) {
          traverse(el.shadowRoot);
        }
      }
    };

    traverse(rootNode);
    return Array.from(inputs);
  }

  /**
   * Recursively finds the first element matching a CSS selector through any depth of open Shadow DOM roots.
   *
   * @param {string} selector - Standard CSS selector
   * @param {Element|Document} rootNode - Root node to begin deep search
   * @returns {Element|null} Found element or null
   */
  static querySelectorDeep(selector, rootNode = document.body) {
    if (!rootNode) return null;
    const localMatch = rootNode.querySelector(selector);
    if (localMatch) return localMatch;

    const allElements = rootNode.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowMatch = this.querySelectorDeep(selector, el.shadowRoot);
        if (shadowMatch) return shadowMatch;
      }
    }
    return null;
  }

  /**
   * Dispatches synthetic events to satisfy modern React/Vue/Angular state managers.
   * Dynamically handles HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement,
   * and properly synchronizes both .value and .checked states with native prototypes
   * and React's internal _valueTracker before event dispatch.
   * 
   * @param {HTMLElement} element - The target input, textarea, or select field
   * @param {string|boolean} value - The value to inject
   */
  static injectValueSecurely(element, value) {
    if (!element) return;

    const view = element.ownerDocument?.defaultView || globalThis;
    const EventCtor = view?.Event || globalThis.Event;
    const isCheckable = element.type === 'checkbox' || element.type === 'radio';

    if (isCheckable) {
      const previousChecked = Boolean(element.checked);
      const boolVal =
        typeof value === 'boolean'
          ? value
          : String(value).toLowerCase() === 'true' || String(value) === '1';

      let setViaNative = false;
      try {
        const inputProto = view?.HTMLInputElement?.prototype;
        const nativeCheckedSetter = inputProto
          ? Object.getOwnPropertyDescriptor(inputProto, 'checked')?.set
          : null;
        if (nativeCheckedSetter) {
          nativeCheckedSetter.call(element, boolVal);
          setViaNative = true;
        }
      } catch (e) {
        console.warn('React checkbox descriptor override failed:', e);
      }

      if (!setViaNative) {
        element.checked = boolVal;
      }

      // Reset React's value tracker BEFORE dispatching events so onChange recognizes the change
      if (element._valueTracker && typeof element._valueTracker.setValue === 'function') {
        const trackedPrevious =
          previousChecked !== boolVal ? String(previousChecked) : String(!boolVal);
        element._valueTracker.setValue(trackedPrevious);
      }
    } else {
      const previousValue =
        element.value !== undefined && element.value !== null ? String(element.value) : '';
      const tagName = element.tagName?.toUpperCase();

      let proto = view?.HTMLInputElement?.prototype;
      if (tagName === 'TEXTAREA') {
        proto = view?.HTMLTextAreaElement?.prototype;
      } else if (tagName === 'SELECT') {
        proto = view?.HTMLSelectElement?.prototype;
      }

      let setViaNative = false;
      try {
        const nativeValueSetter = proto
          ? Object.getOwnPropertyDescriptor(proto, 'value')?.set
          : null;
        if (nativeValueSetter) {
          nativeValueSetter.call(element, value);
          setViaNative = true;
        }
      } catch (e) {
        console.warn('React property descriptor override failed:', e);
      }

      if (!setViaNative) {
        element.value = value;
      }

      // Reset React's value tracker BEFORE dispatching events so onChange recognizes the change
      if (element._valueTracker && typeof element._valueTracker.setValue === 'function') {
        const currentValue =
          element.value !== undefined && element.value !== null ? String(element.value) : '';
        const trackedPrevious =
          previousValue !== currentValue ? previousValue : (currentValue === '' ? ' ' : '');
        element._valueTracker.setValue(trackedPrevious);
      }
    }

    // Simulate natural user interaction event sequence for framework listeners.
    // Omit 'click' for checkables because programmatic click toggles .checked back in browsers.
    const eventTypes = isCheckable ? ['input', 'change'] : ['focus', 'input', 'change', 'blur'];
    eventTypes.forEach(eventType => {
      const event = new EventCtor(eventType, {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
    });
  }
}

