**English** · [简体中文](README.md)

# module-contract

> A generic skill for AI coding agents: when you add a new feature, it **modularizes** the requirement into **atomic modules** and **composite modules**, writes an **interface card** for each module, keeps a **module map**, and runs reuse analysis through a **decision ladder** before any work begins — prefer **composing** existing modules into the needed capability, and create new ones only when composition fails.

A reusable skill for AI coding assistants. Before you add each new feature, it structures the requirement with module interface contracts, so the resulting code is more reusable, more testable, and less duplicated.

---

## What problem does it solve

When AI writes code directly, it often:

- **reimplements** the same feature in different files under different names;
- has **mismatched types** and drifting interface vocabulary across modules;
- sees only the local context, not the project-wide module boundaries;
- produces code that "looks like it runs" but lacks a verifiable criterion of correctness.

`module-contract` splits the requirement into **explicit modules** before work starts, and pins each module's inputs / outputs / dependencies / constraints with an **interface card**. This means:

- the agent implements against **one module's interface card**, instead of ingesting the entire codebase;
- every module can be **tested and dispatched independently**;
- interface cards become the **single source of truth**, reducing duplication and interface drift;
- reuse is decided by a **decision ladder** before work starts: reuse as-is → recompose → swap adapter → extend → add the fewest new atoms.

It reuses the vocabulary and method of **deep modules**, emphasizing "narrow interface, deep behaviour", to avoid cutting a pile of shallow pass-through modules. An atomic module need not be small — it must be "not worth splitting for any caller".

---

## How to use

### 1. Install

Copy this repo's `SKILL.md` into your agent's **skills directory**. For example (DSH Desktop):

```
<harness>/skills/module-contract/
└── SKILL.md
```

### 2. Trigger

The skill is **model-invoked**: its description carries trigger words, so it fires automatically when you or your agent mentions:

> new feature · modularize · interface card · split into modules · reuse · compose · atomic module · composite module · module map

You can also trigger it manually by typing: `/module-contract`.

### 3. Decision mode

All module-split and reuse decisions default to **your confirmation** (a module list + interface-card drafts + reuse proposal; it writes only after you approve). To let it decide automatically, change the module map header to:

```
复用决策模式: auto
```

You can switch back to `confirm` at any time.

---

## Workflow

1. **Locate the project root and prior knowledge** — read `docs/modules/MODULE-MAP.md`, create a skeleton on first run; domain words are injected from the project's `CONTEXT.md`.
2. **Understand the new requirement** — pin down the behaviour boundary this feature must satisfy.
3. **Modularize** — cut candidate **atomic modules** and run each through the **deletion test**, **narrow-interface** and **can-be-deep** checks; atoms compose into **composite modules** via interfaces / seams, and each composite passes the **composite deletion test** before being named.
4. **Reuse analysis (decision ladder)** — judge from least to most invasive: **reuse as-is → recompose → swap adapter → extend → add the fewest new atoms**, then record the final four-way classification with reasons.
5. **Decision mode** — `confirm` waits for your approval, `auto` writes directly.
6. **Write the interface card** — one file per module, `docs/modules/<slug>.md`.
7. **Update `MODULE-MAP.md`** — index table + Mermaid dependency graph (out-edges = composite, no out-edges = atomic).
8. **Freshness check** — verify against code / types where possible; mark `⚠ unresolved` where not.

---

## Outputs

Interface card (one per module, 10 fields):

```
# <slug>
one-line responsibility / interface / inputs(+preconditions) / outputs(+postconditions)
dependencies / side-effects·external resources / non-functional / depth assessment / reuse status
```

Module map (`docs/modules/MODULE-MAP.md`):

```
# Module Map
复用决策模式: confirm | auto
## Modules           ← one row per module: ID / responsibility / status / dependencies
## Dependency graph  ← Mermaid graph TD (out-edges = composite, no out-edges = atomic)
```

---

## Example

The repo ships a runnable example so you can see the output at a glance:

- **[examples/order-service.md](examples/order-service.md)** — a complete **composite-module interface card** (order service: interface / preconditions / postconditions / dependencies / side-effects / non-functional / depth assessment).
- **[examples/MODULE-MAP.md](examples/MODULE-MAP.md)** — a page of **module map**: index table + Mermaid dependency graph + a reuse-analysis example (reuse `coupon` as-is, create new `order-service` composite).

---

## Glossary (from deep module + this skill's additions)

| Term | Meaning |
|---|---|
| **Atomic module** | A structural unit that depends on no other project module's interface; bounded below by the deletion test, may be deep |
| **Composite module** | A module that depends on other modules' interfaces and is composed of atoms/composites; has out-edges in the dependency graph |
| **Composite deletion test** | Delete a named composite: does its ordering/constraints spread to ≥2 callers? Then name it; otherwise keep it as wiring code |
| **Module** | Any unit with an interface and implementation (function / class / package / tier-spanning slice) |
| **Interface** | Everything a caller must know to use it correctly (signature + invariants + ordering + error modes…) |
| **Seam** | The location where a module's interface lives and behaviour can be swapped |
| **Adapter** | A concrete thing satisfying an interface at a seam |
| **Depth / Leverage** | Behaviour exercised per unit of interface; the narrower the interface, the deeper the module |
| **Deletion test** | Delete it: if complexity vanishes it's a pass-through; if it spreads to N callers it earns its keep |

---

## Design decisions

- **Design only, not implementation** — interface cards must be the single source of truth, decoupled from implementation.
- **Generic, not tied to a project** — paths are relative to the current repo (`docs/modules/…`); domain words come from the project's `CONTEXT.md`.
- **Machine-verifiable** — interface cards give a checkable acceptance basis, forming a verification loop with type-checking and contract tests.
- **Composition first** — check the map before work starts: reuse as-is when possible, compose existing atoms into a new composite when that covers it, and only then add new atoms.
- **Structural axis / decision axis separated** — atomic/composite describe what a module looks like; the four-way classification records what to do with it. No parallel vocabulary.

---

## License

[MIT](LICENSE)
