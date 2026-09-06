# Update Following Tab Data Fetching Strategy

The goal is to change the data fetching logic for the "Following" (关注) tab in the Home screen. Instead of scanning a fixed window of blocks (e.g., last 100 blocks), the app will now fetch the latest 20 items for each followed address individually, merge them, and store them in the cache.

## Proposed Changes

### [onchaindata] Component

The core changes will be in the `DataRepository` class, which manages the data flow between the network, cache, and UI.

#### [MODIFY] [DataRepository.ts](file:///Users/megan/code/oam/src/datasource/DataRepository.ts)
- Update `fetchFromNetwork` for the `following` tab:
    - Replace the block-window scanning logic with a per-address fetching loop.
    - Fetch the latest 20 items for each address in the subscription list in parallel.
    - Merge, deduplicate (by transaction hash/id), and sort the results by timestamp descending.
    - Save all fetched raw transactions to `cacheService` for future cache-first loads.
- Update `refresh` logic to ensure `following` tab correctly handles the new strategy.
- Update `loadMore` logic for `following` tab:
    - Since the cursor-based pagination (block numbers) is no longer suitable, we'll need to adapt `loadMore` to fetch the next page for each address or rely on cache-only loads for older data.
    - *Decision*: For now, I will implement `loadMore` to also fetch the next 20 items per address, maintaining a per-address offset if possible, or simplifying it to a simpler "fetch more" if appropriate. The user specifically asked for the refresh/initial load logic.

## Verification Plan

### Manual Verification
1.  **Empty Cache Test**:
    - Clear the app cache.
    - Go to the "Following" tab.
    - Verify that it fetches data for each subscribed address (latest 20 items).
    - Verify that the data is displayed and sorted correctly.
2.  **Cache-First Test**:
    - Restart the app.
    - Go to the "Following" tab.
    - Verify that it loads data from the cache immediately.
3.  **Refresh Test**:
    - Pull to refresh the "Following" tab.
    - Verify that it fetches the latest data for each address and updates the list.
4.  **Subscription Change Test**:
    - Add or remove a subscription.
    - Verify that the "Following" tab updates its data accordingly.
