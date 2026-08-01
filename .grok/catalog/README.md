# Arch Atlas catalog (architectural memory)

**Register, do not canonize.** Records are design evidence with explicit
`authority` and `state`. They are not automatic product law.

All durable design notes live under **`entries/`**.

| Authority     | How agents should treat it                        |
| ------------- | ------------------------------------------------- |
| `exploratory` | Optional context; never a requirement             |
| `advisory`    | Prefer unless invariants or code contradict       |
| `normative`   | Decision - only when user-elevated or established |

| State                               | Meaning                                |
| ----------------------------------- | -------------------------------------- |
| `active` / `dormant`                | Still design memory                    |
| `implemented` / `partial`           | Landed fully or partly                 |
| `rejected` / `superseded` / `stale` | Historical; still useful for _why not_ |

## Commands

```bash
/catalog .grok/catalog/entries/foo.md
/catalog this as an exploratory idea: …
catalog-index   # regenerate index.json + index.md
```

Sources: `.grok/catalog/entries/**` with frontmatter `id` + `kind`.

Index files are **generated** - edit entries, then run `catalog-index` if you use the index.
