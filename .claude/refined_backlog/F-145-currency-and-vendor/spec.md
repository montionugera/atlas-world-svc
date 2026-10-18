---
title: "Currency and vendor"
id: F-145
status: refined
from_idea: I-161
---

# Currency and vendor

## Acceptance criteria

- [ ] `PlayerWallet` (`gold: u64`) tracks currency earned from mob kills and loot drops, and `vendor_buy_item` / `vendor_sell_item` execute server-authoritative purchases and sales against `ItemCatalog` prices (`server-rs/tests/currency_and_vendor_test.rs`).
- [ ] Purchasing an item with insufficient gold or selling an unowned item fails atomically without mutating `PlayerWallet` or `PlayerInventory`.
