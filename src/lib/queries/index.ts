// Barrel for the data-access boundary. UI components MUST import from
// `@/lib/queries` — never call Firestore primitives (`collection`, `doc`,
// `runTransaction`, etc.) directly. See README "Data access boundary".

export { err, ok, type Result } from './result';
export {
  listFolderChildren,
  subscribeToFolderChildren,
  getFolderById,
  createFolder,
  countActiveItemsInSubtree,
  type CreateFolderParams,
} from './folders';
export {
  getItemById, createItem, updateItem, listActiveItemsInFolder,
  type GetItemByIdOptions, type CreateItemParams, type UpdateItemParams,
} from './items';
export {
  createMovementAndAdjustItem,
  listMovementsForItem,
  type AdjustStockParams,
  type MovementsPage,
} from './movements';
export {
  listActiveStaff,
  listInactiveStaff,
  getUserByUid,
  createStaffUser,
  renameStaffUser,
  deactivateStaffUser,
  reactivateStaffUser,
  type CreateStaffUserParams,
} from './users';
