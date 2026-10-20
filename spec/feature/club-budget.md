# SPEC-GLAB-BUDGET-001: Club budget list

GLab owns club budget records in glab_budget_item. Bibliotheca remains responsible for holdings and loans.
Each row contains a stable UUID, fiscal year, label, allocated yen and spent yen.
Amounts are non-negative integers in yen, capped at 1,000,000,000 per row.
Remaining budget is allocated minus spent and may be negative.

Authenticated members can read the list; only GLab administrators can save rows.
PUT is idempotent for a supplied row UUID. The UI retains the UUID on a failed save.
The initial list is empty. Do not infer actual budgets or expenses from loans or metadata.
Existing rows can be edited; no delete or payment execution is introduced.
