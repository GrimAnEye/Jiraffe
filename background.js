import {
   LoadSettings, TypeJiraffeSettings, TypeIssue, JiraGetJqlIssues, TypeLastVersion
} from './js/common.js';


// Запускаю таймер фонового обновления задач
chrome.alarms.create({ periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => {
   UpdateTickets()
      .then();
});

// Слушатель обновления задач по запросу
chrome.runtime.onMessage.addListener((request, sender, respond) => {
   if (sender.id == chrome.i18n.getMessage('@@extension_id')) {
      switch (request) {
         // Запрос обновления задач
         case 'update': {
            UpdateTickets()
               .then(isSuccessful =>
                  respond({ 'status': isSuccessful }));
         }; break;
      }
   }
   return true;
});

// Запуск проверки последней версии
checkNewVersion();

/**
 * Функция запроса задач из Jira и обновления их в хранилище
 */
function UpdateTickets() {
   return new Promise(respond => {

      // Запрашиваю настройки
      LoadSettings(new TypeJiraffeSettings)
         .then(async settings => {

            // Если настроек нет - ничего не делаю
            if (JSON.stringify(settings) == JSON.stringify(new TypeJiraffeSettings)) {
               respond(false);
               return
            }

            // В случае ошибки - прерываю циклы
            let need_break = false;

            // Перебираю проекты
            for (const project of settings.Projects) {

               // Перебираю очереди проекта
               for (const queue of project.Queues) {

                  // Запрашиваю задачи
                  await JiraGetJqlIssues(settings.JiraURL, queue.JQL, settings.TimeField)
                     .then(resolv => {

                        // Предварительно очищаю старые задачи
                        //queue.Issues = [];

                        // Создаю массив новых задач
                        let issues = [];

                        // Перебираю полученные задачи
                        for (const jsonIssue of resolv.issues) {

                           // Добавляю полученные задачи в новую очередь для обновления
                           let newIssue = new TypeIssue();
                           newIssue.Key = jsonIssue.key;
                           newIssue.Summary = jsonIssue.fields.summary ? jsonIssue.fields.summary : '';
                           newIssue.Time = jsonIssue.fields[settings.TimeField] ?
                              Date.parse(jsonIssue.fields[settings.TimeField]) : 0;
                           newIssue.Status = jsonIssue.fields.status.name ? jsonIssue.fields.status.name : '';
                           newIssue.Assignee = jsonIssue.fields.assignee ? jsonIssue.fields.assignee.name : '';
                           newIssue.ReporterName = jsonIssue.fields.reporter ? jsonIssue.fields.reporter.displayName : '';
                           issues.push(newIssue);
                        }

                        /* Показывать уведомления об очередях, если пользователь диспетчер и очередь общая
                         *  либо, если очередь выбрана для отслеживания
                         */
                        if ((settings.User.Dispatcher && queue.IsCommon) || queue.ShowInPopup) {
                           // Анализирую задачи, какие новые, какие изменились
                           let analysis = issuesAnalysis(queue.Issues, issues);

                           // Формирую сообщения для новых задач и обновленных
                           if (analysis.newIssues.length > 0) {
                              SendNotification(
                                 chrome.i18n.getMessage('notification_title_new_issue') +
                                 ' ' + queue.Name,
                                 prepareMessage(analysis.newIssues, true)
                              )
                           }
                           if (analysis.changeIssues.length > 0) {
                              SendNotification(
                                 chrome.i18n.getMessage('notification_title_issue_updated') +
                                 ' ' + queue.Name,
                                 prepareMessage(analysis.changeIssues, false)
                              )
                           }
                        }


                        // После анализа и уведомления, заменяю старые задачи новыми
                        queue.Issues = issues;
                     })
                     .catch(err => {

                        need_break = true;
                        if (err.status != 400) {
                           console.log(err);
                        }
                        respond(false);

                     });
                  if (need_break) { break; }
               }
               if (need_break) { break; }
            }
            if (need_break) {
               return
            }
            // После запроса всех задач и получения обновленных проектов, сохраняю данные в хранилище
            chrome.storage.local.set({ 'Projects': settings.Projects })

               .then(() => {
                  console.log('tickets updated');
                  respond(true);
               })
               .catch(err => {
                  console.log(err);
                  respond(false);
               });
         })
         .catch(err => {
            console.log(err);
            respond(false);
         });
   });
}

/**
 * Создать уведомление пользователю в браузере
 * @param  {string} title заголовок уведомления
 * @param  {string} notification тело уведомления, длинный "многострочный" текст
  */
function SendNotification(title, notification) {

   // Проверяю, есть ли права на отправку уведомлений
   if (Notification.permission === "granted") {

      // Если права есть, отправляю уведомление
      self.registration.showNotification(
         title, {
         icon: './images/jirafee128.png',
         body: notification
      });

   } else {
      Notification.requestPermission()
   }
}

/**
 * Используется для анализа новых и старых задач, 
 * для получения данных, какие задачи изменились, а каких ранее не было
 * @param {TypeIssue[]} oldIssues массив уже имеющихся задач
 * @param {TypeIssue[]} newIssues массив полученных задач из Jira
 * @return {{ newIssues:TypeIssue[], changeIssues:TypeIssue[] }} возвращает массивы задач, которых ранее не было и тех, у которых изменилось время
 */
function issuesAnalysis(oldIssues, newIssues) {

   // Прохожусь по задачам, выявляя те, которых не было ранее
   let outNewIssues = newIssues
      .filter(newIssue => !oldIssues
         .find(oldIssue => oldIssue.Key == newIssue.Key));

   // Прохожусь по задачам, выявляя те, у которых изменилось время
   let outChangeIssues = newIssues
      .filter(newIssue => !oldIssues
         .find(oldIssue => oldIssue.Time == newIssue.Time));

   // Отфильтровываю новые задачи из списка измененного
   // времени, чтобы не было задвоений уведомлений
   outChangeIssues = outChangeIssues
      .filter(changeIssue => !outNewIssues
         .find(newIssue => changeIssue.Key == newIssue.Key));

   return { newIssues: outNewIssues, changeIssues: outChangeIssues };
}

/**
 * Функция подготовки сообщений для отображения в браузере.
 * На вход получает массив измененных или новых задач,
 * возвращает готовую строку для отображения в SendNotification()
 * @param {TypeIssue[]} issues массив задач для отображения в уведомлении
 * @param {boolean} isNewIssues Если true - просто отображает задачу в списке. Если false - отображает измененное время.
 * @param {boolean?} isCommon флаг общей очереди. Для общей очереди не отображается время, ведь его нет
 * @return {string} возвращает строку для SendNotification()
 */
function prepareMessage(issues, isNewIssues, isCommon) {
   let message = '';

   for (const issue of issues) {
      if (isNewIssues) {
         // Если задачи новые - выводить подробную информацию по ним
         message +=
            issue.Key + '\n' +
            issue.Summary + '\n' +
            (isCommon ?
               new Date(issue.Time).toLocaleString(navigator.language || navigator.userLanguage) + '\n'
               : '');
      } else {
         // Если время задачи изменилось - только новое время
         message +=
            issue.Key + ' >>\n' +
            new Date(issue.Time).toLocaleString(navigator.language || navigator.userLanguage) + '\n';
      }
   }
   return message;
}

/**
 * Функция проверки версии расширения
 * @param {string} oldVer старая версия расширения в формате x.y.z
 * @param {string} newVer новая версия расширения в формате x.y.z
 * @returns {boolean} true, если новая версия имеет больший порядковый номер
 */
function isNewerVersion(oldVer, newVer) {
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

/**
 * Обращается к Github API и запрашивает последнюю версию приложения
 * @returns {Promise<JSON>} возвращает JSON с данными последней версии
 */
function getLatestVersion() {
   return new Promise(async (resolve, reject) => {

      // Запрашиваю последнюю версию с Github
      const respond = await fetch('https://api.github.com/repos/GrimAnEye/Jiraffe/releases/latest', {
         method: 'GET'
      });
      !respond.ok ?
         reject(respond) :
         resolve(await respond.json());
   });
}

function checkNewVersion() {

   LoadSettings(new TypeJiraffeSettings).then(settings => {

      // Выполняю раз в 3 часа
      if (settings.LastVersion.LastCheck + (3 * 3600 * 1000) < Date.now()) {

         // Запрашиваю последнюю версию с Github
         getLatestVersion()
            .then(lastVersion => {

               // Получаю текущую версию
               let currentVersion = chrome.runtime.getManifest().version;

               // Сравниваю версии
               if (isNewerVersion(currentVersion, lastVersion.tag_name.slice(1))) {

                  // Если вышла новая версия, сохраняю номер версии и ссылку на неё
                  let updData = new TypeLastVersion(lastVersion.tag_name.slice(1), lastVersion.html_url, new Date().getTime());
                  chrome.storage.local.set({ 'LastVersion': updData });

                  // Отправляю уведомление
                  SendNotification(
                     chrome.i18n.getMessage('plugin_new_version_title'),
                     chrome.i18n.getMessage('plugin_new_version_body'));

               } else {
                  // Если текущая версия актуальная, то сохраняю только дату проверки
                  let updData = new TypeLastVersion('', '', Date.now());
                  chrome.storage.local.set({ 'LastVersion': updData });
               }

            })
            .catch(err => console.log('err check new version: ' + err));
      }

   });


}