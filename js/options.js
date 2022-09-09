import {
   TranslateHTML, TooltipsTranslate, TooltipsActivator,
   TypeJiraffeSettings, TypeProject, TypeQueue, TypeUser,
   LoadSettings, NotificationCreator, GenerateID,
   JiraGetCurrentUser, JiraGetJqlIssues, JiraServerInfo, TypeColorChanger
} from './common.js';

document.addEventListener("DOMContentLoaded", () => {
   // Действие для кнопки сохранения
   document.getElementById('save').addEventListener('click', SaveSettings);

   // Действие для кнопки сохранения импортированных настроек
   document.getElementById('settings_import').addEventListener('click', () => {
      let json = JSON.parse(document.getElementById('settings_json').value);

      // Предварительная очистка хранилища
      chrome.storage.local.clear()
         .then(() => {

            // В случае успеха - записываю данные
            chrome.storage.local.set(json)
               .then(() => {
                  NotificationCreator(
                     chrome.i18n.getMessage('settings_saving_ok'),
                     'bg-success', 'text-light');
                  setTimeout(() => {
                     window.location.reload();
                  }, 1500);
               })
               .catch((err) => {
                  NotificationCreator(
                     chrome.i18n.getMessage('settings_error_saving'),
                     'bg-danger', 'text-light');


                  console.log('err saving settings: ' + err)
               });
         })
         .catch((err) => {
            NotificationCreator(
               chrome.i18n.getMessage('settings_error_saving'),
               'bg-danger', 'text-light');
            console.log('err clear settings storage: ' + err)
         });
   });

   // Если есть сохраненные настройки - восстанавливает и выводит их
   restoreSettings();

   // Перевод страницы
   TranslateHTML();

   // Перевод подсказок
   TooltipsTranslate();

   // Активация всех подсказок
   TooltipsActivator();

   NotificationCreator(chrome.i18n.getMessage('tooltip_move_with_tab'), 'bg-warning', 'text-dark');


   // Подключение к Jira, получение информации о сервере и активация иных кнопок
   document.getElementById('connect').addEventListener('click', () => {

      let jiraURL = document.getElementById('jiraURL').value.trim();
      let div_server_info = document.getElementById('server_info');
      let createProject_btn = document.getElementById('createProject');

      // Предварительно очищаю блок информации Jira
      while (div_server_info.lastChild) {
         div_server_info.removeChild(
            div_server_info.lastChild
         );
      }

      // Предварительно выключаю кнопку создания проектов
      createProject_btn.disabled = true;

      // Проверяю, что сервер отвечает на запросы
      JiraServerInfo(jiraURL).then(server => {

         // Отрисовываю информацию сервера
         let p1 = document.createElement('p');
         p1.classList.add('my-0');
         p1.innerHTML = 'ServerTitle: <span class="text-success">' + server.serverTitle + '</span>';

         let p2 = document.createElement('p');
         p2.classList.add('my-0');
         p2.innerHTML = 'Version: <span class="text-success">' + server.version + '</span>';

         let p3 = document.createElement('p');
         p3.classList.add('my-0');
         p3.innerHTML = 'BaseURL: <span class="text-success">' + server.baseUrl + '</span>';

         div_server_info.appendChild(p1);
         div_server_info.appendChild(p2);
         div_server_info.appendChild(p3);
         div_server_info.classList.remove('d-none'); // отображение информации

         // Запрашиваю данные пользователя
         JiraGetCurrentUser(jiraURL)
            .then(myself => {

               // В случае ошибок - отображаю их
               if (myself.message) {

                  let p4 = document.createElement('p');
                  p4.classList.add('my-0');
                  p4.innerHTML = 'StatusCode: <span class="text-danger">' + myself['status-code'] + '</span>';

                  let p5 = document.createElement('p');
                  p5.classList.add('my-0');
                  p5.innerHTML = 'Message: <span class="text-danger">' + myself.message + '</span>';

                  div_server_info.appendChild(p4);
                  div_server_info.appendChild(p5);

                  return
               }

               // В случае успеха - отображаю данные
               let p4 = document.createElement('p');
               p4.classList.add('my-0');
               p4.innerHTML = 'DisplayName: <span class="text-success">' + myself.displayName + '</span>';

               let p5 = document.createElement('p');
               p5.classList.add('my-0');
               p5.innerHTML = 'Login: <span class="text-success">' + myself.name + '</span>';

               let p6 = document.createElement('p');
               p6.classList.add('my-0');
               p6.innerHTML = 'Email: <span class="text-success">' + myself.emailAddress + '</span>';

               div_server_info.appendChild(p4);
               div_server_info.appendChild(p5);
               div_server_info.appendChild(p6);

               // Включаю кнопку создания проектов
               createProject_btn.disabled = false;
            })
            .catch(error => {

               if (error.status == 401) {

                  NotificationCreator(
                     chrome.i18n.getMessage('need_auth'),
                     'bg-warning', 'text-dark'
                  );

               } else {
                  NotificationCreator(
                     chrome.i18n.getMessage('settings_error_http'),
                     'bg-danger', 'text-light');
                  console.log(error);
               }
            });
      })
         .catch(error => {

            if (error.status == 401 || error.message == 'cookie not found') {

               NotificationCreator(
                  chrome.i18n.getMessage('need_auth'),
                  'bg-warning', 'text-dark'
               );

            } else {
               NotificationCreator(
                  chrome.i18n.getMessage('settings_error_http'),
                  'bg-danger', 'text-light');
               console.log(error);
            }

         });
   });

   // Добавление действия кнопке создания проектов
   document.getElementById('createProject').addEventListener(
      'click', () => {
         CreateProjectCard(document.getElementById('projectList'));
      });

   // Добавление действия кнопке добавления цветовой ассоциации
   document.getElementById('addColorAssociation').addEventListener('click', () => {
      CreateColorChanger(document.getElementById('color_changer'));
   });

   // Обновление подписи, при изменении бегунка
   document.getElementById('timeDividing').addEventListener('change', () => {
      document.getElementById('timeDividing_label').innerText =
         chrome.i18n.getMessage('settings_timePicker_dividing') + ' ' +
         document.getElementById('timeDividing').value;
   });

   // Добавление изменчивости для кнопок экспорта/импорта настроек
   let exportModal = document.getElementById('exportModal');
   exportModal.addEventListener('show.bs.modal', (event) => {

      // Кнопка запускающая модальное окно
      let button = event.relatedTarget;
      switch (button.getAttribute('data-bs-action')) {
         case 'export': {
            // Меняю надписи
            document.getElementById('settings_json_label').innerText =
               chrome.i18n.getMessage('settings_export_label');

            // На всякий случай скрываю кнопку сохранения настроек
            document.getElementById('settings_import').classList.add('d-none');

            LoadSettings(new TypeJiraffeSettings).then(settings => {
               // Перебираю проекты, для очистки задач
               for (const project of settings.Projects) {
                  for (const queue of project.Queues) {
                     queue.Issues = [];
                  }
               }
               // Вывожу настройки в окно
               document.getElementById('settings_json').value = JSON.stringify(settings);
               document.getElementById('settings_json').readOnly = true;

            });
            ;

         }; break;

         case 'import': {
            // Меняю надписи
            document.getElementById('settings_json_label').innerText =
               chrome.i18n.getMessage('settings_import_label');

            // Отображаю кнопку сохранения
            document.getElementById('settings_import').classList.remove('d-none');
            // Предварительно очищаю поле
            document.getElementById('settings_json').readOnly = false;
            document.getElementById('settings_json').value = '';

         }; break;
      }
   });
});

/**
 * Создает карточку проекта и добавляет её в общий список
 * @param  {HTMLElement} parent родительский объект
 * @return {string}      html-ID созданного объекта
 */
function CreateProjectCard(parent) {

   // Сохраняю timestamp, для уникальных ID проектов
   let newID = GenerateID();

   // Создаю карточку проекта
   let card = document.createElement('div');
   card.classList.add('mb-3', 'card');
   parent.appendChild(card);

   // Создаю тело карточки
   let card_body = document.createElement('div');
   card_body.classList.add('card-body', 'project');
   card_body.id = 'project_' + newID;

   card.appendChild(card_body);

   /////////////////////// Создаю поля описания проекта////////////////////
   let desc_project = document.createElement('div');
   desc_project.classList.add('input-group', 'mb-2');
   card_body.appendChild(desc_project);

   // Подпись поля имени проекта
   let desc_proj_label = document.createElement('label');
   desc_proj_label.classList.add('input-group-text');
   desc_proj_label.htmlFor = 'project_' + newID;
   desc_proj_label.innerText = chrome.i18n.getMessage('settings_project_name');
   desc_project.appendChild(desc_proj_label);

   // Поле ввода имени проекта
   let desc_proj_name = document.createElement('input');
   desc_proj_name.classList.add('form-control');
   desc_proj_name.type = 'text';
   desc_proj_name.id = 'project_' + newID + '-name';
   desc_proj_name.placeholder = 'ProjectName';
   desc_project.appendChild(desc_proj_name);

   // Кнопка удаления карточки проекта
   let del_proj = document.createElement('button');
   del_proj.classList.add('btn', 'btn-danger');
   del_proj.innerText = chrome.i18n.getMessage('settings_btn_delete_project');
   del_proj.addEventListener('click', () => {
      parent.removeChild(card);
   });
   desc_project.appendChild(del_proj);

   // Кнопка скрытия/отображения очередей
   let show_hide = document.createElement('button');
   show_hide.classList.add('btn', 'btn-outline-secondary');
   show_hide.dataset.bsToggle = 'collapse';
   show_hide.dataset.bsTarget = '#' + card_body.id + '-queueList';
   show_hide.innerText = chrome.i18n.getMessage('settings_btn_show_hide_jql_result');
   desc_project.appendChild(show_hide);

   // Кнопка создания очередей
   let createQueueBtn = document.createElement('button');
   createQueueBtn.classList.add('btn', 'btn-primary', 'mb-3');
   createQueueBtn.addEventListener('click', () => {
      CreateQueueCard(
         document.getElementById(card_body.id + '-queueList')
      )
   });
   createQueueBtn.innerText = chrome.i18n.getMessage('settings_btn_create_queue');
   card_body.appendChild(createQueueBtn);

   // Блок для очередей
   let queueList = document.createElement('div');
   queueList.classList.add('collapse', 'show');
   queueList.id = card_body.id + '-queueList';
   card_body.appendChild(queueList);

   return card_body.id;
}

/**
 * Создаёт карточку очереди и добавляет её в список
 * @param {HTMLElement} parent ссылка на родительский элемент
 * @returns {string}           html-ID созданного объекта
 */
function CreateQueueCard(parent) {

   // Сохраняю timestamp, для уникальных ID очередей
   let newID = GenerateID();
   // Создание карточки очереди
   let card = document.createElement('div');
   card.classList.add('card', 'mb-3');
   parent.appendChild(card);

   // Создание тела карточки очереди
   let card_body = document.createElement('div');
   card_body.classList.add('queue');
   card_body.id = parent.id.split('-queueList')[0] + '-queue_' + newID;
   card.appendChild(card_body);

   /////// Создание блока описания очереди/////////
   let desc_queue = document.createElement('div');
   desc_queue.classList.add('input-group', 'mb-1');
   card_body.appendChild(desc_queue);

   // Описание поля имени очереди
   let desc_queue_label = document.createElement('label');
   desc_queue_label.classList.add('input-group-text');
   desc_queue_label.htmlFor = card_body.id + '-name';
   desc_queue_label.innerText = chrome.i18n.getMessage('settings_queue_name');
   desc_queue.appendChild(desc_queue_label);

   // Поле ввода имени очереди
   let desc_queue_name = document.createElement('input');
   desc_queue_name.classList.add('form-control');
   desc_queue_name.type = 'text';
   desc_queue_name.id = card_body.id + '-name';
   desc_queue_name.placeholder = 'QueueName';
   desc_queue.appendChild(desc_queue_name);

   // Переключатель отслеживания очереди
   let desc_queue_common = document.createElement('input');
   desc_queue_common.id = card_body.id + '-common';
   desc_queue_common.autocomplete = 'off';
   desc_queue_common.type = 'checkbox';
   desc_queue_common.classList.add('btn-check');
   desc_queue.appendChild(desc_queue_common);

   let desc_queue_common_label = document.createElement('label');
   desc_queue_common_label.classList.add('btn', 'btn-outline-info');
   desc_queue_common_label.htmlFor = desc_queue_common.id;
   desc_queue_common_label.innerText = chrome.i18n.getMessage('settings_common_queue');
   desc_queue.appendChild(desc_queue_common_label);

   // Кнопка удаления очереди
   let del_queue = document.createElement('button');
   del_queue.classList.add('btn', 'btn-warning');
   del_queue.innerText = chrome.i18n.getMessage('settings_btn_delete_queue');
   del_queue.addEventListener('click', () => {
      parent.removeChild(card)
   });
   desc_queue.appendChild(del_queue);
   /////////////////////////////////////////////////////

   //Настройка очереди - строка jql запроса
   let jql_div = document.createElement('div');
   jql_div.classList.add('input-group', 'mb-1');
   card_body.appendChild(jql_div);

   // Описание jql поля
   let jql_label = document.createElement('label');
   jql_label.classList.add('input-group-text');
   jql_label.htmlFor = card_body.id + '-jql';
   jql_label.innerText = 'JQL:'
   jql_div.appendChild(jql_label);

   // Поле ввода jql
   let jql_input = document.createElement('textarea');
   jql_input.classList.add('form-control');
   jql_input.placeholder = 'assignee in (currentUser())';
   jql_input.id = card_body.id + '-jql';
   jql_div.appendChild(jql_input);

   // Кнопка проверки jql
   let jql_btn_check = document.createElement('button');
   jql_btn_check.classList.add('btn', 'btn-outline-secondary');
   jql_btn_check.id = card_body.id + '-jql_check';
   jql_btn_check.innerText = chrome.i18n.getMessage('settings_btn_jql_check');
   jql_div.appendChild(jql_btn_check);

   // Назначаю запрос тикетов и их отображение
   jql_btn_check.addEventListener('click', () => {

      let jiraURL = document.getElementById('jiraURL').value;
      let result_div = document.getElementById(card_body.id + '-jql_result');

      // Предварительная очистка списка
      while (result_div.lastChild.lastChild) {
         result_div.lastChild.removeChild(
            result_div.lastChild.lastChild)
      }
      result_div.classList.remove('show');

      JiraGetJqlIssues(jiraURL, jql_input.value)
         .then(data => {

            // После запроса задач, формирование списка для вывода
            let ul = document.createElement('ul');
            ul.style = 'columns:5';

            for (const ticket of data.issues) {
               let li = document.createElement('li');
               let a = document.createElement('a');

               a.href = jiraURL + "/browse/" + ticket.key;
               a.innerText = ticket.key;
               a.target = '_blank'

               li.appendChild(a);
               ul.appendChild(li);
            }

            // Отображение списка
            result_div.lastChild.appendChild(ul);
            result_div.classList.add('show');

         })
         .catch(error => {

            NotificationCreator(
               chrome.i18n.getMessage('settings_error_http'),
               'bg-danger', 'text-light');
            console.log(error);
         });
   });

   // Кнопка отображения/скрытия
   let jql_btn_show_hide = document.createElement('button');
   jql_btn_show_hide.classList.add('btn', 'btn-outline-secondary');
   jql_btn_show_hide.id = card_body.id + '-jql_btn_result';
   jql_btn_show_hide.dataset.bsToggle = 'collapse';
   jql_btn_show_hide.dataset.bsTarget = '#' + card_body.id + '-jql_result';
   jql_btn_show_hide.innerText = chrome.i18n.getMessage('settings_btn_show_hide_jql_result');
   jql_div.appendChild(jql_btn_show_hide);

   // Блок с выводом информации проверки jql
   let jql_result_div = document.createElement('div');
   jql_result_div.classList.add('collapse');
   jql_result_div.id = card_body.id + '-jql_result';
   card_body.appendChild(jql_result_div);

   // Карточка вывода данных
   let jql_result_card = document.createElement('div');
   jql_result_card.classList.add('card', 'card-body', 'mb-2');
   jql_result_div.appendChild(jql_result_card);

   ///////////////////////////////////////////////////////////////////////////

   // Блок строки исполнителя
   let assignee_div = document.createElement('div');
   assignee_div.classList.add('input-group', 'mb-1');
   card_body.appendChild(assignee_div);

   // Подпись строки исполнителя
   let assignee_label = document.createElement('label');
   assignee_label.classList.add('input-group-text');
   assignee_label.htmlFor = card_body.id + '-assignee';
   assignee_label.innerText = chrome.i18n.getMessage('settings_assignee');
   assignee_div.appendChild(assignee_label);

   // Поле строки исполнителя
   let assignee_input = document.createElement('input');
   assignee_input.classList.add('form-control');
   assignee_input.type = 'text';
   assignee_input.id = card_body.id + '-assignee';
   assignee_input.placeholder = 'EMPTY/userLogin';
   assignee_div.appendChild(assignee_input);

   // Переключатель отслеживания очереди
   let assignee_notif = document.createElement('input');
   assignee_notif.id = assignee_input.id + '-show_popup';
   assignee_notif.autocomplete = 'off';
   assignee_notif.type = 'checkbox';
   assignee_notif.classList.add('btn-check');
   assignee_div.appendChild(assignee_notif);

   let assignee_notif_label = document.createElement('label');
   assignee_notif_label.classList.add('btn', 'btn-outline-info');
   assignee_notif_label.htmlFor = assignee_input.id + '-show_popup';
   assignee_notif_label.innerText = chrome.i18n.getMessage('settings_track_queue');
   assignee_div.appendChild(assignee_notif_label);

   return card_body.id;
}

/**
 * Загружает настройки из хранилища и отображает их
 */
function restoreSettings() {

   LoadSettings(new TypeJiraffeSettings).then(settings => {
      // Если настроек нет - ничего не делаю
      if (JSON.stringify(settings) == JSON.stringify(new TypeJiraffeSettings)) { return }

      // Вывожу параметры из хранилища на панели
      let jiraURL = document.getElementById('jiraURL');
      let customfield = document.getElementById('customfield');
      let dispatcherMode = document.getElementById('dispatcherMode');
      let timeFrom = document.getElementById('timeFrom');
      let timeTo = document.getElementById('timeTo');
      let timeDividing = document.getElementById('timeDividing');
      let projectList = document.getElementById('projectList');

      timeDividing.value = settings.TimeDividing;

      timeFrom.value = settings.TimeFrom < 10 ?
         '0' + settings.TimeFrom + ':00' :
         settings.TimeFrom + ':00';

      timeTo.value = settings.TimeTo < 10 ?
         '0' + settings.TimeTo + ':00' :
         settings.TimeTo + ':00';

      jiraURL.value = settings.JiraURL;
      customfield.value = settings.TimeField;
      dispatcherMode.checked = settings.User.Dispatcher;

      // Перебираю проекты и создаю для них карточки
      for (const project of settings.Projects) {

         let projID = CreateProjectCard(projectList);
         document.getElementById(projID + '-name').value = project.Name;

         // Перебираю очереди и создаю для них карточки
         for (const queue of project.Queues) {
            let queueID = CreateQueueCard(document.getElementById(projID + '-queueList'));

            document.getElementById(queueID + '-name').value = queue.Name;
            document.getElementById(queueID + '-jql').value = queue.JQL;
            document.getElementById(queueID + '-assignee').value = queue.Assignee;
            document.getElementById(queueID + '-common').checked = queue.IsCommon;
            document.getElementById(queueID + '-assignee-show_popup').checked = queue.ShowInPopup;

         }
      }

      // Перебираю цветовые ассоциации и создаю для них поля
      for (const status in settings.ColorChanger) {
         let colorId = CreateColorChanger(document.getElementById('color_changer'));
         document.getElementById(colorId + '-name').value = status;
         document.getElementById(colorId + '-color').value = settings.ColorChanger[status];
      }
   });
}

/**
 * 
 * @param {HTMLElement} parent блок размещения полей смены цвета
 * @returns {string} возвращает id созданного элемента
 */
function CreateColorChanger(parent) {
   let id = GenerateID();

   let block = document.createElement('div');
   block.id = 'changer-' + id;
   block.classList.add('input-group', 'mb-2', 'color-changer');

   let label_name = document.createElement('label');
   label_name.classList.add('input-group-text');
   label_name.htmlFor = 'changer-' + id + '-name';
   label_name.innerText = chrome.i18n.getMessage('settings_color_status');
   block.appendChild(label_name);

   let input_name = document.createElement('input');
   input_name.classList.add('form-control');
   input_name.type = 'text';
   input_name.id = 'changer-' + id + '-name';
   input_name.placeholder = '"In work" or "In Progress"'
   block.appendChild(input_name);

   let label_color = document.createElement('label');
   label_color.classList.add('input-group-text');
   label_color.htmlFor = 'changer-' + id + '-color';
   label_color.innerText = chrome.i18n.getMessage('settings_color_status');
   block.appendChild(label_color);

   let select_color = document.createElement('select');
   select_color.classList.add('form-select');
   select_color.id = 'changer-' + id + '-color';
   block.appendChild(select_color);

   select_color.appendChild(colorOptionsGenerator('btn-primary', chrome.i18n.getMessage('color_blue')));
   select_color.appendChild(colorOptionsGenerator('btn-secondary', chrome.i18n.getMessage('color_grey')));
   select_color.appendChild(colorOptionsGenerator('btn-success', chrome.i18n.getMessage('color_green')));
   select_color.appendChild(colorOptionsGenerator('btn-danger', chrome.i18n.getMessage('color_red')));
   select_color.appendChild(colorOptionsGenerator('btn-warning', chrome.i18n.getMessage('color_yellow')));
   select_color.appendChild(colorOptionsGenerator('btn-info', chrome.i18n.getMessage('color_cyan')));
   select_color.appendChild(colorOptionsGenerator('btn-light', chrome.i18n.getMessage('color_light')));
   select_color.appendChild(colorOptionsGenerator('btn-dark', chrome.i18n.getMessage('color_dark')));

   let removeBtn = document.createElement('button');
   removeBtn.classList.add('btn', 'btn-warning');
   removeBtn.type = 'button';
   removeBtn.innerText = chrome.i18n.getMessage('settings_color_association_btn_delete');
   removeBtn.addEventListener('click', () => {
      block.remove();
   });
   block.appendChild(removeBtn);


   parent.appendChild(block);
   return block.id;
}

/**
 * Формирует элемент option
 * @param {string} value значение которое должно быть в опции
 * @param {*} text отображаемое значение опции
 * @returns {HTMLElement} возвращает подготовленый объект опции
 */
function colorOptionsGenerator(value, text) {
   let option = document.createElement('option');
   option.value = value;
   option.innerText = text;
   return option;
}


/**
 * Сохраняет настройки в cookie и chrome.sync
 */
function SaveSettings() {
   let jiraURL = document.getElementById('jiraURL');
   let customfield = document.getElementById('customfield');

   let timeFrom = document.getElementById('timeFrom');
   let timeTo = document.getElementById('timeTo');
   let timeDividing = document.getElementById('timeDividing');

   let dispatcher = document.getElementById('dispatcherMode');
   let projects = document.getElementsByClassName('project');

   /* Проверка, что обязательные поля настроек заполнены */
   let err = false;
   {
      if (jiraURL.value.trim() == "") {
         err = true;
         validInvalid(jiraURL, false);
      } else {
         validInvalid(jiraURL, true)
      }

      if (customfield.value.trim() == "") {
         err = true;
         validInvalid(customfield, false);
      } else {
         validInvalid(customfield, true);
      }

      if (timeFrom.value.trim() == "") {
         err = true;
         validInvalid(timeFrom, false);
      } else {
         validInvalid(timeFrom, true);
      }

      if (timeTo.value.trim() == "") {
         err = true;
         validInvalid(timeTo, false);
      } else {
         validInvalid(timeTo, true);
      }

      // Проход по всем проектам, проверка наличия у них названия
      if (projects) {

         for (let project of projects) {
            let proj_input = document.getElementById(project.id + '-name');

            if (proj_input.value.trim() == "") {
               err = true;
               validInvalid(proj_input, false);
            } else {
               validInvalid(proj_input, true);
            }

            // Проход по всем очередям, проверка наличия у них названия
            let queues = document.getElementsByClassName('queue');
            for (let queue of queues) {
               let queue_input = document.getElementById(queue.id + '-name');

               if (queue_input.value.trim() == "") {
                  err = true;
                  validInvalid(queue_input, false);
               } else {
                  validInvalid(queue_input, true);
               }
            }
         }
      }

      // Проверка, что цветовые ассоциации имеют имя
      let colorChanger = document.getElementsByClassName('color-changer');
      for (const elem of colorChanger) {
         let statusName = document.getElementById(elem.id + '-name');
         if (!statusName.value) {
            err = true;
            validInvalid(statusName, false);
         }
      }
   }

   if (err) {
      NotificationCreator(
         chrome.i18n.getMessage('settings_error_saving_required_fields'),
         'bg-danger', 'text-light');
      return
   }

   // Создаю объект настроек
   let JsonJiraffeSettings = new TypeJiraffeSettings(
      jiraURL.value.trim(),
      customfield.value.trim(),
      parseInt(timeFrom.value.split(':')[0]),
      parseInt(timeTo.value.split(':')[0]),
      parseInt(timeDividing.value),
   );

   // Запрашиваю перечень созданных проектов
   let htmlProjectList = document.getElementsByClassName('project');
   // Перебираю проекты
   for (const project of htmlProjectList) {

      JsonJiraffeSettings.Projects.push(
         new TypeProject(project.id, document.getElementById(project.id + '-name').value))

      // Запрос перечня очередей проекта
      let htmlQueues = document.querySelectorAll('#' + project.id + ' .queue');

      // Сохраняю данные по очередям
      for (const queue of htmlQueues) {
         let index = JsonJiraffeSettings.Projects.length - 1;

         JsonJiraffeSettings.Projects[index].Queues.push(
            new TypeQueue(
               queue.id,
               document.getElementById(queue.id + '-name').value.trim(),
               document.getElementById(queue.id + '-assignee').value.trim(),
               document.getElementById(queue.id + '-jql').value.trim(),
               document.getElementById(queue.id + '-common').checked,
               document.getElementById(queue.id + '-assignee-show_popup').checked
            ))
      }
   }

   // Запрашиваю список цветовых ассоциаций
   let colorChanger = document.getElementsByClassName('color-changer');
   for (const elem of colorChanger) {
      let status = document.getElementById(elem.id + '-name').value.trim();
      let color = document.getElementById(elem.id + '-color').value;

      JsonJiraffeSettings.ColorChanger[status] = color;
   }


   // Запрашваю данные пользователя
   JiraGetCurrentUser(jiraURL.value).then(myself => {

      JsonJiraffeSettings.User = new TypeUser(
         myself.displayName,
         myself.name,
         dispatcher.checked
      )

      // Предварительная очистка хранилища
      chrome.storage.local.clear()
         .then(() => {

            // В случае успеха - записываю данные
            chrome.storage.local.set(JsonJiraffeSettings)
               .then(() => {
                  NotificationCreator(
                     chrome.i18n.getMessage('settings_saving_ok'),
                     'bg-success', 'text-light');
               })
               .catch((err) => {
                  NotificationCreator(
                     chrome.i18n.getMessage('settings_error_saving'),
                     'bg-danger', 'text-light');
                  console.log('err saving settings: ' + err)
               });
         })
         .catch((err) => {
            NotificationCreator(
               chrome.i18n.getMessage('settings_error_saving'),
               'bg-danger', 'text-light');
            console.log('err clear settings storage: ' + err)
         });
   })
      .catch(err => {

         if (err.status == 401) {
            NotificationCreator(
               chrome.i18n.getMessage('need_auth'),
               'bg-warning', 'text-dark'
            );
            console.log('need auth jira, err:' + err.status + ', url:' + err.url);
         } else {

            NotificationCreator(
               chrome.i18n.getMessage('settings_error_http'),
               'bg-danger', 'text-light');
            console.log(err);
         }

         return
      });
}

/**
 * Переключает индикацию валидности элемента
 * @param {HTMLElement} elem 
 * @param {boolean} isValid 
 */
function validInvalid(elem, isValid) {

   elem.classList.remove('is-valid', 'is-invalid');

   switch (isValid) {
      case true: elem.classList.add('is-valid'); break;
      case false: elem.classList.add('is-invalid'); break;
   }

}