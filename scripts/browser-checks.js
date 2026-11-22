(function () {
  'use strict';

  // Runs against the actual page and its scripts; no duplicated form fixture.
  window.addEventListener('load', function () {
    const checks = [];
    const form = document.getElementById('visit-form');
    const name = document.getElementById('guest-name');
    const email = document.getElementById('guest-email');
    const date = document.getElementById('visit-date');
    const count = document.getElementById('guest-count');
    const result = document.getElementById('form-result');
    const button = document.getElementById('check-button');
    const fields = [name, email, date, count];

    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }

    function check(label, run) {
      try {
        run();
        checks.push({ name: label, passed: true });
      } catch (error) {
        checks.push({ name: label, passed: false, error: error.message });
      }
    }

    function localDate(value) {
      return value.getFullYear() + '-' +
        String(value.getMonth() + 1).padStart(2, '0') + '-' +
        String(value.getDate()).padStart(2, '0');
    }

    function fillValid() {
      name.value = 'Test Guest';
      email.value = 'guest@example.com';
      date.value = localDate(new Date());
      count.value = '2';
      fields.forEach(function (field) {
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    function submit() {
      assert(button && !button.disabled, 'Submit button was not initialized');
      // Exercise the actual submit control, including the form event wiring.
      button.click();
    }

    check('empty form marks required fields and focuses the first one', function () {
      assert(form && fields.every(Boolean) && result, 'Required form elements are missing');
      form.reset();
      submit();
      fields.forEach(function (field) {
        assert(field.getAttribute('aria-invalid') === 'true', field.id + ' was not marked invalid');
      });
      assert(document.activeElement === name, 'Focus did not move to the name field');
    });

    check('malformed email is rejected', function () {
      fillValid();
      email.value = 'not-an-email';
      submit();
      assert(email.getAttribute('aria-invalid') === 'true', 'Invalid email was accepted');
      assert(document.activeElement === email, 'Focus did not move to the email field');
    });

    check('a past date is rejected', function () {
      fillValid();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date.value = localDate(yesterday);
      submit();
      assert(date.getAttribute('aria-invalid') === 'true', 'A past date was accepted');
      assert(document.activeElement === date, 'Focus did not move to the date field');
    });

    check('valid values pass and focus the result', function () {
      fillValid();
      submit();
      fields.forEach(function (field) {
        assert(field.getAttribute('aria-invalid') !== 'true', field.id + ' remained invalid');
      });
      assert(result.textContent.includes('\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u0440\u043e\u0439\u0434\u0435\u043d\u0430'), 'Success message is missing');
      assert(document.activeElement === result, 'Focus did not move to the result');
    });

    check('editing a field clears the old result', function () {
      name.value = 'Updated Guest';
      name.dispatchEvent(new Event('input', { bubbles: true }));
      assert(result.textContent === '', 'Stale result remained visible');
    });

    check('restoring the page preserves entered values', function () {
      fillValid();
      submit();
      const before = fields.map(function (field) { return field.value; });
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      fields.forEach(function (field, index) {
        assert(field.value === before[index], field.id + ' was cleared on pageshow');
      });
      assert(date.min === localDate(new Date()), 'Minimum date was not refreshed');
    });

    check('returning after midnight invalidates yesterday without clearing the form', function () {
      fillValid();
      submit();
      const before = fields.map(function (field) { return field.value; });
      const ActualDate = window.Date;
      const tomorrow = new ActualDate();
      tomorrow.setDate(tomorrow.getDate() + 1);
      try {
        window.Date = class extends ActualDate {
          constructor(...argumentsList) {
            if (argumentsList.length) super(...argumentsList);
            else super(tomorrow.getTime());
          }
        };
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        fields.forEach(function (field, index) {
          assert(field.value === before[index], field.id + ' was cleared after midnight');
        });
        assert(date.min === localDate(tomorrow), 'Minimum date did not advance');
        assert(date.getAttribute('aria-invalid') === 'true', 'Yesterday remained valid after midnight');
        assert(!result.textContent.includes('\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u043f\u0440\u043e\u0439\u0434\u0435\u043d\u0430'), 'Stale success remained after midnight');
      } finally {
        window.Date = ActualDate;
      }
    });

    const output = document.createElement('pre');
    output.id = 'browser-check-results';
    output.textContent = JSON.stringify(checks);
    document.body.appendChild(output);
    document.body.setAttribute('data-browser-check-status', checks.every(function (item) {
      return item.passed;
    }) ? 'passed' : 'failed');
  });
})();
