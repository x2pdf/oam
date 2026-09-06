# Fix: Scrolling and Refresh not loading more data on Web

The user reported that on Web, scrolling to 19-20 items doesn't trigger loading more data, and the manual refresh button also doesn't help, leaving the list stuck at 20 items.

## Analysis of the issue

1.  **Missing manual "Load More" button in `HomeScreen` for Web**: While `AddressDataListScreen` has a manual "Load More" button for Web (as a fallback for `onEndReached` issues), `HomeScreen` does not. In some Web environments (especially inside a `PagerView`), `FlatList` `onEndReached` may not fire reliably.
2.  **`hasMore` state killed by incremental refresh**: In `DataRepository.ts`, the `refresh` method clears `nextParams[tabId]` and then overwrites it with the result of a `startblock` (incremental) query. If the refresh finds no new transactions (0 items), `result.nextParams` will be `null`, which causes `hasMore` to become `false`. This prevents any subsequent "Load More" attempts for older data.
3.  **Missing `CACHE_LOAD_LIMIT` constant**: `DataRepository.ts` imports `CACHE_LOAD_LIMIT` from `../constants`, but it is not exported in `src/constants/index.ts`. This leads to `undefined` being passed to `cacheService.getTransactions`, falling back to a default of 20.

## Proposed Changes

### [Component Name] Core Logic & Constants

#### [MODIFY] [index.ts](file:///Users/megan/code/oam/src/constants/index.ts)
- Export `CACHE_LOAD_LIMIT = 20` to match the intended pagination size.

#### [MODIFY] [DataRepository.ts](file:///Users/megan/code/oam/src/datasource/DataRepository.ts)
- Fix the `refresh` method to avoid killing the `hasMore` state when an incremental refresh returns no new items.
- Ensure `nextParams` (the cursor for older data) is only updated when loading more or during a full (non-incremental) refresh.

### [Component Name] UI components

#### [MODIFY] [HomeScreen.tsx](file:///Users/megan/code/oam/src/screens/HomeScreen.tsx)
- Add a manual "Load More" button in the `FlatList` footer for Web, consistent with `AddressDataListScreen.tsx`. This provides a fallback if `onEndReached` doesn't fire.

## Verification Plan

### Automated Tests
- N/A (UI and integration flow)

### Manual Verification
1.  Run the app in Web mode.
2.  Navigate to a tab with more than 20 items available.
3.  Verify that scrolling to the bottom triggers a load more, OR the "Load More" button appears and works.
4.  Verify that clicking the "Refresh" FAB button doesn't disable the "Load More" button if there are still older items to fetch.
5.  Verify that `CACHE_LOAD_LIMIT` is now correctly defined and used.
