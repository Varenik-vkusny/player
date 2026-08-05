/*
  Классический скрипт, не модуль: страница обязана открываться
  двойным щелчком с file://, а ES-модули оттуда не грузятся.

  Здесь единственное живое поведение каркаса — смена темы сцены.
  Оно живое не для красоты: это наглядное доказательство измерения S11.
  Меняется ОДНА переменная на предке, ни один элемент сцены не трогается
  и не перерисовывается. Если бы тема требовала обхода элементов, она
  стоила бы в схеме и в плеере совсем других денег.
*/
(function () {
  var scene = document.getElementById('scene');
  var group = document.getElementById('themes');
  if (!scene || !group) return;

  group.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-theme]');
    if (!button) return;

    var theme = button.getAttribute('data-theme');

    // Вся смена темы — эта строка. Больше ничего не происходит.
    if (theme) scene.setAttribute('data-theme', theme);
    else scene.removeAttribute('data-theme');

    var buttons = group.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i] === button));
    }
  });

  // Рельс и переключатель вида — только переключение нажатого состояния:
  // содержимого за ними в Сессии 19 ещё нет, и притворяться, что есть,
  // было бы обещанием, которое нечем исполнить.
  document.querySelectorAll('.rail, .viewswitch[aria-label="Вид"]').forEach(function (group) {
    group.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      group.querySelectorAll('button').forEach(function (other) {
        other.setAttribute('aria-pressed', String(other === button));
      });
    });
  });
})();
