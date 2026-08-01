# Stream Deck layouts — what fits on which model

Minecraft's player inventory is **41 slots**: 9 hotbar + 27 storage + 4 armor + 1 off-hand.

## Key counts

| Model | Keys | Hotbar (needs 9) | All 41 |
|---|---|---|---|
| Stream Deck Mini | 6 | ❌ needs paging | ❌ |
| **Stream Deck MK.2 / V2** | **15** | ✅ 9 + 6 spare | ❌ |
| Stream Deck + (Plus) | 8 (+4 dials) | ❌ needs paging | ❌ |
| Stream Deck Neo | 8 (+2 touch) | ❌ needs paging | ❌ |
| Stream Deck XL | 32 | ✅ 9 + 23 spare | ❌ |

**No physical Stream Deck shows all 41 slots at once.** Use pages (Stream Deck profiles or
folders) for the rest, or simply show the slots you care about — every key is independently
addressable, so a partial view is perfectly normal.

## Recommended layouts

### MK.2 / V2 (15 keys) — the common case
```
[ H1 ][ H2 ][ H3 ][ H4 ][ H5 ]
[ H6 ][ H7 ][ H8 ][ H9 ][ OH ]
[ He ][ Ch ][ Lg ][ Bt ][ ⋯  ]
```
Row 1-2: the full hotbar + off-hand. Row 3: armor, plus one spare key (make it a Stream Deck
**folder** to a storage page if you want more).

### XL (32 keys) — hotbar + a big chunk of storage
```
[ H1 ][ H2 ][ H3 ][ H4 ][ H5 ][ H6 ][ H7 ][ H8 ]
[ H9 ][ OH ][ He ][ Ch ][ Lg ][ Bt ][    ][    ]
[ S1 ][ S2 ][ S3 ][ S4 ][ S5 ][ S6 ][ S7 ][ S8 ]
[ S9 ][S10 ][S11 ][S12 ][S13 ][S14 ][S15 ][S16 ]
```
A neat alternative: 27 storage + 4 armor + off-hand = **exactly 32**, giving an
"everything except the hotbar" profile you switch to.

### Mini / Plus / Neo (6-8 keys)
Not enough keys for a full hotbar. Options:
- Show your **most-used 5-7 hotbar slots** and leave the rest to the keyboard.
- Use a Stream Deck **folder** with a "next page" key.
- On the Plus, the 4 dials are free for volume/other actions — DeckCraft doesn't use them yet.

## Paging today

There is no built-in paging *action* yet. Use Stream Deck's native features:
- **Profiles** — one profile per page, switched with a "Switch Profile" key.
- **Folders** — a folder key opens a sub-page of keys.

Both work fine because every DeckCraft key is just "show slot N"; keys only render while visible,
and the plugin stops asking Minecraft for slots 9-40 as soon as no storage key is on screen.

## Performance note

The mod sends the extra 32 slots **only while at least one non-hotbar key is visible**
(negotiated via `set_options`). A hotbar-only deck costs exactly what it did before.
