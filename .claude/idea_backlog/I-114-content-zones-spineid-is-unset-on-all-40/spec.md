---
title: "content zones spineId is unset on all 40 records"
id: I-114
status: idea
---

# content zones spineId is unset on all 40 records

## Problem

`content/zones/*.json`'s `spineId` field is declared optional in the schema and is unset on ALL 40 committed zone records — verified live at 786a709 (`grep -c '"spineId"' content/zones/*.json` returns 0 for every file). `G-ALIAS` only checks `spineId` when present, so the fabric join (`region: "cNN/rNN"`, Z1/Z2) and the spine join (`spineId: "n-..."`) remain two unrelated key systems over the same 40 records.

## Why now

Carried forward unfixed across Tasks 9, 10, 11, 12, 13 and 14 (STATE §28) — the count moved from "all ten" to "all sixteen" to "all twenty-three" to "all thirty" to "all forty" as more zones were written, but the underlying gap never closed. No task in the completed programme ever had this in scope; it needs its own decision (wire it, or drop the optional field).

## Sketch

(rough shape; not a design yet)
