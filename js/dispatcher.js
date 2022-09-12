import {
   GenerateQueue, LoadSettings,
   TooltipsActivator, TooltipsTranslate, TranslateHTML,
   TypeJiraffeSettings, ContextMenuClose, TooltipsRemover
} from "./common.js";


// После загрузка страницы, загружаем настройки и назначаем события на кнопки
document.addEventListener("DOMContentLoaded", () => {

   // Отображаю проекты и очереди
   RenderProjects(document.getElementById('projectsList'));

   // Так же отрисовка каждые 10 секунд
   setInterval(() => {
      TooltipsRemover();
      RenderProjects(document.getElementById('projectsList'));
   }, 10000);

   // Запрос обновления задач и перерисовка их на экране
   document.getElementById('updateBtn').addEventListener('click', () => {
      chrome.runtime.sendMessage('update', status => {
         if (status.status) {
            RenderProjects(document.getElementById('projectsList'));
         }
      });
   });

   // Назначение текущего дня на поле ввода даты
   document.getElementById('taskFilter_date').value = inputDateFormatter(Date.now());

   // Нажатие на кнопку текущего дня
   document.getElementById('currentDay').addEventListener('click', () => {

      // Сменяю дату на текущий день
      let taskFilter_date = document.getElementById('taskFilter_date');
      taskFilter_date.value = inputDateFormatter(Date.now());

      // Отображаю задачи
      RenderProjects(document.getElementById('projectsList'));
   });

   // Нажатие на кнопку предыдущего дня
   document.getElementById('previousDay').addEventListener('click', () => {

      // Сменяю дату на предыдущий день
      let taskFilter_date = document.getElementById('taskFilter_date');
      let changeDate = new Date(taskFilter_date.valueAsNumber);

      taskFilter_date.value = inputDateFormatter(
         new Date(changeDate).setDate(changeDate.getDate() - 1)
      );

      // Отображаю задачи
      RenderProjects(document.getElementById('projectsList'));
   });

   // Нажатие на кнопку следующего дня
   document.getElementById('nextDay').addEventListener('click', () => {

      // Сменяю дату на следующего день
      let taskFilter_date = document.getElementById('taskFilter_date');
      let changeDate = new Date(taskFilter_date.valueAsNumber);

      taskFilter_date.value = inputDateFormatter(
         new Date(changeDate).setDate(changeDate.getDate() + 1)
      );

      // Отображаю задачи
      RenderProjects(document.getElementById('projectsList'));
   });

   // Скрытия альтернативного контекстного меню
   document.addEventListener('mousedown',
      (event) => ContextMenuClose(
         event,
         document.getElementById('context_menu')
      ));

   // Назначение прокрутки при перетаскивании задач
   document.getElementById('scroll_top').addEventListener('dragover', event => {
      event.preventDefault();
      window.scrollBy(0, -90);
   });
   document.getElementById('scroll_bottom').addEventListener('dragover', event => {
      event.preventDefault();
      window.scrollBy(0, 90);
   });

   // Перевод элементов и активация подсказок
   TranslateHTML();
   TooltipsTranslate();
   TooltipsActivator();

});


/**
 * Формирует и отображает проекты в виде раскрывающейся гармошки
 * @param {HTMLElement} htmlProjectsList верхний <div>-блок с классом accordion
 */
function RenderProjects(htmlProjectsList) {
   //Предварительное удаление отображаемых подсказок
   TooltipsRemover();

   LoadSettings(new TypeJiraffeSettings).then(settings => {

      // Предварительная очистка блока проектов
      while (htmlProjectsList.lastChild) {
         htmlProjectsList.removeChild(htmlProjectsList.lastChild);
      }

      // Перебираю имеющиеся проекты
      for (const project of settings.Projects) {

         let accordionItem = document.createElement('div');
         accordionItem.classList.add('accordion-item');

         // Создание заголовка гармошки
         let accordionHeader = document.createElement('h3');
         let accordionHeaderButton = document.createElement('button');
         accordionHeaderButton.classList.add('accordion-button', 'p-2');
         accordionHeaderButton.dataset.bsToggle = 'collapse';
         accordionHeaderButton.dataset.bsTarget = '#' + project.ID;
         accordionHeaderButton.innerText = project.Name;

         accordionHeader.appendChild(accordionHeaderButton);
         accordionItem.appendChild(accordionHeader);

         // Создание тела гармошки
         let accordionCollapse = document.createElement('div');
         accordionCollapse.classList.add('accordion-collapse', 'collapse', 'show');
         accordionCollapse.id = project.ID;

         let accordionCollapseBody = document.createElement('div');
         accordionCollapseBody.classList.add('accordion-body', 'd-flex', 'flex-wrap', 'justify-content-center');

         accordionCollapse.appendChild(accordionCollapseBody);
         accordionItem.appendChild(accordionCollapse);

         // Перебираю очереди проекта и создаю их
         for (const queue of project.Queues) {

            accordionCollapseBody.appendChild(
               GenerateQueue(
                  queue,
                  document.getElementById('taskFilter_date').valueAsNumber,
                  settings.TimeFrom,
                  settings.TimeTo,
                  document.getElementById('taskFilter_all').checked,
                  settings.TimeDividing,
                  settings.JiraURL,
                  settings.ColorChanger
               ));
         }
         htmlProjectsList.appendChild(accordionItem);
      }
      // Активация всех подсказок
      TooltipsActivator();
   });



}

/**
 * Переформатирует дату для присвоения в input.type='date'
 */
function inputDateFormatter(timestamp) {
   let now = new Date(timestamp);
   return now.getFullYear() + '-' +
      (now.getMonth() < 9 ? '0' + (now.getMonth() + 1) + '-' : (now.getMonth() + 1) + '-') +
      (now.getDate() < 10 ? '0' + now.getDate() : now.getDate());
}