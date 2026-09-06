---
name: Meeting time picker
description: Records the confirmed browser behavior and required meeting-time selection approach.
---

Use an explicit list of 15-minute meeting-time choices rather than relying on the native datetime-local `step` attribute.

**Why:** The live browser continued to show granular minute choices with a 900-second step. The user confirmed the explicit dropdown works well.

**How to apply:** Preserve the separate New Zealand date field and time dropdown with `:00`, `:15`, `:30`, and `:45` options when editing meeting scheduling UI.