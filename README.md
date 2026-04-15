# CoC Battle View

A small Obsidian plugin scaffold for Call of Cthulhu combats.

## What it does

- Opens a **Battle View** tab
- Lets you **drag markdown notes** with a `statblock` code fence into the view
- Parses the `name`, `dex`, `hp`, and `combat` entries from the statblock
- Sorts combatants by DEX / initiative
- Tracks rounds and current turn
- Lets you subtract or heal HP without changing the original note
- Renders the **original markdown note** in the center panel so your real statblock remains visible

## Expected statblock format

The parser expects a code block like:

```statblock
name: "Étienne Vallois"
characteristics:
  - dex: 70
hp: 12
sanity: 60
move: 8
damage bonus: "+1D4"
combat:
  - name: "Dolch"
    desc: "50%, Schaden 1D4+DB"
  - name: "Dodge"
    desc: "35%"
```

## build 
```npm build```

## Install for testing



Copy these files into:

`.obsidian/plugins/coc-battle-view/`

- manifest.json
- main.ts
- styles.css


