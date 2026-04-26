// Barrel for the data-access boundary. UI components MUST import from
// `@/lib/queries` — never call Firestore primitives (`collection`, `doc`,
// `runTransaction`, etc.) directly. See README "Data access boundary".

export { err, ok, type Result } from './result';
export { listFolderChildren, countActiveItemsInSubtree } from './folders';
export { getItemById } from './items';
export {
  createMovementAndAdjustItem,
  listMovementsForItem,
  type AdjustStockParams,
} from './movements';
