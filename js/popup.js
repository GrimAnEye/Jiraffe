import {
   TypeJiraffeSettings,
   TranslateHTML, LoadSettings,
   JiraGetCurrentUser,
   ContextMenuClose,
   TooltipsActivator,
   TooltipsRemover,
   TooltipsTranslate,
   GenerateQueue,
   IsNewerVersion

} from './common.js';


document.addEventListener('DOMContentLoaded', () => {

   // Перевожу страницу
   TranslateHTML();
   // Перевожу подсказки
   TooltipsTranslate();
   //Активирую подсказки
   TooltipsActivator();

   // Ссылка на настройки расширения
   document.getElementById('settingsButton').addEventListener('click', () => {
      document.getElementById('settingsButton').href =
         'chrome-extension://' +
         chrome.i18n.getMessage('@@extension_id') +
         '/html/options.html';
   });

   // Ссылка на диспетчерскую
   document.getElementById('dispatcherBtn').addEventListener('click', () => {
      document.getElementById('dispatcherBtn').href =
         'chrome-extension://' +
         chrome.i18n.getMessage('@@extension_id') +
         '/html/dispatcher.html';
   });

   // Функция скрытия альтернативного контекстного меню
   document.addEventListener('mousedown',
      (event) => ContextMenuClose(
         event,
         document.getElementById('context_menu')
      ));

   //Обновление и перерисовка задач
   document.getElementById('updateBtn').addEventListener('click', () => {
      chrome.runtime.sendMessage('update', status => {
         if (status.status) {
            TooltipsRemover();
            availabilityCheck();
         }
      });
   });

   // Проверка наличия новой версии и отображение кнопки
   {
      let newVersionBtn = document.getElementById('newVersion');
      LoadSettings("LastVersion").then(settings => {

         // Если есть новая версия
         if (settings.LastVersion.Version) {

            // Проверяю, что текущая версия не обновлена
            if (IsNewerVersion(
               chrome.runtime.getManifest().version,
               settings.LastVersion.Version)) {

               newVersionBtn.classList.remove('d-none');
               newVersionBtn.href = settings.LastVersion.Url;
            }


         }
      });
   }


   // Запуск перерисовки popup каждые 10 секунд
   setInterval(() => {
      TooltipsRemover();
      // Проверка состояния и отрисовка очередей
      availabilityCheck();
   }, 10000);

   // Проверка состояния и отрисовка очередей
   availabilityCheck();

   // Назначение прокрутки при перетаскивании задач
   document.getElementById('scroll_top').addEventListener('dragover', event => {
      event.preventDefault();
      window.scrollBy(0, -90);
   });
   document.getElementById('scroll_bottom').addEventListener('dragover', event => {
      event.preventDefault();
      window.scrollBy(0, 90);
   });
});

/**
 * Проверяет наличие настроек и меняет отображение стартовых объектов
 */
function availabilityCheck() {

   // Загружаю настройки
   LoadSettings(new TypeJiraffeSettings).then(settings => {
      // В случае ошибок - необходимо скрыть интерфейс
      let showAuth = () => {
         document.getElementById('auth_card').classList.remove('d-none');
         document.getElementById('renderContainer').classList.add('d-none');
         document.getElementById('dispatcherBtn').classList.add('d-none');
      }

      // Если настроек нет - ничего не делаю
      if (JSON.stringify(settings) == JSON.stringify(new TypeJiraffeSettings)) {
         showAuth();
      }

      // Если сервер jira указан, то навешиваю действие на кнопку авторизации
      if (settings.JiraURL != '') {

         // Запрашиваю данные пользователя, для проверки доступа к сервису
         JiraGetCurrentUser(settings.JiraURL)

            // Если же данные есть, то меняю меню
            .then(() => {
               // Если включен режим диспетчера, то отображаю кнопку диспетчерской
               if (settings.User.Dispatcher) {
                  document.getElementById('dispatcherBtn').classList.remove('d-none');
               }

               RenderQueues(
                  document.getElementById('queuesList'),
                  settings.Projects,
                  settings.TimeFrom,
                  settings.TimeTo,
                  settings.TimeDividing,
                  settings.JiraURL,
                  settings.ColorChanger);

               //Активирую подсказки
               TooltipsActivator();
            })
            // Если ничего не вернулось - отображаю кнопку авторизации
            .catch(error => {
               showAuth();
               document.getElementById('authButton').classList.remove('d-none');
               document.getElementById('authButton').href = settings.JiraURL;

               if (error.status == 401) {
                  console.log('need auth');
               } else {
                  console.log(error);
               }
            })
      } else {
         showAuth();
      }
   });
}

/**
 * Генерирует очереди и размещает их на указанном <div>-блоке
 * @param {HTMLElement}       htmlQueuesList <div> блок для вывода проектов
 * @param {Project[]}         projects       массив проектов, сохраненных в настройках
 * @param {number}            from           час, с которого начинается день
 * @param {number}            to             час, которым заканчивается день
 * @param {string}            jiraURL        адрес сервера Jira
 * @param {TypeColorChanger} colorChanger объект цветовой ассоциации, для определения цвета задачи
 */
export function RenderQueues(htmlQueuesList, projects, from, to, dividing, jiraURL, colorChanger) {

   // Очищаю таблицы
   while (htmlQueuesList.lastChild) {
      htmlQueuesList.removeChild(htmlQueuesList.lastChild);
   }

   // Прохожусь по всем проектам и очередям, создавая выбранные очереди
   for (const project of projects) {
      for (const queue of project.Queues) {

         // Если очередь выбрана, создаю её 
         if (queue.ShowInPopup) {
            let queueElement = GenerateQueue(
               queue, Date.now(), from, to,
               true, dividing, jiraURL,
               colorChanger);

            htmlQueuesList.appendChild(queueElement);
         }
      }
   }
   if (htmlQueuesList.childElementCount > 1) {
      htmlQueuesList.style = 'width:690px';
   } else {
      htmlQueuesList.style = '';
   }
};