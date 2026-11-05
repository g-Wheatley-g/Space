(function () {
  'use strict';

  function initHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    // Учитываем фактическую высоту переносимой навигации при переходах по якорям.
    function updateHeaderHeight() {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(header);
  }

  function initVisitForm() {
    const form = document.getElementById('visit-form');
    if (!form) return;

    // Даже неполная разметка демоформы не должна приводить к отправке данных.
    form.addEventListener('submit', function (event) {
      event.preventDefault();
    });

    const dateInput = form.querySelector('#visit-date');
    const result = form.querySelector('#form-result');
    const checkButton = form.querySelector('#check-button');
    const fields = [
      { input: form.querySelector('#guest-name'), error: form.querySelector('#name-error') },
      { input: form.querySelector('#guest-email'), error: form.querySelector('#email-error') },
      { input: dateInput, error: form.querySelector('#date-error') },
      { input: form.querySelector('#guest-count'), error: form.querySelector('#count-error') }
    ];

    if (!dateInput || !result || !checkButton || fields.some(function (field) {
      return !field.input || !field.error;
    })) return;

    let attempted = false;
    const invalidResult = 'Проверьте отмеченные поля. Данные не отправлены. Бронирование не создано.';
    const validResult = 'Проверка пройдена. Это учебный макет: данные не отправлены и не сохранены сайтом. Столик не забронирован.';

    // Локальная дата браузера: toISOString() с датой UTC здесь не используется.
    function setToday() {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const today = `${now.getFullYear()}-${month}-${day}`;
      dateInput.min = today;
      return today;
    }

    function validateField(field) {
      const input = field.input;
      const value = input.value.trim();
      let message = '';

      if (input.validity.badInput) {
        message = 'Введите корректную дату.';
      } else if (!value) {
        message = {
          'guest-name': 'Введите имя.', 'guest-email': 'Введите email.',
          'visit-date': 'Выберите дату.', 'guest-count': 'Выберите число гостей.'
        }[input.id];
      } else if (input.id === 'guest-email' && input.validity.typeMismatch) {
        message = 'Введите email в формате name@example.com.';
      } else if (input.id === 'visit-date') {
        const today = setToday();
        if (!Number.isFinite(input.valueAsNumber)) message = 'Введите корректную дату.';
        else if (input.valueAsNumber < Date.parse(`${today}T00:00:00Z`)) message = 'Дата не может быть раньше сегодняшней.';
      } else if (input.id === 'guest-count' && !/^[1-8]$/.test(value)) {
        message = 'Выберите от 1 до 8 гостей.';
      }

      field.error.textContent = message;
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      return !message;
    }

    form.addEventListener('submit', function () {
      attempted = true;
      setToday();
      let firstInvalid = null;
      fields.forEach(function (field) {
        if (!validateField(field) && !firstInvalid) firstInvalid = field.input;
      });
      if (firstInvalid) {
        result.textContent = invalidResult;
        firstInvalid.focus();
        return;
      }
      result.textContent = validResult;
      result.focus();
    });

    fields.forEach(function (field) {
      field.input.addEventListener('input', function () {
        result.textContent = '';
        if (attempted) validateField(field);
      });
      field.input.addEventListener('blur', function () {
        if (attempted) validateField(field);
      });
    });

    function refreshDateConstraints() {
      setToday();
      if (!attempted) return;

      // После возврата дата могла стать прошедшей. Ввод сохраняем, ошибки обновляем.
      let invalid = false;
      fields.forEach(function (field) {
        if (!validateField(field)) invalid = true;
      });
      if (result.textContent) result.textContent = invalid ? invalidResult : validResult;
    }

    dateInput.addEventListener('focus', refreshDateConstraints);
    window.addEventListener('pageshow', refreshDateConstraints);
    setToday();
    checkButton.disabled = false;
  }

  initHeader();
  initVisitForm();
}());
