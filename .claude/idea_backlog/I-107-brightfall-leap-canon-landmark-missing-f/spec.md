---
title: "Brightfall Leap canon landmark missing from names reserved.json"
id: I-107
status: idea
---

# Brightfall Leap canon landmark missing from names reserved.json

## Problem

`c-lm-brightfall-leap` is a hand-authored canon landmark (kept by A4 §2's "inheritance beats minting" rule, `c09/r03` on Brightfall) that is absent from `content/world/names/reserved.json` — verified by grep at 786a709 (zero hits). `reserved.json` is meant to be a hard exclusion inside `mintForRegion` so a re-seed can never re-mint a reserved canon name onto other ground; this one name slipped through that net.

## Why now

Filed by Tasks 10 and 11 (STATE §28), carried forward unfixed across three tasks. A future reseed of the world generator could mint "Brightfall Leap" onto unrelated ground with no gate catching it, silently orphaning the canon landmark's citation.

## Sketch

(rough shape; not a design yet)
