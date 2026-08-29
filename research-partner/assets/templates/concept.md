<%*
const kind = await tp.system.suggester(
  ["event", "concept", "pattern", "case-study"],
  ["event", "concept", "pattern", "case-study"]
);
const tag = await tp.system.suggester(__ANGLES__, __ANGLES__);
-%>
---
note-type: concept
concept-kind: <% kind %>
title: "<% tp.file.title %>"
aliases: ["<% tp.file.title %>"]
status: seed
confidence: 0.5
tags: [<% tag %>]
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
review-after: <% tp.date.now("YYYY-MM-DD", 90) %>

about: []
evidence: []
supports: []
contradicts: []
raises: []

asserted-by: user
extraction-run: manual
---

# <% tp.file.title %>


