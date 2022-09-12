/**
 * Загружает настройки из хранилища
 * @param {string} key ключ запрашиваемых настроек
 * @returns {Promise<TypeJiraffeSettings>}
 */
export function LoadSettings(key) {
   return new Promise(resolve => {
      chrome.storage.local.get(key, data => resolve(data))
   });
};

/**
 * Получение куки из хранилища
 * @param  {string} domain адрес хоста JIRA
 * @example 'http://example.com/jira'
 * @param  {string} name имя cookie файла для запроса
 * @return {Promise<object>} возвращает куки Jira
 */
export function GetCookies(domain, name) {
   return chrome.cookies.get({ "url": domain, "name": name });
};


/**
 * Удаляет все отображаемые блоки подсказок с экрана
 */
export function TooltipsRemover() {
   let tooltipList = document.getElementsByClassName('tooltip');
   for (let elem of tooltipList) { elem.remove(); }
};

//==============================================================//

/**
 * Событие возникающее при начале переноса задачи между очередями.
 * Удаляет отображение подсказок и отображает полоски прокрутки сверху
 * и снизу экрана
 * @param {MouseEvent} ev объект события мыши
 * @returns {boolean}
 */
export function DragStart(ev) {
   // Удаление всех подсказок с экрана, чтобы не загораживали перенос
   TooltipsRemover();

   // Отображение полосок прокруток
   document.getElementById('scroll_top').classList.remove('d-none');
   document.getElementById('scroll_bottom').classList.remove('d-none');

   // Подготовка к переносу данных
   ev.dataTransfer.effectAllowed = 'move';
   ev.dataTransfer.setData("Text", ev.target.getAttribute('id'));
   ev.dataTransfer.setDragImage(ev.target, 30, 30);

};

// После окончания перетаскивания элемента, скрывает полоски прокрутки
export function DragEnd(ev) {
   ev.preventDefault();
   // Скрываю полоски прокрутки
   document.getElementById('scroll_top').classList.add('d-none');
   document.getElementById('scroll_bottom').classList.add('d-none');
};

// Нужен для правильной отработки события DragDrop
export function DragOver(ev) {
   ev.preventDefault();
};

/**
 * Событие возникающее при сбросе задачи в очередь
 * @param {MouseEvent} ev 
 * @returns {boolean}
 */
export function DragDrop(ev) {
   // Получаем отправленные данные
   var data = ev.dataTransfer.getData("Text");
   let issue = document.getElementById(data);

   // Проверяю наличие родителя <td>
   if (ev.target.closest('td')) {

      LoadSettings(new TypeJiraffeSettings)
         .then(settings => {

            // Если настроек нет - ничего не делаю
            if (JSON.stringify(settings) == JSON.stringify(new TypeJiraffeSettings)) {
               return
            }

            // Получаю ключ задачи
            let issueKey = data;

            // Получаю нового исполнителя
            let assignee = ev.target.closest('table').dataset.assignee ? ev.target.closest('table').dataset.assignee : null;

            // Получаю время для задачи
            let newTime = '';

            // Если в очереди есть время
            if (ev.target.closest('tr').getElementsByClassName('td_time').length > 0) {
               // Получаю часы
               let hours = parseInt(
                  ev.target
                     .closest('tr')
                     .getElementsByClassName('td_time')[0]
                     .innerText
                     .split(':')[0]);

               // Получаю минуты задачи
               let minutes = issue.getElementsByTagName('span')[0] ?
                  parseInt(issue.getElementsByTagName('span')[0]
                     .innerText.replace(':', '')) : 0;

               // Получаю новое время для задачи
               newTime = JiraTimeToFormat(
                  new Date(new Date().setHours(hours, minutes, 0, 0))
               );
            } else {
               // Если очередь общая (без времени), то удаляю время
               newTime = null;
            }

            JiraUpdateIssue(
               settings.JiraURL,
               issueKey,
               assignee,
               settings.TimeField,
               newTime
            ).then(() => {
               // Отправляю запрос на обновление локальных данных
               chrome.runtime.sendMessage('update', status => {
                  if (status.status) {
                     console.log('request update. Result:' + status.status)
                  }
               });

            }).catch(err => console.log(err));
         });

      // Перемещаю на новое место, предварительно его найдя
      ev.target.closest('td').appendChild(issue);
      ev.stopPropagation();

   }
};

/**
 * Формирует и отображает контекстное меню задачи
 * Состоит из временных меток, зависящих от параметра деления часа
 * @param {MouseEvent} event 
 */
export function ContextMenuOpen(event) {
   event.preventDefault();

   // Если у очереди есть время, тогда рисовать меню
   if (event.target.closest('tr').getElementsByClassName('td_time').length > 0) {

      let menu = document.getElementById('context_menu');
      let ul = menu.getElementsByTagName('ul')[0];

      // Загружаю настройки
      LoadSettings(new TypeJiraffeSettings).then(settings => {
         // Если настроек нет - ничего не делаю
         if (JSON.stringify(settings) == JSON.stringify(new TypeJiraffeSettings)) {
            return false;
         }

         // Предварительно очищаю меню
         while (ul.lastChild) {
            ul.removeChild(ul.lastChild)
         }

         // Получаю часть часа
         let part = 60 / settings.TimeDividing;

         // Формирую меню
         for (let i = 0; i < settings.TimeDividing; i++) {

            // Вычисляю новое время для задачи
            let hour = parseInt(event.target.closest('tr')
               .classList[0].split('_')[0].replace('t', ''));
            let minutes = i * part;

            let li = document.createElement('li');
            let btn = document.createElement('btn');
            btn.classList.add('dropdown-item');
            btn.innerText = chrome.i18n.getMessage('context_menu_btn_appoint_at') + (
               (i * part) < 10 ?
                  '0' + (i * part) :
                  i * part
            );
            btn.addEventListener('click', () => {
               ContextMenuUpdateIssue(
                  event,
                  settings.JiraURL,
                  settings.TimeField,
                  hour,
                  minutes);

            });

            li.appendChild(btn);
            ul.appendChild(li);
         }

         // Проверка, если меню выходит за границы окна,
         // то вычесть разницу длины меню и текущего местоположения
         menu.style.left =
            (event.clientX + 200) >
               document.documentElement.clientWidth ?
               (document.documentElement.clientWidth - 200) + 'px' :
               event.pageX + 'px';

         menu.style.top =
            (event.clientY + (settings.TimeDividing * 32)) >
               document.documentElement.clientHeight ?
               (event.pageY - (settings.TimeDividing * 32)) + 'px' :
               event.pageY + 'px';

         menu.classList.remove('d-none');
      });
   }
};

/**
 * Функция обновляющая минуты задачи в Jira, а следовательно
 * и метки на задаче
 * @param {MouseEvent} event     объект события мыши
 * @param {string}     jiraURL   адрес сервера Jira
 * @param {string}     timeField поле для отслеживания времени
 * @param {number}     hour      час, для обновления задачи
 * @param {number}     minutes   минуты для обновления задачи
 */
export function ContextMenuUpdateIssue(event, jiraURL, timeField, hour, minutes) {
   // Обновление времени задачи
   JiraUpdateIssue(jiraURL,
      event.target.id,
      event.target.closest('table').dataset.assignee,
      timeField,
      JiraTimeToFormat(
         new Date().setHours(hour, minutes, 0, 0)
      )
   ).then(() => {
      // Отправляю запрос на обновление локальных данных
      chrome.runtime.sendMessage('update', status => {
         if (status.status) {
            console.log('request update. Result:' + status.status)
         }
      });

   }).catch(err => console.log(err));
};

/**
 * Скрывает контекстное меню, применяя display:none
 * @param {MouseEvent} event 
 * @param {HTMLElement} menu
 */
export function ContextMenuClose(event, menu) {

   if (menu) {
      if (event.button != 2) {
         setTimeout(() => { menu.classList.add('d-none') }, 150);
      }
   }
};

//==============================================================//

/**
 * Выполняет перевод страницы на язык браузера
 */
export function TranslateHTML() {
   let translateList = document.getElementsByClassName("chrome_i18n");

   for (const elem of translateList) {

      elem.innerText = chrome.i18n.getMessage(
         elem.dataset.chrome_i18n.replace(
            /__MSG_(\w+)__/, (_, value) => { return value; }
         )
      );
   }
};

/**
 * Выполняет перевод подсказок на странице
 */
export function TooltipsTranslate() {
   let translateList = document.querySelectorAll('[data-bs-toggle="tooltip"]:not(.issue)')
   for (const elem of translateList) {
      elem.title = chrome.i18n.getMessage(
         elem.title.replace(
            /__MSG_(\w+)__/, (_, value) => { return value; }
         )
      );
   }
};

/**
 * Активирует подсказки на странице
 */
export function TooltipsActivator() {
   let tooltipTriggerList = Array.prototype.slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
   let tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl)
   });
};

/**
 * Функция вызова уведомлений для пользователя
 * @param {string} text текст сообщения
 * @param {string} backgroundColor фоновый цвет уведомления, на базе классов .bg-... Bootstrap 5.1
 * @param {string} textColor цвет текста уведомления, на базе классов .text-... Bootstrap 5.1
 */
export function NotificationCreator(text, backgroundColor, textColor) {
   let div1 = document.createElement('DIV');
   div1.setAttribute('class', 'toast align-items-center ' + textColor + ' ' + backgroundColor + ' border-0');
   div1.setAttribute('data-bs-delay', '10000');

   let div2 = document.createElement('DIV');
   div2.setAttribute('class', 'd-flex');

   let div3 = document.createElement('DIV');
   div3.setAttribute('class', 'toast-body');
   div3.textContent = text;

   let close = document.createElement('button');
   close.setAttribute('type', 'button');
   close.setAttribute('class', 'btn-close btn-close-white me-2 m-auto');
   close.setAttribute('data-bs-dismiss', 'toast');

   div2.appendChild(div3);
   div2.appendChild(close);
   div1.appendChild(div2);

   document.getElementsByClassName('toast-container')[0].appendChild(div1);
   let toast = new bootstrap.Toast(div1);
   toast.show();
};

//=======================================================//
/**
 * Генерация уникального ID для проектов и очередей
 * @returns {string}
 */
export function GenerateID() {
   return Math.trunc(1 + Math.random() * Date.now()).toString(16).substring(1);
}

/**
 * @class Хранит настройки Jirafee
 */
export class TypeJiraffeSettings {
   /**
   * @typedef  {object}           TypeJiraffeSettings объект пользовательских настроек
   * @property {string}           JiraURL             адрес хоста JIRA. Например: http://example.com/jira
   * @property {string}           TimeField           поле Jira для отслеживания времени
   * @property {number}           TimeFrom            час начала рабочего дня
   * @property {number}           TimeTo              час завершения рабочего дня
   * @property {number}           TimeDividing        число, дробящее час на части
   * @property {TypeProject[]}    Projects            массив отслеживаемых проектов
   * @property {TypeUser}         User                данные текущего пользователя
   * @property {TypeColorChanger} ColorChanger        коллекция ключ-значение для хранения ассоциаций цветов
   * @property {TypeLastVersion}  LastVersion         хранит информацию по последней версии плагина
   */

   /**
    * @param {string}           jiraURL      адрес хоста JIRA. Например: http://example.com/jira
    * @param {string}           timeField    поле Jira для отслеживания времени
    * @param {number}           timeFrom     час начала рабочего дня
    * @param {number}           timeTo       час завершения рабочего дня
    * @param {number}           timeDividing число, дробящее час на части
    * @param {TypeProject[]}    projects     массив отслеживаемых проектов
    * @param {TypeUser}         user         данные текущего пользователя
    * @param {TypeColorChanger} colorChanger коллекция ассоциаций статуса задачи и цвета отображения
    * @param {TypeLastVersion}  lastVersion   информация по последней версии плагина
    */
   constructor(
      jiraURL, timeField,
      timeFrom, timeTo, timeDividing,
      user, projects, colorChanger, lastVersion) {

      this.JiraURL = jiraURL ? jiraURL : '';
      this.Projects = projects ? projects : [];
      this.TimeDividing = timeDividing ? timeDividing : 0;
      this.TimeField = timeField ? timeField : '';
      this.TimeFrom = timeFrom ? timeFrom : 0;
      this.TimeTo = timeTo ? timeTo : 0;
      this.User = function () { if (user) { return user } else { return new TypeUser } }();
      this.ColorChanger = colorChanger ? colorChanger : new TypeColorChanger();
      this.LastVersion = lastVersion ? lastVersion : new TypeLastVersion();
   }
};

/**
 * @class Описание и свойства отслеживаемого проекта
 */
export class TypeProject {
   /**
   * @typedef  {object} TypeProject данные по проектам
   * @property {string} ID      локальный ID проекта
   * @property {String} Name    название проекта
   * @property {TypeQueue[]}  Queues  массив очередей в проекте
   */

   /** 
   * @param   {string} id      локальный ID проекта
   * @param   {String} name    название проекта
   * @param   {TypeQueue[]}  queues  массив очередей в проекте
   */
   constructor(id, name, queues) {
      this.ID = id ? id : '';
      this.Name = name ? name : '';
      this.Queues = queues ? queues : [];
   }
};

/**
 * @class Описание очередей проекта
 */
export class TypeQueue {
   /**
   * @typedef  {object}  TypeQueue        очереди с параметрами
   * @property {string}  ID           локальный ID очереди 
   * @property {string}  Name         название очереди, используется для уведомлений исполнителя 
   * @property {string}  Assignee     логин исполнителя задачи
   * @property {string}  JQL          строка запроса задач
   * @property {boolean} IsCommon     является ли очередь общей. У общих очередей нет разделения по времени, отправляет уведомления диспетчеру
   * @property {boolean} ShowInPopup  отображать ли во всплывающем окне и присылать уведомления при изменении данной очереди
   * @property {TypeIssue[]} Issues       перечень задач данной очереди
   */

   /** 
   * @param   {string}  id           локальный ID очереди 
   * @param   {string}  name         название очереди, используется для уведомлений исполнителя 
   * @param   {string}  assignee     логин исполнителя задачи
   * @param   {string}  jql          строка запроса задач
   * @param   {boolean} isCommon     является ли очередь общей. У общих очередей нет разделения по времени, отправляет уведомления диспетчеру
   * @param   {boolean} showInPopup присылать ли уведомления при изменении данной очереди
   * @param   {TypeIssue[]} issues       перечень задач данной очереди
   */
   constructor(id, name, assignee, jql, isCommon, showInPopup, issues) {
      this.ID = id ? id : '';
      this.Name = name ? name : '';
      this.Assignee = assignee ? assignee : '';
      this.JQL = jql ? jql : '';
      this.IsCommon = isCommon ? isCommon : false;
      this.ShowInPopup = showInPopup ? showInPopup : false;
      this.Issues = issues ? issues : [];
   }
};

/**
 * @class Описание задачи в очереди
 */
export class TypeIssue {
   /**
   * @typedef  {object} TypeIssue   хранит описание задачи из очереди проекта Jira
   * @property {string} Key      ключ задачи. Например: PROJECT-00001
   * @property {string} Summary  заголовок задачи
   * @property {number} Time     время на которое назначена задача. Поле "customfield"
   * @property {string} Status   статус текущей задачи - В работе, Отложена, Открыта и т.д.
   * @property {string} Assignee текущий исполнитель задачи
   * @property {string} ReporterName имя автора задачи
   */

   /** 
   * @param {string} key      ключ задачи. Например: PROJECT-00001
   * @param {string} summary  заголовок задачи
   * @param {number} time     время на которое назначена задача. Поле "customfield"
   * @param {string} status   статус текущей задачи - В работе, Отложена, Открыта и т.д.
   * @param {string} assignee текущий исполнитель задачи
   * @param {string} reporterName имя автора задачи
   */
   constructor(key, summary, time, status, assignee, reporterName) {
      this.Key = key ? key : '';
      this.Summary = summary ? summary : '';
      this.Time = time ? time : 0;
      this.Status = status ? status : '';
      this.Assignee = assignee ? assignee : '';
      this.ReporterName = reporterName ? reporterName : '';
   }
};

/**
 * @class Настройки текущего пользователя
 */
export class TypeUser {
   /**
   * @typedef  {object}  TypeUser   данные пользователя
   * @property {string}  Login      логин пользователя в Jira
   * @property {string}  Name       отображаемое имя пользователя
   * @property {boolean} Dispatcher режим Диспетчера добавляет кнопку перехода во всплывающем окошке на страницу календаря, с бОльшим функционалом
   */

   /** 
   * @param   {string}  login      логин пользователя в Jira
   * @param   {string}  name       отображаемое имя пользователя
   * @param   {boolean} dispatcher режим Диспетчера добавляет кнопку перехода во всплывающем окошке на страницу календаря, с бОльшим функционалом
   */
   constructor(name, login, dispatcher) {
      this.Dispatcher = dispatcher ? dispatcher : false;
      this.Login = login ? login : '';
      this.Name = name ? name : '';
   }
};

/**
 * @class Ключ-значение статуса задачи и цвета
 */
export class TypeColorChanger {
   /**
    * @typedef TypeColorChanger ключ-значение для хранения ассоциации статуса и цвета
    * @type {Object}
    * @property {string} status название статуса задачи в Jira
    * @property {string} color  встроенный цвет кнопки bootstrap
    */

   /**
    * @param {Object?} colorChanger объект коллекции ключ-значение
    */
   constructor(colorChanger) {
      return colorChanger ? colorChanger : new Object;
   }
}

export class TypeLastVersion {
   /**
    * @typedef TypeLastVersion объект хранящий новую версию расширения
    * @property {string} Version номер новой версии расширения
    * @property {string} Url ссылка на страницу Github последней версии
    * @property {number} LastCheck время последней проверки
    */

   /**
    * @param {string} version строка версии в формате x.y.z
    * @param {string} url ссылка на страницу новой версии на github
    * @param {number} lastCheck время последней проверки
    */
   constructor(version, url, lastCheck) {
      this.Version = version ? version.trim() : '';
      this.Url = url ? url.trim() : '';
      this.LastCheck = lastCheck ? lastCheck : 0;
   }
}


//========================================================================================//

/**
 * Отправляет запрос в Jira и возвращает информацию о сервере.
 * Используется для проверки, что к серверу можно обратиться
 * @param {String} jiraURL адрес сервера Jira
 * @return {Promise<JSON>} возвращается информация о Jira
 */
export function JiraServerInfo(jiraURL) {
   if (jiraURL !== "") {
      return new Promise((resolve, reject) => {

         // Получаю cookie Jira
         GetCookies(jiraURL, "JSESSIONID")
            .then(async cookie => {

               if (!cookie) { reject(new Error('cookie not found')) }

               // Запрашиваю информацию о сервере
               const respond = await fetch(jiraURL + "/rest/api/2/serverInfo", {
                  method: "GET",
                  headers: {
                     "Accept": "application/json",
                     "Content-Type": "application/json",
                     "Cookie": "JSESSIONID=" + cookie
                  }
               });

               !respond.ok ?
                  reject(respond) :
                  resolve(await respond.json());

            })
            .catch(err => reject(err));
      });
   }
};

/**
 * Запрашивает из Jira JSON c данными текущего пользователя
 * @param {string} jiraURL адрес сервера Jira
 * @returns {Promise<JSON>} возвращает данные текущего пользователя
 */
export function JiraGetCurrentUser(jiraURL) {

   if (jiraURL !== "") {
      return new Promise((resolve, reject) => {

         // Получаю cookie Jira
         GetCookies(jiraURL, "JSESSIONID")
            .then(async cookie => {

               if (!cookie) { reject(new Error('cookie not found')) }

               // Запрашиваю данные текущего пользователя
               const respond = await fetch(jiraURL + "/rest/api/2/myself", {
                  method: "GET",
                  headers: {
                     "Accept": "application/json",
                     "Content-Type": "application/json",
                     "Cookie": "JSESSIONID=" + cookie
                  }
               });

               !respond.ok ?
                  reject(respond) :
                  resolve(await respond.json());

            })
            .catch(err => reject(err));

      });
   }
};
/**
 * Запрашивает список задач из Jira по jql строке
 * @param {string} jiraURL адрес сервера Jira
 * @param {string} jql строка запроса задач Jira
 * @param {string} [customfield] - запрос поля времени. Если не указывать, возвращаться не будет
 * @returns {Promise<JSON>} возвращает обещание с JSON списком задач
 */
export function JiraGetJqlIssues(jiraURL, jql, customfield) {

   // Формирую JSON для запроса данных
   let jqlObj = new Object;
   jqlObj.jql = jql;
   jqlObj.fields = ['key', 'summary', 'status', 'assignee', 'reporter'];

   if (customfield) {
      jqlObj.fields.push(customfield);
   }

   if (jiraURL !== "" && jql !== "") {
      return new Promise((resolve, reject) => {

         // Получаю cookie Jira
         GetCookies(jiraURL, "JSESSIONID")
            .then(async cookie => {

               if (!cookie) { reject(new Error('cookie not found')) };

               // Запрашиваю тикеты по JQL
               const respond = await fetch(jiraURL + '/rest/api/2/search', {
                  method: 'POST',
                  headers: {
                     'Accept': 'application/json',
                     'Content-Type': 'application/json',
                     'Cookie': 'JSESSIONID=' + cookie
                  },
                  body: JSON.stringify(jqlObj)
               });
               !respond.ok ?
                  reject(respond) :
                  resolve(await respond.json());

            })
            .catch(err => reject(err));
      });
   }
};

/**
 * Обновляет время и исполнителя задачи в Jira
 * @param {string} jiraURL адрес сервера Jira
 * @param {string} issueKey ключ требуемой задачи
 * @param {string} assignee логин нового исполнителя
 * @param {string} timeField отслеживаемое поле времени
 * @param {string} newTime время в формате Jira для обновления
 * @returns {Promise<JSON>} возвращает обещание с ответом сервера
 */
export function JiraUpdateIssue(jiraURL, issueKey, assignee, timeField, newTime) {
   return new Promise((resolve, reject) => {

      // Получаю cookie Jira
      GetCookies(jiraURL, "JSESSIONID")
         .then(async cookie => {

            if (!cookie) { reject(new Error('cookie not found')) };

            let data = JSON.stringify({
               'fields': {
                  [timeField]: newTime,
                  'assignee': { 'name': assignee }
               }
            });

            // Обновляю поля задачи
            const respond = await fetch(jiraURL + '/rest/api/2/issue/' + issueKey, {
               method: 'PUT',
               headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  'Cookie': 'JSESSIONID=' + cookie.value
               },
               body: data
            });
            !respond.ok ?
               reject(respond) :
               resolve(respond);
         })
         .catch(
            err => reject(err));
   });
}

/**
 * Форматирует timestamp в ISO-8601, который принимается Jira:
 * 0000-00-00T00:00:00.000+0000
 * @param {number} timestamp требуемая дата в миллисекундах
 * @returns {string} возвращает дату в виде строки в нужном формате
 */
export function JiraTimeToFormat(timestamp) {

   // Форматирую время в ISO8601
   let time = new Date(timestamp);
   let timeZone = new Date(timestamp).getTimezoneOffset() / -60; // Определяю часовой пояс
   let timeSymbol = timeZone < 0 ? "-" : "+"; // Определяю символ часового пояса (+/-)

   // Составляю часовой пояс
   return time.getFullYear() + '-' +
      (time.getMonth() < 9 ? '0' + (time.getMonth() + 1) : time.getMonth() + 1) + '-' +
      (time.getDate() < 10 ? '0' + time.getDate() : time.getDate()) + 'T' +
      (time.getHours() < 10 ? '0' + time.getHours() : time.getHours()) + ':' +
      (time.getMinutes() < 10 ? '0' + time.getMinutes() : time.getMinutes()) + ':' +
      '00.000' + timeSymbol +
      (timeZone < 10 ? "0" + Math.abs(timeZone) : Math.abs(timeZone)) + "00"
};

//====================================================================//



/**
 * Формирует таблицу очереди и возвращает её в виде HTMLElement
 * @param   {TypeQueue}   queue        объект настроек очереди для формирования таблицы
 * @param   {number}      selectedDate дата, на которую необходимо отображать задачи
 * @param   {number}      from         час, с которого начинается день
 * @param   {number}      to           час, на котором день заканчивается
 * @param   {boolean}     showAll      требуется отображать все задачи или только на конкретный день
 * @param   {number}      dividing     число на которое дробится час, при назначении задач на минуты
 * @param   {string}      jiraURL      адрес сервера Jira
 * @param   {TypeColorChanger} colorChanger объект цветовой ассоциации, для определения цвета задачи
 * @returns {HTMLElement} сформированная таблица очереди
 */
export function GenerateQueue(queue, selectedDate, from, to, showAll, dividing, jiraURL, colorChanger) {
   // Создаю тело таблицы
   let Table = generateTableBody(queue.IsCommon, queue.Name, queue.ID, queue.Assignee);
   let tBody = Table.getElementsByTagName('tbody')[0];

   // Создаю строки таблицы
   let rows = generateTimeRows(queue.IsCommon, from, to);

   // Помещаю строки в таблицу
   for (const row of rows) {
      tBody.appendChild(row);
   }

   // Создаю задачи в таблице
   generateIssues(queue, tBody, selectedDate, from, to, showAll, dividing, jiraURL, colorChanger);

   return Table;
};

/**
 * Формирует тело очереди в виде таблицы
 * @param {boolean}      [isCommon] является ли очередь общей (без временных меток)
 * @param {string}       title      заголовок очереди
 * @param {string}       id         локальный идентификатор очереди
 * @param {string}       assignee   логин исполнителя в данной очереди
 * @return {HTMLElement}            объект сформированного тела очереди
 */
function generateTableBody(isCommon, title, id, assignee) {

   let Table = document.createElement('table');
   Table.id = id;
   Table.dataset.assignee = assignee;
   Table.classList.add('table', 'table-sm', 'table-bordered', 'm-1', 'table-hover');

   if (isCommon) {
      Table.classList.add('table_queue_common');
   } else {
      Table.classList.add('table_queue');
   }

   let tHead = document.createElement('thead');
   Table.appendChild(tHead);

   let tBody = document.createElement('tbody');
   Table.appendChild(tBody);

   let hRow1 = document.createElement('tr');
   tHead.appendChild(hRow1);

   let th1 = document.createElement('th');
   th1.classList.add('text-center');
   th1.colSpan = isCommon ? 2 : 3;
   th1.innerText = title;
   hRow1.appendChild(th1);

   let hRow2 = document.createElement('tr');
   tHead.appendChild(hRow2);

   if (!isCommon) {
      let th2 = document.createElement('th');
      th2.classList.add('text-center');
      th2.innerText = chrome.i18n.getMessage('queue_title_time');
      hRow2.appendChild(th2);
   }

   let th3 = document.createElement('th');
   th3.classList.add('text-center');
   th3.innerText = chrome.i18n.getMessage('queue_title_tickets');
   hRow2.appendChild(th3);

   let div = document.createElement('div');
   div.appendChild(Table);
   return div;
};

/**
 * Формирует строки с/без временных строк, для заполнения таблицы очереди
 * @param   {boolean} [isCommon] является ли очередь общей (без временных меток)
 * @param   {number}  from       время, с которого начинается рабочий день
 * @param   {number}  to         время до которого длится рабочий день (не включительно)
 * @returns {HTMLElement[]}      массив HTMLElement-ов, содержит <tr></tr> строк таблицы с/без временных меток
 */
function generateTimeRows(isCommon, from, to) {
   // Общий массив, выводных строк
   let rowsArray = [];

   if (isCommon) {
      let tr = document.createElement('tr');
      let td = document.createElement('td');
      td.classList.add('d-flex', 'flex-wrap', 'justify-content-center', 'p-0');
      td.ondrop = (event) => DragDrop(event);
      td.ondragover = (event) => DragOver(event);
      tr.appendChild(td);

      rowsArray.push(tr);

      return rowsArray;
   }

   // Необходимо создать количество строк,равное числу часов в диапазоне
   // от "from" до "to".

   // Получаю from, как время
   let from_time = new Date(from * 3600 * 1000);
   // Получаю to, как время
   let to_time = new Date(to * 3600 * 1000);

   // Устраняю суточную разницу,если начальное время больше конечного
   if (from_time > to_time) {
      to_time = new Date(to_time.getTime() + 24 * 3600 * 1000);
   }

   // Перебираю все часы от начала, до конца
   for (let currentTime = from_time;
      currentTime < to_time;
      currentTime.setHours(currentTime.getHours() + 1)) {

      // Привожу часы к "00:00" виду
      const outTime = currentTime.getUTCHours() < 10 ?
         '0' + currentTime.getUTCHours() + ':00' :
         currentTime.getUTCHours() + ':00';

      // Формирую строку таблицы со временем и ячейкой для задач
      let tRow = document.createElement('tr');
      tRow.classList.add('t' + outTime.replace(':', '_'));
      rowsArray.push(tRow);

      let tTime = document.createElement('td');
      tTime.classList.add('td_time');
      tTime.innerText = outTime;
      tRow.appendChild(tTime);

      let tTickets = document.createElement('td');
      tTickets.classList.add('d-flex', 'flex-wrap', 'justify-content-center', 'p-0');
      tTickets.ondrop = (event) => DragDrop(event);
      tTickets.ondragover = (event) => DragOver(event);
      tRow.appendChild(tTickets);
   }
   return rowsArray;
};

/**
 * Формирует объекты задач и добавляет его на тело очереди
 * @param {TypeQueue}        queue    очередь, содержащий параметры выбранной очереди и имеющиеся задачи
 * @param {number}           from     час, с которого начинается день
 * @param {number}           selectedDate дата, на которую необходимо отображать задачи
 * @param {HTMLElement}      tbody    тело родительской очереди
 * @param {number}           to       час, на котором день заканчивается
 * @param {boolean}          showAll  требуется отображать все задачи или только на конкретный день
 * @param {number}           dividing делитель часа на меньшие части
 * @param {string}           jiraURL  адрес сервера jira
 * @param {TypeColorChanger} colorChanger объект цветовой ассоциации, для определения цвета задачи
 */
function generateIssues(queue, tbody, selectedDate, from, to, showAll, dividing, jiraURL, colorChanger) {

   // Получаю from, как время
   let from_time = new Date(selectedDate);
   from_time.setHours(from, 0, 0, 0);

   // Получаю to, как время
   let to_time = new Date(selectedDate);
   to_time.setHours(to - 1, 59, 59, 999);

   // Устраняю суточную разницу,если начальное время больше конечного
   if (from_time > to_time) {
      to_time.setDate(to_time.getDate() + 1);
   }

   // Перебираю все задачи и расставляю их по местам
   for (let issue of queue.Issues) {

      /* Фильтрация задач по времени
       * Если требуются задачи на конкретный день (отображать "не все")
       * и время задачи больше установленного дня, то она пропускается
       */
      if (
         (!showAll) &&
         ((issue.Time > to_time.getTime()) ||
            (issue.Time < from_time.getTime()))
      ) { continue }

      /**
       * Фильтрация задач, выходящих за предел текущего дня
       */
      if ((showAll) &&
         (issue.Time > to_time.getTime())) {
         continue
      }

      // Определяю цвет задачи
      let color = colorChanger.hasOwnProperty(issue.Status) ? colorChanger[issue.Status] : 'btn-primary';

      // Создаю объект задачи
      let html_issue = document.createElement('a');
      html_issue.classList.add('btn', 'btn-sm', 'position-relative', 'm-1', 'issue', color);
      html_issue.id = issue.Key;
      html_issue.innerText = issue.Key;
      html_issue.href = jiraURL + '/browse/' + issue.Key;
      html_issue.target = '_blank';
      html_issue.dataset.bsToggle = 'tooltip';
      html_issue.dataset.bsPlacement = 'left';
      html_issue.dataset.bsHtml = 'true';
      html_issue.dataset.bsTrigger = 'hover';
      html_issue.title = function () {
         // Составление подписи подсказки
         let title = issue.Key + '<br>' +
            issue.Summary + '<br><br>' +
            issue.ReporterName + '<br>' +
            issue.Status + '<br>';
         // Если очередь не является общей, то отобразить время в подсказке
         if (!queue.IsCommon) {
            title += (issue.Time > 0 ?
               new Date(issue.Time)
                  .toLocaleString(navigator.language || navigator.userLanguage) : '');
         }
         return title;
      }();



      html_issue.draggable = 'true';
      html_issue.ondragstart = (event) => DragStart(event);
      html_issue.ondragend = (event) => DragEnd(event);
      html_issue.oncontextmenu = (event) => ContextMenuOpen(event);

      // Получаю дату задачи в пределах "текущего дня"
      let issue_time = new Date(selectedDate);
      issue_time.setHours(
         new Date(issue.Time).getHours(),
         new Date(issue.Time).getMinutes(),
         0, 0
      );

      // Если очередь общая, просто добавляю её в очередь
      if (queue.IsCommon) {
         let td = tbody.getElementsByTagName('td')[0];
         td.appendChild(html_issue);

      } else {
         // Временная метка, для поиска нужного класса
         let time_label = '';

         // Если время задачи в установленных временных рамках
         if (
            (from_time <= issue_time) &&
            (issue_time <= to_time) &&
            (issue.Time > 0)
         ) {
            // Получаю требуемую временную метку
            time_label = issue_time.getHours() < 10 ?
               't0' + issue_time.getHours() + '_00' :
               't' + issue_time.getHours() + '_00';

            // Создаю маркер времени
            let span = document.createElement('span');
            span.classList.add(
               'position-absolute', 'top-0',
               'start-100', 'translate-middle',
               'badge', 'rounded-pill', 'time_marker');

            // Вычисляю часть минут от часа
            let part = 60 / dividing;
            // Вычисляю местоположение маркера
            for (let i = 0; i < dividing; i++) {

               // Если задача попадает под какой-либо диапазон
               // делителя, то дать соответствующую метку
               if (
                  ((i * part) <= issue_time.getMinutes()) &&
                  (issue_time.getMinutes() < ((i + 1) * part))
               ) {

                  span.innerText = (i * part) < 10 ? ':0' + (i * part) : ':' + (i * part);
                  // Обновляю время задачи, в соответствии с маркером
                  issue_time.setMinutes(i * part);

                  // Вычисляю цвет маркера в зависимости от текущего времени
                  let now = new Date();
                  if (
                     (issue_time < now) &&
                     (now < issue_time.getTime() + ((i + 1) * part * 60 * 1000))
                  ) {
                     // Если задача в текущем диапазоне часа
                     span.classList.add('bg-success');

                  } else if (
                     (issue_time.getTime() + ((i + 1) * part * 60 * 1000)) < now
                  ) {
                     // Если задача просрочена
                     span.classList.add('bg-danger');
                  } else if (
                     now < (issue_time.getTime() + ((i + 1) * part * 60 * 1000))
                  ) {
                     // Если время задачи еще не пришло
                     span.classList.add('bg-secondary');
                  }
               }
            }

            html_issue.appendChild(span);

         } else {
            // Если же задача вне настроенного временного диапазона или без времени
            // то размещаю её в начале рабочего дня
            time_label = from_time.getHours() < 10 ?
               't0' + from_time.getHours() + '_00' :
               't' + from_time.getHours() + '_00';
         }
         // Ищу требуемую позицию и размещаю на ней задачу
         let tr = tbody.getElementsByClassName(time_label)[0];
         tr.lastChild.appendChild(html_issue);
      }
   }
}

/**
 * Функция проверки версии расширения
 * @param {string} oldVer старая версия расширения в формате x.y.z
 * @param {string} newVer новая версия расширения в формате x.y.z
 * @returns {boolean} true, если новая версия имеет больший порядковый номер
 */
export function IsNewerVersion(oldVer, newVer) {
   const oldParts = oldVer.split('.');
   const newParts = newVer.split('.');
   for (var i = 0; i < newParts.length; i++) {
      const a = parseInt(newParts[i]) || 0;
      const b = parseInt(oldParts[i]) || 0;
      if (a > b) return true;
      if (a < b) return false;
   }
   return false;
}