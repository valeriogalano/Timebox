// Eliminare un progetto cancella le sue ore: con ore registrate non si elimina,
// si archivia (l'archiviazione conserva lo storico). Vale per l'interfaccia come
// per HTTP e MCP, che rifiutano già con 409; db/queries.js lo fa rispettare a
// tutti i percorsi. `workedTotals` è la mappa di getProjectTotals: id → ore.

export function projectHours(projectId, workedTotals) {
  return workedTotals?.[projectId] ?? 0;
}

// I progetti di un'area che hanno ore: finché ce n'è uno l'area non si elimina.
export function projectsWithHours(projects, workedTotals) {
  return projects.filter(p => projectHours(p.id, workedTotals) > 0);
}
