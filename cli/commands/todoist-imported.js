'use strict';

const { getImportedTodoistTasks } = require('../../db/queries');

function getImportedTodoistTasksData(date) {
  return getImportedTodoistTasks(date);
}

module.exports = { getImportedTodoistTasksData };
